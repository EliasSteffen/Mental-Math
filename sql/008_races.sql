-- Raketen-Rennen in Gruppen: Geister-Rennen (jeder spielt, wann er will, gegen die Aufzeichnungen der anderen) und die
-- Grundlage der Live-Rennen (Supabase Postgres 15+). Idempotent, nur hinzufügend.
-- Setzt voraus: packages/passkey-auth/sql/001_passkey_auth.sql (FK auf public.users) und sql/006_challenges.sql
-- (challenge_groups, challenge_group_members, challenge_profiles).
-- Zugriff nur über die Pages Function /api/challenge (service_role, server/race.ts); anon/authenticated sehen nichts.
-- Jede Funktion prüft die Mitgliedschaft in der Gruppe des Rennens. Gewertet wird im Server (er erzeugt die Aufgaben aus dem
-- Seed und bewertet die Antworten neu); hier steht nur die Zeitleiste [[ms, 0|1], …] jedes Laufs – keine Eingaben.
-- Plan und Schnittstelle: docs/PLAN-v12-rennen.md (§3, §3a).

create table if not exists public.races (
  id          text primary key check (id ~ '^[a-z0-9]{12}$'),
  group_id    uuid not null references public.challenge_groups(id) on delete cascade,
  created_by  uuid references public.users(id) on delete set null,
  kind        text not null check (kind in ('ghost', 'live')),
  config      jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 256),
  seed        bigint not null check (seed between 0 and 4294967295),       -- 32-Bit-Seed des Aufgabenstroms
  created_at  timestamptz not null default now(),
  starts_at   timestamptz,                                                 -- nur Live: gemeinsamer Start (nach „go“)
  ends_at     timestamptz not null,
  check (ends_at > created_at),
  check (kind = 'live' or starts_at is null)
);
create index if not exists races_group on public.races (group_id, ends_at desc);

create table if not exists public.race_runs (
  race_id      text not null references public.races(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  started_at   timestamptz not null,
  finished_at  timestamptz,
  answers      jsonb check (answers is null or (jsonb_typeof(answers) = 'array' and pg_column_size(answers) <= 32768)),
  correct      integer check (correct is null or correct between 0 and 150),
  wrong        integer check (wrong is null or wrong between 0 and 150),
  last_ok_ms   integer check (last_ok_ms is null or last_ok_ms between 0 and 3600000),
  status       text not null default 'running' check (status in ('running', 'finished', 'expired', 'flagged')),
  primary key (race_id, user_id)        -- genau ein Lauf je Person und Rennen
);
create index if not exists race_runs_user on public.race_runs (user_id);

alter table public.races enable row level security;
alter table public.race_runs enable row level security;
revoke all on public.races, public.race_runs from anon, authenticated;
grant all on public.races, public.race_runs to service_role;
-- RLS an, KEINE Policies -> für anon/authenticated unsichtbar

/* ---------- Anlegen ---------- */

-- Rennen anlegen (Mitglied der Gruppe, höchstens p_max_open offene je Gruppe – offen = ends_at > p_now, beider Arten).
-- outcome: created | not_member | too_many. Nebenbei: Rennen mit Ende vor mehr als p_keep_days Tagen werden gelöscht.
create or replace function public.race_create(
  p_id text, p_group uuid, p_user uuid, p_kind text, p_config jsonb, p_seed bigint, p_now timestamptz,
  p_ends_at timestamptz, p_max_open integer, p_keep_days integer
)
returns table (outcome text, id text)
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.challenge_group_members m where m.group_id = p_group and m.user_id = p_user) then
    return query select 'not_member'::text, null::text;
    return;
  end if;
  perform 1 from public.challenge_groups g where g.id = p_group for update;   -- parallele Aufrufe nacheinander zählen
  if (select count(*) from public.races r where r.group_id = p_group and r.ends_at > p_now) >= p_max_open then
    return query select 'too_many'::text, null::text;
    return;
  end if;
  insert into public.races (id, group_id, created_by, kind, config, seed, created_at, starts_at, ends_at)
  values (p_id, p_group, p_user, p_kind, p_config, p_seed, p_now, null, p_ends_at);
  delete from public.races r where r.ends_at < p_now - make_interval(days => p_keep_days);
  return query select 'created'::text, p_id;
