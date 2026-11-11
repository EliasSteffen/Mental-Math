-- Liga-Wertung und Champion (Supabase Postgres 15+). Idempotent, nur hinzufügend.
-- Setzt voraus: packages/passkey-auth/sql/001_passkey_auth.sql (FK auf public.users) und sql/006_challenges.sql
-- (challenge_attempts, challenge_profiles).
-- Zugriff nur über die Pages Function /api/challenge (service_role, server/league.ts); anon/authenticated sehen nichts.
-- Die Wertung (0–1000) meldet das Gerät; Schutz gegen Manipulation: höchstens p_max_daily_gain LP Zuwachs pro Tag
-- (Berliner Kalendertag) und Champion nur mit mindestens p_min_ranked beendeten gewerteten Dailys in den letzten
-- p_active_days Tagen (challenge_attempts sind server-geprüft). Anzahl der Champions: Pages-Variable CHAMPION_COUNT.

create table if not exists public.league_scores (
  user_id           uuid primary key references public.users(id) on delete cascade,
  rating            integer not null check (rating between 0 and 1000),
  tier              smallint not null check (tier between 0 and 15),
  updated_at        timestamptz not null default now(),
  day_key           date not null,                                           -- Berliner Tag der letzten Meldung
  day_start_rating  integer not null check (day_start_rating between 0 and 1000)  -- Wertung zu Tagesbeginn (Bezug für den Zuwachs)
);
create index if not exists league_scores_rating on public.league_scores (rating desc, updated_at asc);

alter table public.league_scores enable row level security;
revoke all on public.league_scores from anon, authenticated;
grant all on public.league_scores to service_role;
-- RLS an, KEINE Policies -> für anon/authenticated unsichtbar

/* ---------- Wertung melden ---------- */

-- Upsert mit Plausibilität: Neue Wertung höchstens day_start_rating + p_max_daily_gain (erste Meldung: Bezug 0).
-- Sinkt die Wertung, gilt sie sofort. Liefert die gespeicherte Wertung; capped = true, wenn gekürzt wurde
-- (dann bleibt die Stufe der Zeile unverändert). Stufe/Wertung außerhalb 0–15 / 0–1000 -> check_violation.
create or replace function public.league_put(p_user uuid, p_rating integer, p_tier smallint, p_max_daily_gain integer)
returns table (rating integer, tier smallint, capped boolean)
language plpgsql set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Berlin')::date;
  r public.league_scores;
  v_start integer;
  v_new integer;
  v_capped boolean;
begin
  if p_rating is null or p_rating < 0 or p_rating > 1000 or p_tier is null or p_tier < 0 or p_tier > 15 then
    raise exception 'league: out of range' using errcode = '23514';
  end if;
  -- Grundzeile (parallele Aufrufe: genau eine), dann sperren
  insert into public.league_scores (user_id, rating, tier, updated_at, day_key, day_start_rating)
  values (p_user, 0, 0, now(), v_day, 0)
  on conflict (user_id) do nothing;
  select * into r from public.league_scores s where s.user_id = p_user for update;
  v_start := case when r.day_key = v_day then r.day_start_rating else r.rating end;
  v_new := least(p_rating, v_start + greatest(p_max_daily_gain, 0));
  v_capped := v_new < p_rating;
  update public.league_scores s
  set rating = v_new, tier = case when v_capped then s.tier else p_tier end, updated_at = now(),
      day_key = v_day, day_start_rating = v_start
  where s.user_id = p_user;
  return query select s.rating, s.tier, v_capped from public.league_scores s where s.user_id = p_user;
end;
$$;

/* ---------- Champions ---------- */

-- Die besten Konten ab p_min_rating (Meister), die in den letzten p_active_days Tagen gemeldet und mindestens
-- p_min_ranked gewertete Dailys beendet haben. Rang nach rating desc, updated_at asc (früher erreicht gewinnt).
-- Name nur bei listed oder für die eigene Zeile (sonst null = „Anonym“). Top p_limit (1–1000) und die eigene Zeile;
-- die eigene Zeile hat rank = null, wenn sie (noch) nicht zählt. total = Anzahl zählender Konten.
create or replace function public.league_champions(
  p_min_rating integer, p_limit integer, p_user uuid, p_active_days integer, p_min_ranked integer
)
returns table (rank bigint, display_name text, rating integer, is_me boolean, total bigint)
language sql stable set search_path = ''
as $$
  with e as (
    select s.user_id, s.rating, s.updated_at,
      (s.rating >= p_min_rating
        and s.updated_at >= now() - make_interval(days => p_active_days)
        and (select count(*) from public.challenge_attempts a
             where a.user_id = s.user_id and a.status = 'finished'
               and a.finished_at >= now() - make_interval(days => p_active_days)) >= p_min_ranked) as ok
    from public.league_scores s
    where s.rating >= p_min_rating or s.user_id = p_user
  ), r as (
    select e.*,
      case when e.ok then row_number() over (partition by e.ok order by e.rating desc, e.updated_at asc, e.user_id) end as rnk,
      count(*) filter (where e.ok) over () as n
    from e
  )
  select r.rnk, case when p.listed or r.user_id = p_user then p.display_name end, r.rating,
    coalesce(r.user_id = p_user, false), r.n
  from r
  left join public.challenge_profiles p on p.user_id = r.user_id
  where (r.rnk is not null and r.rnk <= greatest(1, least(p_limit, 1000))) or r.user_id = p_user
  order by r.rnk nulls last
$$;

/* ---------- Rechte: nur service_role ---------- */

do $$
declare
  f text;
begin
  foreach f in array array[
    'league_put(uuid, integer, smallint, integer)',
    'league_champions(integer, integer, uuid, integer, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end
$$;
