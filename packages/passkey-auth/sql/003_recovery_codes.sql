-- Passkey-Auth: Wiederherstellungscodes (Supabase Postgres 15+, Schema public). Idempotent.
-- Setzt voraus: 001_passkey_auth.sql. Ein Code pro Konto, gespeichert nur als SHA-256-Hash (base64url).

create table if not exists public.auth_recovery (       -- nur service_role
  user_id     uuid primary key references public.users(id) on delete cascade,
  code_hash   text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.auth_recovery enable row level security;
revoke all on public.auth_recovery from anon, authenticated;
grant all on public.auth_recovery to service_role;
-- RLS an, KEINE Policies -> für anon/authenticated unsichtbar

-- Challenge-Zweck 'recover' (neuen Passkey per Wiederherstellungscode anlegen) zulassen
alter table public.auth_challenges drop constraint if exists auth_challenges_purpose_check;
alter table public.auth_challenges add constraint auth_challenges_purpose_check
  check (purpose in ('register','login','add','recover'));

-- Code setzen oder ersetzen (ein Code pro Konto; der alte wird damit ungültig)
create or replace function public.pa_set_recovery_code(p_user_id uuid, p_code_hash text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.auth_recovery (user_id, code_hash, created_at)
  values (p_user_id, p_code_hash, now())
  on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = excluded.created_at;
end;
$$;

revoke execute on function public.pa_set_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.pa_set_recovery_code(uuid, text) to service_role;
