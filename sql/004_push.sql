-- Push-Erinnerungen: Abos, Zeitplan, VAPID-Schlüssel (Supabase Postgres 15+, Schema public). Idempotent.
-- Unabhängig von den anderen Skripten. Zugriff nur über die Pages Function /api/push (service_role); anon/authenticated sehen nichts.
-- Danach für den Takt: sql/005_push_cron.sql.

create table if not exists public.push_subscriptions (    -- nur service_role
  id            uuid primary key,                            -- vom Gerät erzeugt
  secret_hash   text not null check (char_length(secret_hash) = 43),  -- SHA-256 (base64url) des Geräte-Geheimnisses
  endpoint      text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1024),
  p256dh        text not null check (char_length(p256dh) between 80 and 100),
  auth          text not null check (char_length(auth) between 16 and 32),
  tz            text not null default 'UTC' check (char_length(tz) between 1 and 64),
  lang          text not null default 'de' check (lang in ('de','en')),
  prefs         jsonb not null default '{}' check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) <= 2048),
  state         jsonb check (state is null or (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 2048)),
  sched         jsonb not null default '{}' check (jsonb_typeof(sched) = 'object' and pg_column_size(sched) <= 1024),
  next_at       timestamptz,                               -- frühester geplanter Zeitpunkt; null = nichts geplant
  last_sent_at  timestamptz,
  last_review_at timestamptz,                              -- Wiederholungs-Erinnerung höchstens einmal pro Tag
  last_test_at  timestamptz,
  failures      integer not null default 0 check (failures >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_next_at on public.push_subscriptions (next_at) where next_at is not null;

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;
-- RLS an, KEINE Policies -> für anon/authenticated unsichtbar

-- Eine Zeile: VAPID-Schlüssel (erzeugt der Server beim ersten Aufruf), Token und Adresse für den Cron-Takt
create table if not exists public.push_config (            -- nur service_role (und der Cron-Job als postgres)
  id          smallint primary key default 1 check (id = 1),
  vapid       jsonb check (vapid is null or jsonb_typeof(vapid) = 'object'),
  cron_token  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  tick_url    text not null default 'https://mental-math.pages.dev/api/push/tick' check (tick_url like 'https://%'),
  created_at  timestamptz not null default now()
);

insert into public.push_config (id) values (1) on conflict (id) do nothing;

alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
grant all on public.push_config to service_role;

-- VAPID-Schlüssel einmalig setzen; parallele Aufrufe bekommen alle denselben (ersten) Schlüssel zurück
create or replace function public.push_init_vapid(p_vapid jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  insert into public.push_config (id) values (1) on conflict (id) do nothing;
  update public.push_config set vapid = p_vapid where id = 1 and vapid is null;
  select c.vapid into v from public.push_config c where c.id = 1;
  return v;
end;
$$;

-- Fällige Abos holen und für 5 Minuten reservieren (der Server plant danach neu). Parallele Takte überspringen
-- reservierte Zeilen (skip locked), damit keine Erinnerung doppelt rausgeht.
create or replace function public.push_claim_due(p_now timestamptz, p_limit integer)
returns setof public.push_subscriptions
language sql security definer set search_path = ''
as $$
  update public.push_subscriptions s
     set next_at = p_now + interval '5 minutes'
   where s.id in (
     select d.id from public.push_subscriptions d
      where d.next_at is not null and d.next_at <= p_now
      order by d.next_at
      limit least(greatest(p_limit, 1), 500)
      for update skip locked)
  returning s.*;
$$;

revoke execute on function public.push_init_vapid(jsonb) from public, anon, authenticated;
grant execute on function public.push_init_vapid(jsonb) to service_role;
revoke execute on function public.push_claim_due(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.push_claim_due(timestamptz, integer) to service_role;