end;
$$;

/* ---------- Lesen ---------- */

-- Ein Rennen mit eigenem Lauf. member = false: es kommen nur id, group_id und member zurück (kein Inhalt für Fremde);
-- kein Rennen -> keine Zeile. Basis von `info` und GET /race/:id.
create or replace function public.race_get(p_race text, p_user uuid)
returns table (
  id text, group_id uuid, created_by uuid, created_by_name text, kind text, config jsonb, seed bigint, created_at timestamptz,
  starts_at timestamptz, ends_at timestamptz, member boolean, my_status text, my_started_at timestamptz
)
language sql stable set search_path = ''
as $$
  with r as (
    select x.*, exists (select 1 from public.challenge_group_members m where m.group_id = x.group_id and m.user_id = p_user) as is_member
    from public.races x where x.id = p_race
  )
  select r.id, r.group_id,
    case when r.is_member then r.created_by end,
    case when r.is_member then (select p.display_name from public.challenge_profiles p where p.user_id = r.created_by) end,
    case when r.is_member then r.kind end, case when r.is_member then r.config end, case when r.is_member then r.seed end,
    case when r.is_member then r.created_at end, case when r.is_member then r.starts_at end,
    case when r.is_member then r.ends_at end, r.is_member,
    case when r.is_member then (select u.status from public.race_runs u where u.race_id = r.id and u.user_id = p_user) end,
    case when r.is_member then (select u.started_at from public.race_runs u where u.race_id = r.id and u.user_id = p_user) end
  from r
$$;

-- Offene Rennen der Gruppe (ends_at > p_now) und die letzten p_ended beendeten (nur solche mit mindestens einem gewerteten
-- Lauf – eine Live-Lobby ohne Start soll nicht ewig in der Liste stehen), mit eigenem Status. Kein Mitglied -> keine Zeilen.
create or replace function public.race_list(p_group uuid, p_user uuid, p_now timestamptz, p_ended integer)
returns table (
  id text, group_id uuid, created_by uuid, created_by_name text, kind text, config jsonb, seed bigint, created_at timestamptz,
  starts_at timestamptz, ends_at timestamptz, my_status text, runs bigint
)
language sql stable set search_path = ''
as $$
  with m as (
    select 1 as ok where exists (select 1 from public.challenge_group_members x where x.group_id = p_group and x.user_id = p_user)
  ), base as (
    select r.*, (select count(*) from public.race_runs u where u.race_id = r.id and u.status = 'finished') as n,
      (select u.status from public.race_runs u where u.race_id = r.id and u.user_id = p_user) as mine
    from public.races r, m
    where r.group_id = p_group
  ), open_ as (
    select b.* from base b where b.ends_at > p_now
  ), ended as (
    select b.* from base b where b.ends_at <= p_now and b.n > 0 order by b.ends_at desc, b.id limit greatest(p_ended, 0)
  ), u as (
    select o.*, 0 as grp from open_ o union all select e.*, 1 as grp from ended e
  )
  select u.id, u.group_id, u.created_by, (select p.display_name from public.challenge_profiles p where p.user_id = u.created_by),
    u.kind, u.config, u.seed, u.created_at, u.starts_at, u.ends_at, u.mine, u.n
  from u
  order by u.grp, case when u.grp = 0 then u.ends_at end asc, case when u.grp = 1 then u.ends_at end desc, u.id
$$;

