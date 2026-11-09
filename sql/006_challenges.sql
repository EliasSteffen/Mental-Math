-- Gewertete Challenges: Daily mit einem Versuch, Wettbewerbe, Ranglisten, Gruppen (Supabase Postgres 15+). Idempotent.
-- Setzt voraus: packages/passkey-auth/sql/001_passkey_auth.sql (FK auf public.users).
-- Zugriff nur über die Pages Function /api/challenge (service_role, server/challenge.ts); anon/authenticated sehen nichts.
-- Die ganze Logik steckt in den Funktionen unten – der Server ruft nur sie auf (tests/challenge-sql.test.ts).
-- Plan und Regeln: docs/PLAN-wettbewerb.md.
--
-- Wettbewerb für alle anlegen (Aufgaben erzeugt der Server beim ersten Aufruf):
--   insert into public.challenges (id, kind, title, starts_at, ends_at, config, seed)
--   values ('comp-prozente-kw47', 'competition', '{"de":"Prozente-Woche","en":"Percentage week"}',
--           '2026-11-16 00:00 Europe/Berlin', '2026-11-23 00:00 Europe/Berlin',
--           '{"count":20,"level":2,"categories":["pct"]}', encode(gen_random_bytes(16), 'hex'));

create table if not exists public.challenge_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 30),
  code        text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  owner_id    uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.challenge_group_members (
  group_id    uuid not null references public.challenge_groups(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists challenge_group_members_user on public.challenge_group_members (user_id);

create table if not exists public.challenges (
  id          text primary key check (id ~ '^(daily-\d{4}-\d{2}-\d{2}|comp-[a-z0-9][a-z0-9-]{2,46})$'),
  kind        text not null check (kind in ('daily', 'competition')),
  title       jsonb check (title is null or jsonb_typeof(title) = 'object'),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  config      jsonb not null check (jsonb_typeof(config) = 'object'),
  seed        text not null check (char_length(seed) between 8 and 64),
  tasks       jsonb check (tasks is null or (jsonb_typeof(tasks) = 'object' and pg_column_size(tasks) <= 262144)),
  group_id    uuid references public.challenge_groups(id) on delete cascade,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((kind = 'daily') = (id like 'daily-%'))
);
create index if not exists challenges_ends_at on public.challenges (ends_at);
create index if not exists challenges_group on public.challenges (group_id) where group_id is not null;

create table if not exists public.challenge_attempts (
  challenge_id text not null references public.challenges(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  answers      jsonb check (answers is null or (jsonb_typeof(answers) = 'array' and pg_column_size(answers) <= 16384)),
  n            integer check (n is null or n between 0 and 30),
  correct      integer check (correct is null or correct >= 0),
  points       integer check (points is null or points >= 0),
  time_ms      bigint check (time_ms is null or time_ms >= 0),
  status       text not null default 'running' check (status in ('running', 'finished', 'expired', 'flagged')),
  primary key (challenge_id, user_id)        -- genau ein Versuch je Person und Challenge
);
create index if not exists challenge_attempts_rank
  on public.challenge_attempts (challenge_id, points desc, time_ms asc, finished_at asc) where status = 'finished';
create index if not exists challenge_attempts_user on public.challenge_attempts (user_id);

-- Öffentlicher Name; listed = Name in globalen Ranglisten zeigen (sonst „Anonym“). In Gruppen sehen Mitglieder den Namen.
create table if not exists public.challenge_profiles (
  user_id      uuid primary key references public.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 20),
  listed       boolean not null default false,
  updated_at   timestamptz not null default now()
);
create unique index if not exists challenge_profiles_name on public.challenge_profiles (lower(display_name));

alter table public.challenge_groups enable row level security;
alter table public.challenge_group_members enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_attempts enable row level security;
alter table public.challenge_profiles enable row level security;
revoke all on public.challenge_groups, public.challenge_group_members, public.challenges, public.challenge_attempts,
  public.challenge_profiles from anon, authenticated;
grant all on public.challenge_groups, public.challenge_group_members, public.challenges, public.challenge_attempts,
  public.challenge_profiles to service_role;
-- RLS an, KEINE Policies -> für anon/authenticated unsichtbar

/* ---------- Challenges ---------- */

create or replace function public.challenge_get(p_id text)
returns setof public.challenges
language sql stable set search_path = ''
as $$ select * from public.challenges where id = p_id $$;

-- Anlegen, falls es sie noch nicht gibt (parallele Aufrufe: alle bekommen dieselbe Zeile). Eine neue Daily räumt
-- nebenbei auf: Challenges (samt Versuchen) mit Ende vor mehr als 400 Tagen werden gelöscht (Datenschutz: 12 Monate).
create or replace function public.challenge_create(
  p_id text, p_kind text, p_title jsonb, p_starts_at timestamptz, p_ends_at timestamptz, p_config jsonb, p_seed text,
  p_tasks jsonb, p_group uuid, p_created_by uuid
)
returns setof public.challenges
language plpgsql set search_path = ''
as $$
declare
  v_new boolean;
begin
  insert into public.challenges (id, kind, title, starts_at, ends_at, config, seed, tasks, group_id, created_by)
  values (p_id, p_kind, p_title, p_starts_at, p_ends_at, p_config, p_seed, p_tasks, p_group, p_created_by)
  on conflict (id) do nothing
  returning true into v_new;
  if v_new and p_kind = 'daily' then
    delete from public.challenges where ends_at < now() - interval '400 days';
  end if;
  return query select * from public.challenges where id = p_id;
end;
$$;

-- Aufgaben nachtragen (per SQL angelegte Wettbewerbe); vorhandene bleiben unverändert
create or replace function public.challenge_set_tasks(p_id text, p_tasks jsonb)
returns setof public.challenges
language sql set search_path = ''
as $$
  update public.challenges set tasks = p_tasks where id = p_id and tasks is null;
  select * from public.challenges where id = p_id;
$$;

-- Wettbewerbe für eine Person: alle offenen ohne Gruppe und die ihrer Gruppen; von 3 Tagen nach Ende bis 7 Tage vor Start
create or replace function public.challenge_list(p_user uuid, p_now timestamptz)
returns table (
  id text, kind text, title jsonb, starts_at timestamptz, ends_at timestamptz, config jsonb, group_id uuid,
  group_name text, participants bigint
)
language sql stable set search_path = ''
as $$
  select c.id, c.kind, c.title, c.starts_at, c.ends_at, c.config, c.group_id, g.name,
    (select count(*) from public.challenge_attempts a where a.challenge_id = c.id and a.status = 'finished')
  from public.challenges c
  left join public.challenge_groups g on g.id = c.group_id
  where c.kind = 'competition'
    and c.ends_at > p_now - interval '3 days'
    and c.starts_at < p_now + interval '7 days'
    and (c.group_id is null or exists (
      select 1 from public.challenge_group_members m where m.group_id = c.group_id and m.user_id = p_user))
  order by c.ends_at, c.id
  limit 50
$$;

create or replace function public.challenge_counts(p_ids text[])
returns table (challenge_id text, participants bigint)
language sql stable set search_path = ''
as $$
  select i.id, (select count(*) from public.challenge_attempts a where a.challenge_id = i.id and a.status = 'finished')
  from unnest(p_ids) as i(id)
$$;

/* ---------- Versuche ---------- */

create or replace function public.challenge_attempt_get(p_challenge text, p_user uuid)
returns setof public.challenge_attempts
language sql stable set search_path = ''
as $$ select * from public.challenge_attempts where challenge_id = p_challenge and user_id = p_user $$;

-- Genau ein Versuch: legt ihn an oder liefert den vorhandenen (created = false). Prüft Zeitraum und Gruppe.
create or replace function public.challenge_attempt_start(p_challenge text, p_user uuid, p_now timestamptz)
returns table (outcome text, started_at timestamptz, status text)
language plpgsql set search_path = ''
as $$
declare
  c public.challenges;
  v_started timestamptz;
begin
  select * into c from public.challenges where id = p_challenge;
  if not found then
    return query select 'not_found'::text, null::timestamptz, null::text;
    return;
  end if;
  if c.group_id is not null and not exists (
    select 1 from public.challenge_group_members m where m.group_id = c.group_id and m.user_id = p_user) then
    return query select 'not_member'::text, null::timestamptz, null::text;
    return;
  end if;
  insert into public.challenge_attempts as a (challenge_id, user_id, started_at)
  select p_challenge, p_user, p_now
  where p_now >= c.starts_at and p_now < c.ends_at
  on conflict (challenge_id, user_id) do nothing
  returning a.started_at into v_started;
  if v_started is not null then
    return query select 'created'::text, v_started, 'running'::text;
    return;
  end if;
  return query
    select 'exists'::text, a.started_at, a.status from public.challenge_attempts a
    where a.challenge_id = p_challenge and a.user_id = p_user;
  if not found then
    return query select (case when p_now < c.starts_at then 'upcoming' else 'closed' end)::text, null::timestamptz, null::text;
  end if;
end;
$$;

-- Abgabe: nur ein laufender Versuch wird abgeschlossen; danach unveränderlich (liefert immer die gespeicherte Zeile)
create or replace function public.challenge_attempt_finish(
  p_challenge text, p_user uuid, p_now timestamptz, p_answers jsonb, p_n integer, p_correct integer, p_points integer,
  p_time_ms bigint, p_status text
)
returns setof public.challenge_attempts
language sql set search_path = ''
as $$
  update public.challenge_attempts
  set finished_at = p_now, answers = p_answers, n = p_n, correct = p_correct, points = p_points, time_ms = p_time_ms,
      status = p_status
  where challenge_id = p_challenge and user_id = p_user and status = 'running'
    and p_status in ('finished', 'expired', 'flagged');
  select * from public.challenge_attempts where challenge_id = p_challenge and user_id = p_user;
$$;

/* ---------- Ranglisten ---------- */

-- Rangliste einer Challenge: alle abgeschlossenen Versuche (ohne markierte), Rang nach Punkten, Zeit, Abgabe.
-- Name nur bei listed (global) bzw. für Mitglieder (p_group), sonst null (= „Anonym“). Top p_limit und die eigene Zeile.
create or replace function public.challenge_board(p_challenge text, p_user uuid, p_group uuid, p_limit integer)
returns table (rank bigint, display_name text, points integer, time_ms bigint, correct integer, days bigint,
  is_me boolean, total bigint)
language sql stable set search_path = ''
as $$
  with e as (
    select a.user_id, a.points, a.time_ms, a.correct, a.finished_at,
      case when p.listed or p_group is not null or a.user_id = p_user then p.display_name end as name
    from public.challenge_attempts a
    left join public.challenge_profiles p on p.user_id = a.user_id
    where a.challenge_id = p_challenge and a.status = 'finished'
      and (p_group is null or exists (
        select 1 from public.challenge_group_members m where m.group_id = p_group and m.user_id = a.user_id))
  ), r as (
    select e.*, row_number() over (order by e.points desc, e.time_ms asc, e.finished_at asc, e.user_id) as rnk,
      count(*) over () as n
    from e
  )
  select r.rnk, r.name, r.points, r.time_ms, r.correct, 1::bigint, coalesce(r.user_id = p_user, false), r.n
  from r
  where r.rnk <= greatest(1, least(p_limit, 200)) or r.user_id = p_user
  order by r.rnk
$$;

-- Wochen-Rangliste: Summe über die Dailys p_ids (Mo–So), Rang nach Punkten, dann Zeit, dann mehr gespielte Tage
create or replace function public.challenge_week_board(p_ids text[], p_user uuid, p_group uuid, p_limit integer)
returns table (rank bigint, display_name text, points integer, time_ms bigint, correct integer, days bigint,
  is_me boolean, total bigint)
language sql stable set search_path = ''
as $$
  with s as (
    select a.user_id, sum(a.points)::integer as points, sum(a.time_ms)::bigint as time_ms,
      sum(a.correct)::integer as correct, count(*) as days, max(a.finished_at) as last_at
    from public.challenge_attempts a
    where a.challenge_id = any(p_ids) and a.status = 'finished'
      and (p_group is null or exists (
        select 1 from public.challenge_group_members m where m.group_id = p_group and m.user_id = a.user_id))
    group by a.user_id
  ), r as (
    select s.*, case when p.listed or p_group is not null or s.user_id = p_user then p.display_name end as name,
      row_number() over (order by s.points desc, s.time_ms asc, s.days desc, s.last_at asc, s.user_id) as rnk,
      count(*) over () as n
    from s
    left join public.challenge_profiles p on p.user_id = s.user_id
  )
  select r.rnk, r.name, r.points, r.time_ms, r.correct, r.days, coalesce(r.user_id = p_user, false), r.n
  from r
  where r.rnk <= greatest(1, least(p_limit, 200)) or r.user_id = p_user
  order by r.rnk
$$;

/* ---------- Profil ---------- */

create or replace function public.challenge_profile_get(p_user uuid)
returns setof public.challenge_profiles
language sql stable set search_path = ''
as $$ select * from public.challenge_profiles where user_id = p_user $$;

-- Name schon vergeben (Groß/Klein egal) -> unique_violation (23505)
create or replace function public.challenge_profile_put(p_user uuid, p_name text, p_listed boolean)
returns setof public.challenge_profiles
language sql set search_path = ''
as $$
  insert into public.challenge_profiles (user_id, display_name, listed, updated_at)
  values (p_user, p_name, p_listed, now())
  on conflict (user_id) do update set display_name = excluded.display_name, listed = excluded.listed, updated_at = now();
  select * from public.challenge_profiles where user_id = p_user;
$$;

/* ---------- Gruppen ---------- */

create or replace function public.challenge_groups_of(p_user uuid)
returns table (id uuid, name text, code text, owner boolean, members bigint)
language sql stable set search_path = ''
as $$
  select g.id, g.name, g.code, g.owner_id = p_user,
    (select count(*) from public.challenge_group_members x where x.group_id = g.id)
  from public.challenge_group_members m
  join public.challenge_groups g on g.id = m.group_id
  where m.user_id = p_user
  order by m.joined_at, g.id
$$;

create or replace function public.challenge_membership(p_user uuid, p_group uuid)
returns table (member boolean, owner boolean)
language sql stable set search_path = ''
as $$
  select exists (select 1 from public.challenge_group_members m where m.group_id = p_group and m.user_id = p_user),
    exists (select 1 from public.challenge_groups g where g.id = p_group and g.owner_id = p_user)
$$;

-- Gruppe anlegen (die Person ist Mitglied und Besitzerin). outcome: created | too_many; Code vergeben -> 23505
create or replace function public.challenge_group_create(p_user uuid, p_name text, p_code text, p_max_groups integer)
returns table (outcome text, id uuid)
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select count(*) from public.challenge_group_members m where m.user_id = p_user) >= p_max_groups then
    return query select 'too_many'::text, null::uuid;
    return;
  end if;
  insert into public.challenge_groups (name, code, owner_id) values (p_name, p_code, p_user) returning challenge_groups.id into v_id;
  insert into public.challenge_group_members (group_id, user_id) values (v_id, p_user);
  return query select 'created'::text, v_id;
end;
$$;

-- Beitreten per Code. outcome: joined | already | not_found | full | too_many
create or replace function public.challenge_group_join(p_user uuid, p_code text, p_max_members integer, p_max_groups integer)
returns table (outcome text, id uuid)
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
begin
  select g.id into v_id from public.challenge_groups g where g.code = p_code for update;
  if v_id is null then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if exists (select 1 from public.challenge_group_members m where m.group_id = v_id and m.user_id = p_user) then
    return query select 'already'::text, v_id;
    return;
  end if;
  if (select count(*) from public.challenge_group_members m where m.user_id = p_user) >= p_max_groups then
    return query select 'too_many'::text, null::uuid;
    return;
  end if;
  if (select count(*) from public.challenge_group_members m where m.group_id = v_id) >= p_max_members then
    return query select 'full'::text, v_id;
    return;
  end if;
  insert into public.challenge_group_members (group_id, user_id) values (v_id, p_user) on conflict do nothing;
  return query select 'joined'::text, v_id;
end;
$$;

-- Verlassen; verlässt die Besitzerin die Gruppe, wird sie für alle gelöscht. outcome: left | deleted | not_member
create or replace function public.challenge_group_leave(p_user uuid, p_group uuid)
returns table (outcome text)
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.challenge_groups g where g.id = p_group and g.owner_id = p_user) then
    delete from public.challenge_groups where id = p_group;
    return query select 'deleted'::text;
    return;
  end if;
  delete from public.challenge_group_members where group_id = p_group and user_id = p_user;
  if found then
    return query select 'left'::text;
  else
    return query select 'not_member'::text;
  end if;
end;
$$;

/* ---------- Rechte: nur service_role ---------- */

do $$
declare
  f text;
begin
  foreach f in array array[
    'challenge_get(text)',
    'challenge_create(text, text, jsonb, timestamptz, timestamptz, jsonb, text, jsonb, uuid, uuid)',
    'challenge_set_tasks(text, jsonb)',
    'challenge_list(uuid, timestamptz)',
    'challenge_counts(text[])',
    'challenge_attempt_get(text, uuid)',
    'challenge_attempt_start(text, uuid, timestamptz)',
    'challenge_attempt_finish(text, uuid, timestamptz, jsonb, integer, integer, integer, bigint, text)',
    'challenge_board(text, uuid, uuid, integer)',
    'challenge_week_board(text[], uuid, uuid, integer)',
    'challenge_profile_get(uuid)',
    'challenge_profile_put(uuid, text, boolean)',
    'challenge_groups_of(uuid)',
    'challenge_membership(uuid, uuid)',
    'challenge_group_create(uuid, text, text, integer)',
    'challenge_group_join(uuid, text, integer, integer)',
    'challenge_group_leave(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$$;
