-- Trainingsdaten-Sync: Tabellen, LWW-Trigger, RLS, Funktionen (Supabase Postgres 15+). Idempotent.
-- Setzt voraus (in dieser Reihenfolge): packages/passkey-auth/sql/001_passkey_auth.sql (FK auf public.users)
-- und packages/offline-sync/sql/offline_sync_guard.sql (Trigger-Funktion).

create table if not exists public.training_sessions (
  user_id         uuid not null default auth.uid() references public.users(id) on delete cascade,
  id              text not null check (char_length(id) between 1 and 64),
  mode            text not null check (char_length(mode) <= 64),
  score           integer not null,
  correct_answers integer not null check (correct_answers >= 0),
  total_questions integer not null check (total_questions >= 0 and correct_answers <= total_questions),
  duration_ms     bigint not null check (duration_ms >= 0),
  avg_time_ms     integer not null check (avg_time_ms >= 0),
  created_at      timestamptz not null,
  updated_at      bigint not null,
  deleted_at      bigint,
  device_id       text not null check (char_length(device_id) <= 64),
  rev             integer not null check (rev >= 1),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.training_results (
  user_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  id          text not null check (char_length(id) between 1 and 64),
  session_id  text not null check (char_length(session_id) <= 64),
  created_at  timestamptz not null,
  mode        text not null check (char_length(mode) <= 64),
  category    text not null check (char_length(category) <= 32),
  subtype     text not null check (char_length(subtype) <= 64),
  correct     boolean not null,
  error_type  text check (error_type in ('nullen','knapp','falsch','skip')),
  time_ms     integer not null check (time_ms >= 0),
  target_ms   integer not null check (target_ms >= 0),
  points      integer not null,
  level       smallint check (level in (1,2,3)),
  payload     jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  updated_at  bigint not null,
  deleted_at  bigint,
  device_id   text not null check (char_length(device_id) <= 64),
  rev         integer not null check (rev >= 1),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.user_documents (
  user_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  name        text not null check (name ~ '^(settings|reviews|dailyResults|chainBest|parallel|wipe|activity:[0-9a-f-]{36})$'),
  data        jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  updated_at  bigint not null,
  device_id   text not null check (char_length(device_id) <= 64),
  server_updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Bestehende Tabellen: Namensregel um die Lösch-Markierung 'wipe' erweitern (idempotent)
alter table public.user_documents drop constraint if exists user_documents_name_check;
alter table public.user_documents add constraint user_documents_name_check check (name ~ '^(settings|reviews|dailyResults|chainBest|parallel|wipe|activity:[0-9a-f-]{36})$');

-- Keyset-Pull
create index if not exists training_sessions_pull_idx on public.training_sessions (user_id, server_updated_at, id);
create index if not exists training_results_pull_idx  on public.training_results  (user_id, server_updated_at, id);
create index if not exists user_documents_pull_idx    on public.user_documents    (user_id, server_updated_at, name);

-- LWW-Guard: generische Funktion aus offline_sync_guard.sql (Schlüssel unveränderlich, ältere/gleiche Stände verworfen)
drop trigger if exists mm_sync_guard on public.training_sessions;
drop trigger if exists mm_sync_guard on public.training_results;
drop trigger if exists mm_sync_guard on public.user_documents;
drop function if exists public.mm_sync_guard();

drop trigger if exists offline_sync_guard on public.training_sessions;
create trigger offline_sync_guard before insert or update on public.training_sessions
  for each row execute function public.offline_sync_guard('id', 'rev');
drop trigger if exists offline_sync_guard on public.training_results;
create trigger offline_sync_guard before insert or update on public.training_results
  for each row execute function public.offline_sync_guard('id', 'rev');
drop trigger if exists offline_sync_guard on public.user_documents;
create trigger offline_sync_guard before insert or update on public.user_documents
  for each row execute function public.offline_sync_guard('name', 'norev');

-- RLS und Rechte
alter table public.training_sessions enable row level security;
alter table public.training_results  enable row level security;
alter table public.user_documents    enable row level security;

revoke all on public.training_sessions, public.training_results, public.user_documents from anon, authenticated;
grant select, insert, update on public.training_sessions, public.training_results, public.user_documents to authenticated;
grant all on public.training_sessions, public.training_results, public.user_documents to service_role;

-- Policies: nur eigene Zeilen, kein DELETE (Soft-Delete über deleted_at)
drop policy if exists training_sessions_select on public.training_sessions;
create policy training_sessions_select on public.training_sessions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists training_sessions_insert on public.training_sessions;
create policy training_sessions_insert on public.training_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists training_sessions_update on public.training_sessions;
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists training_results_select on public.training_results;
create policy training_results_select on public.training_results for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists training_results_insert on public.training_results;
create policy training_results_insert on public.training_results for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists training_results_update on public.training_results;
create policy training_results_update on public.training_results for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists user_documents_select on public.user_documents;
create policy user_documents_select on public.user_documents for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists user_documents_insert on public.user_documents;
create policy user_documents_insert on public.user_documents for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_documents_update on public.user_documents;
create policy user_documents_update on public.user_documents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Alle eigenen Trainingsdaten löschen („Alle Daten löschen“ im angemeldeten Zustand)
create or replace function public.mm_delete_my_data()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.training_results  where user_id = v_uid;
  delete from public.training_sessions where user_id = v_uid;
  delete from public.user_documents    where user_id = v_uid;
end;
$$;

revoke execute on function public.mm_delete_my_data() from public, anon, authenticated;
grant execute on function public.mm_delete_my_data() to authenticated;