-- Rangliste: nur gewertete Läufe (finished). Rang nach richtig (mehr), falsch (weniger), Zeit der letzten richtigen
-- (früher); wer in allen dreien gleichauf liegt, teilt den Rang (wie raceRanking im Client). Namen sehen Mitglieder immer.
-- Kein Mitglied -> keine Zeilen.
create or replace function public.race_board(p_race text, p_user uuid)
returns table (rank bigint, display_name text, is_me boolean, correct integer, wrong integer, last_ok_ms integer, status text, steps jsonb)
language sql stable set search_path = ''
as $$
  select rank() over (order by u.correct desc, u.wrong asc, u.last_ok_ms asc), p.display_name, u.user_id = p_user,
    u.correct, u.wrong, u.last_ok_ms, u.status, coalesce(u.answers, '[]'::jsonb)
  from public.race_runs u
  join public.races r on r.id = u.race_id
  left join public.challenge_profiles p on p.user_id = u.user_id
  where u.race_id = p_race and u.status = 'finished'
    and exists (select 1 from public.challenge_group_members m where m.group_id = r.group_id and m.user_id = p_user)
  order by 1, u.finished_at, u.user_id
$$;

-- Wer noch fehlt: Namen der Gruppenmitglieder ohne gewerteten Lauf (Anzeigename aus challenge_profiles, ohne Namen entfallen sie).
-- Kein Mitglied -> keine Zeilen.
create or replace function public.race_missing(p_race text, p_user uuid)
returns table (display_name text)
language sql stable set search_path = ''
as $$
  select p.display_name
  from public.races r
  join public.challenge_group_members m on m.group_id = r.group_id
  join public.challenge_profiles p on p.user_id = m.user_id
  where r.id = p_race
    and exists (select 1 from public.challenge_group_members x where x.group_id = r.group_id and x.user_id = p_user)
    and not exists (select 1 from public.race_runs u where u.race_id = r.id and u.user_id = m.user_id and u.status = 'finished')
  order by lower(p.display_name), m.user_id
$$;

/* ---------- Lauf ---------- */

-- Lauf beginnen (einmal je Person). Geister: ab jetzt, solange das Rennen offen ist (started_at = p_now). Live: erst nach
-- „go“ (starts_at gesetzt), started_at = starts_at. outcome: created | already | not_found | not_member | closed | upcoming.
create or replace function public.race_run_start(p_race text, p_user uuid, p_now timestamptz)
returns table (outcome text, started_at timestamptz, status text)
language plpgsql set search_path = ''
as $$
declare
  r public.races;
  v_started timestamptz;
begin
  select * into r from public.races x where x.id = p_race;
  if not found then
    return query select 'not_found'::text, null::timestamptz, null::text;
    return;
  end if;
  if not exists (select 1 from public.challenge_group_members m where m.group_id = r.group_id and m.user_id = p_user) then
    return query select 'not_member'::text, null::timestamptz, null::text;
    return;
  end if;
  return query select 'already'::text, u.started_at, u.status from public.race_runs u where u.race_id = p_race and u.user_id = p_user;
  if found then return; end if;
  if r.kind = 'live' and r.starts_at is null then
    return query select 'upcoming'::text, null::timestamptz, null::text;
    return;
  end if;
  if p_now >= r.ends_at then
    return query select 'closed'::text, null::timestamptz, null::text;
    return;
  end if;
  insert into public.race_runs as u (race_id, user_id, started_at)
  values (p_race, p_user, case when r.kind = 'live' then r.starts_at else p_now end)
  on conflict (race_id, user_id) do nothing
  returning u.started_at into v_started;
  if v_started is null then
    return query select 'already'::text, u.started_at, u.status from public.race_runs u where u.race_id = p_race and u.user_id = p_user;
  else
    return query select 'created'::text, v_started, 'running'::text;
  end if;
end;
$$;

-- Abgabe: nur ein laufender Lauf wird abgeschlossen, danach unveränderlich (liefert immer die gespeicherte Zeile).
-- Live ohne vorherigen Start-Aufruf: der Lauf entsteht hier mit started_at = starts_at. Geister brauchen einen Start (no_run).
-- outcome: saved | already | no_run | not_found | not_member | not_started (Live vor „go“).
create or replace function public.race_run_finish(
  p_race text, p_user uuid, p_now timestamptz, p_steps jsonb, p_correct integer, p_wrong integer, p_last_ok_ms integer, p_status text
)
returns table (outcome text, status text, correct integer, wrong integer, last_ok_ms integer, started_at timestamptz)
language plpgsql set search_path = ''
as $$
declare
  r public.races;
  v_ok boolean;
