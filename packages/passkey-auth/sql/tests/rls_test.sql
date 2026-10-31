-- Manueller RLS-Test für den Supabase SQL-Editor. Läuft in einer Transaktion und rollt zurück.
begin;

select public.pa_create_user_with_passkey('00000000-0000-4000-8000-00000000000a', 'alice', 'cred-a1', 'pk', 0, null, 'multiDevice', false);
select public.pa_create_user_with_passkey('00000000-0000-4000-8000-00000000000b', 'bob', 'cred-b1', 'pk', 0, null, 'multiDevice', false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Test 2: fremde Zeilen unsichtbar
  select count(*) into n from public.users;
  if n <> 1 then raise exception 'FAIL users sichtbar: %', n; end if;
  select count(*) into n from public.passkeys;
  if n <> 1 then raise exception 'FAIL passkeys sichtbar: %', n; end if;
  raise notice 'OK nur eigene Zeilen sichtbar';
end $$;

do $$
begin
  -- Test 3: verbotene Operationen
  begin
    update public.passkeys set counter = 99;
    raise exception 'FAIL update counter erlaubt';
  exception when insufficient_privilege then raise notice 'OK update counter abgewiesen'; end;
  begin
    update public.passkeys set public_key = 'x';
    raise exception 'FAIL update public_key erlaubt';
  exception when insufficient_privilege then raise notice 'OK update public_key abgewiesen'; end;
  begin
    insert into public.passkeys (user_id, credential_id, public_key)
    values ('00000000-0000-4000-8000-00000000000a', 'evil', 'pk');
    raise exception 'FAIL insert passkeys erlaubt';
  exception when insufficient_privilege then raise notice 'OK insert passkeys abgewiesen'; end;
  begin
    perform 1 from public.auth_challenges;
    raise exception 'FAIL auth_challenges lesbar';
  exception when insufficient_privilege then raise notice 'OK auth_challenges nicht lesbar'; end;
  begin
    perform 1 from public.auth_sessions;
    raise exception 'FAIL auth_sessions lesbar';
  exception when insufficient_privilege then raise notice 'OK auth_sessions nicht lesbar'; end;
  begin
    perform public.pa_consume_challenge(gen_random_uuid(), 'login');
    raise exception 'FAIL pa_consume_challenge ausführbar';
  exception when insufficient_privilege then raise notice 'OK pa_consume_challenge nicht ausführbar'; end;
end $$;

do $$
declare v_id uuid;
begin
  -- Test 8: letzter Passkey bleibt, fremde/unbekannte id -> not_found
  select id into v_id from public.passkeys limit 1;
  begin
    perform public.pa_delete_passkey(v_id);
    raise exception 'FAIL letzter Passkey entfernt';
  exception when sqlstate 'P0001' then raise notice 'OK last_passkey'; end;
  begin
    perform public.pa_delete_passkey(gen_random_uuid());
    raise exception 'FAIL fremde id entfernt';
  exception when sqlstate 'P0002' then raise notice 'OK not_found'; end;
end $$;

rollback;
