-- Passkey-Auth: Tabellen, RLS, Funktionen (Supabase Postgres 15+, Schema public). Idempotent.

create table if not exists public.users (
  id          uuid primary key,                       -- vom Server erzeugt
  username    text not null check (char_length(username) between 2 and 32),
  created_at  timestamptz not null default now()
);

create table if not exists public.passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  credential_id text not null unique,                 -- base64url
  public_key    text not null,                        -- COSE-Key, base64url
  counter       bigint not null default 0 check (counter >= 0),
  transports    text,                                 -- CSV, z. B. 'internal,hybrid'
  device_type   text check (device_type in ('singleDevice','multiDevice')),
  backed_up     boolean not null default false,
  name          text check (char_length(name) <= 40), -- vom Nutzer umbenennbar
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists passkeys_user_id_idx on public.passkeys(user_id);

create table if not exists public.auth_challenges (   -- nur service_role
  id          uuid primary key default gen_random_uuid(),   -- = flowId
  challenge   text not null,                          -- base64url
  purpose     text not null check (purpose in ('register','login','add')),
  user_id     uuid,                                   -- register: neue UUID; add: eingeloggter User
  username    text,                                   -- nur register
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists auth_challenges_expires_idx on public.auth_challenges(expires_at);

create table if not exists public.auth_sessions (     -- nur service_role
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token_hash   text not null unique,                  -- SHA-256(refresh token), base64url
  expires_at   timestamptz not null,                  -- gleitend, je Rotation neu (höchstens absolute_expires_at)
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  prev_hash    text,                                  -- Hash vor der letzten Rotation (Gnadenfrist, Wiederverwendung)
  rotated_at   timestamptz,                           -- Zeitpunkt der letzten Rotation über token_hash
  absolute_expires_at timestamptz                     -- harte Grenze ab Login; null = unbegrenzt (Sessions vor dieser Version)
);
-- Nachrüsten bestehender Installationen
alter table public.auth_sessions add column if not exists prev_hash text;
alter table public.auth_sessions add column if not exists rotated_at timestamptz;
alter table public.auth_sessions add column if not exists absolute_expires_at timestamptz;
create index if not exists auth_sessions_prev_hash_idx on public.auth_sessions(prev_hash);

-- RLS und Rechte
alter table public.users           enable row level security;
alter table public.passkeys        enable row level security;
alter table public.auth_challenges enable row level security;
alter table public.auth_sessions   enable row level security;

-- Supabase vergibt Default-Grants an anon/authenticated -> explizit entziehen
revoke all on public.users, public.passkeys, public.auth_challenges, public.auth_sessions from anon, authenticated;
grant all on public.users, public.passkeys, public.auth_challenges, public.auth_sessions to service_role;

-- users: nur eigene Zeile lesen, nur username ändern
grant select on public.users to authenticated;
grant update (username) on public.users to authenticated;
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- passkeys: eigene lesen, nur name ändern; kein INSERT, kein direktes DELETE (-> RPC)
grant select on public.passkeys to authenticated;
grant update (name) on public.passkeys to authenticated;
drop policy if exists passkeys_select_own on public.passkeys;
create policy passkeys_select_own on public.passkeys for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists passkeys_update_own on public.passkeys;
create policy passkeys_update_own on public.passkeys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- auth_challenges / auth_sessions: RLS an, KEINE Policies, KEINE Grants -> nur service_role

-- Funktionen (security definer, leerer search_path, voll qualifiziert)

-- Challenge einmalig einlösen; Zeile wird immer entfernt, geliefert nur bei passendem Zweck und Gültigkeit
create or replace function public.pa_consume_challenge(p_id uuid, p_purpose text)
returns setof public.auth_challenges
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.auth_challenges;
begin
  delete from public.auth_challenges where expires_at < now() - interval '1 hour';
  delete from public.auth_challenges where id = p_id returning * into v_row;
  if found and v_row.purpose = p_purpose and v_row.expires_at > now() then
    return next v_row;
  end if;
  return;
end;
$$;

-- User und erster Passkey atomar anlegen
create or replace function public.pa_create_user_with_passkey(
  p_user_id uuid, p_username text, p_credential_id text, p_public_key text,
  p_counter bigint, p_transports text, p_device_type text, p_backed_up boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.users (id, username) values (p_user_id, p_username);
  insert into public.passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name)
  values (p_user_id, p_credential_id, p_public_key, p_counter, p_transports, p_device_type, p_backed_up, null);
end;
$$;

-- Refresh-Session rotieren (Signatur unverändert, Zeile bleibt dieselbe, nur token_hash wechselt):
-- 1. Treffer über token_hash: abgelaufen (gleitend oder absolut) → löschen, leer;
--    sonst neuer Hash, alter wird prev_hash, rotated_at = now(), expires_at höchstens bis absolute_expires_at.
-- 2. Treffer über prev_hash (alter Token nach Rotation): innerhalb von 60 s seit rotated_at (verlorene Antwort,
--    paralleler Tab) nochmals neuer Hash, prev_hash/rotated_at bleiben (Frist gleitet nicht);
--    danach Wiederverwendung → Session löschen (Diebstahlsignal), leer.
-- absolute_expires_at null (Sessions vor dieser Version) = unbegrenzt.
create or replace function public.pa_rotate_session(p_old_hash text, p_new_hash text, p_expires_at timestamptz)
returns table (user_id uuid, username text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.auth_sessions;
begin
  select * into v_row from public.auth_sessions s where s.token_hash = p_old_hash for update;
  if found then
    if v_row.expires_at <= now() or coalesce(v_row.absolute_expires_at <= now(), false) then
      delete from public.auth_sessions s where s.id = v_row.id;
      return;
    end if;
    update public.auth_sessions s
       set token_hash = p_new_hash, prev_hash = p_old_hash, rotated_at = now(),
           expires_at = least(p_expires_at, coalesce(s.absolute_expires_at, p_expires_at))
     where s.id = v_row.id;
    return query select u.id, u.username from public.users u where u.id = v_row.user_id;
    return;
  end if;

  select * into v_row from public.auth_sessions s where s.prev_hash = p_old_hash limit 1 for update;
  if not found then
    return;
  end if;
  if v_row.expires_at <= now() or coalesce(v_row.absolute_expires_at <= now(), false)
     or v_row.rotated_at is null or v_row.rotated_at <= now() - interval '60 seconds' then
    delete from public.auth_sessions s where s.id = v_row.id;
    return;
  end if;
  update public.auth_sessions s
     set token_hash = p_new_hash,
         expires_at = least(p_expires_at, coalesce(s.absolute_expires_at, p_expires_at))
   where s.id = v_row.id;
  return query select u.id, u.username from public.users u where u.id = v_row.user_id;
end;
$$;

-- Eigenen Passkey entfernen, aber nie den letzten
create or replace function public.pa_delete_passkey(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select array_agg(k.id) into v_ids
  from (select pk.id from public.passkeys pk where pk.user_id = v_uid for update) k;
  if v_ids is null or not (p_id = any (v_ids)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if array_length(v_ids, 1) <= 1 then
    raise exception 'last_passkey' using errcode = 'P0001';
  end if;
  delete from public.passkeys where id = p_id and user_id = v_uid;
end;
$$;

-- Eigenen Account entfernen (Passkeys und Sessions per Cascade)
create or replace function public.pa_delete_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.users where id = v_uid;
end;
$$;

-- EXECUTE: PUBLIC/anon/authenticated entziehen, dann gezielt vergeben
revoke execute on function public.pa_consume_challenge(uuid, text) from public, anon, authenticated;
revoke execute on function public.pa_create_user_with_passkey(uuid, text, text, text, bigint, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.pa_rotate_session(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.pa_delete_passkey(uuid) from public, anon, authenticated;
revoke execute on function public.pa_delete_account() from public, anon, authenticated;

grant execute on function public.pa_consume_challenge(uuid, text) to service_role;
grant execute on function public.pa_create_user_with_passkey(uuid, text, text, text, bigint, text, text, boolean) to service_role;
grant execute on function public.pa_rotate_session(text, text, timestamptz) to service_role;
grant execute on function public.pa_delete_passkey(uuid) to authenticated;
grant execute on function public.pa_delete_account() to authenticated;