begin
  select * into r from public.races x where x.id = p_race;
  if not found then
    return query select 'not_found'::text, null::text, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;
  if not exists (select 1 from public.challenge_group_members m where m.group_id = r.group_id and m.user_id = p_user) then
    return query select 'not_member'::text, null::text, null::integer, null::integer, null::integer, null::timestamptz;
    return;
  end if;
  if p_status not in ('finished', 'expired', 'flagged') then
    raise exception 'race: bad status' using errcode = '23514';
  end if;
  if r.kind = 'live' then
    if r.starts_at is null then
      return query select 'not_started'::text, null::text, null::integer, null::integer, null::integer, null::timestamptz;
      return;
    end if;
    insert into public.race_runs (race_id, user_id, started_at) values (p_race, p_user, r.starts_at)
    on conflict (race_id, user_id) do nothing;
  end if;
  update public.race_runs u
  set finished_at = p_now, answers = p_steps, correct = p_correct, wrong = p_wrong, last_ok_ms = p_last_ok_ms, status = p_status
  where u.race_id = p_race and u.user_id = p_user and u.status = 'running'
  returning true into v_ok;
  if v_ok is true then
    return query select 'saved'::text, u.status, u.correct, u.wrong, u.last_ok_ms, u.started_at
      from public.race_runs u where u.race_id = p_race and u.user_id = p_user;
    return;
  end if;
  return query select 'already'::text, u.status, u.correct, u.wrong, u.last_ok_ms, u.started_at
    from public.race_runs u where u.race_id = p_race and u.user_id = p_user;
  if not found then
    return query select 'no_run'::text, null::text, null::integer, null::integer, null::integer, null::timestamptz;
  end if;
end;
$$;

-- Live: Start setzen (jedes Mitglied, einmal, solange die Lobby offen ist): starts_at = jetzt + p_lead_ms,
-- ends_at = starts_at + Dauer + p_tail_ms. outcome: set | already | closed | not_live | not_found | not_member.
create or replace function public.race_go(p_race text, p_user uuid, p_now timestamptz, p_lead_ms integer, p_tail_ms integer)
returns table (outcome text, starts_at timestamptz)
language plpgsql set search_path = ''
as $$
declare
  r public.races;
  v_start timestamptz;
begin
  select * into r from public.races x where x.id = p_race for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if not exists (select 1 from public.challenge_group_members m where m.group_id = r.group_id and m.user_id = p_user) then
    return query select 'not_member'::text, null::timestamptz;
    return;
  end if;
  if r.kind <> 'live' then
    return query select 'not_live'::text, null::timestamptz;
    return;
  end if;
  if r.starts_at is not null then
    return query select 'already'::text, r.starts_at;
    return;
  end if;
  if p_now >= r.ends_at then
    return query select 'closed'::text, null::timestamptz;
    return;
  end if;
  v_start := p_now + make_interval(secs => p_lead_ms / 1000.0);
  update public.races x
  set starts_at = v_start,
      ends_at = v_start + make_interval(secs => ((x.config ->> 'durationS')::integer) + p_tail_ms / 1000.0)
  where x.id = p_race;
  return query select 'set'::text, v_start;
end;
$$;

/* ---------- Rechte: nur service_role ---------- */

do $$
declare
  f text;
begin
  foreach f in array array[
    'race_create(text, uuid, uuid, text, jsonb, bigint, timestamptz, timestamptz, integer, integer)',
    'race_get(text, uuid)',
    'race_list(uuid, uuid, timestamptz, integer)',
    'race_board(text, uuid)',
    'race_missing(text, uuid)',
    'race_run_start(text, uuid, timestamptz)',
    'race_run_finish(text, uuid, timestamptz, jsonb, integer, integer, integer, text)',
    'race_go(text, uuid, timestamptz, integer, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$$;
