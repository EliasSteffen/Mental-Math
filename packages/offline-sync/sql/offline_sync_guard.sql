-- offline-sync: generischer LWW-Guard für Sync-Tabellen (Supabase Postgres 15+). Idempotent.
-- Tabelle braucht: user_id, updated_at (bigint), device_id, server_updated_at (timestamptz), Schlüsselspalte, optional rev.
-- Argumente: TG_ARGV[0] = Schlüsselspalte ('id' | 'name'), TG_ARGV[1] = 'rev' | 'norev'.
-- Verwendung:
--   create trigger offline_sync_guard before insert or update on public.t
--     for each row execute function public.offline_sync_guard('id', 'rev');
-- Semantik: user_id und Schlüssel unveränderlich (23514); ältere/gleiche Stände werden still verworfen;
-- server_updated_at wird immer auf now() gesetzt.
create or replace function public.offline_sync_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_key text := coalesce(tg_argv[0], 'id');
  v_rev boolean := coalesce(tg_argv[1], 'rev') = 'rev';
  n jsonb;
  o jsonb;
begin
  if tg_op = 'UPDATE' then
    n := to_jsonb(new);
    o := to_jsonb(old);
    if n->>'user_id' is distinct from o->>'user_id' then
      raise exception 'user_id is immutable' using errcode = '23514';
    end if;
    if n->>v_key is distinct from o->>v_key then
      raise exception '% is immutable', v_key using errcode = '23514';
    end if;
    if v_rev then
      if ((n->>'updated_at')::bigint, (n->>'rev')::integer, n->>'device_id')
         <= ((o->>'updated_at')::bigint, (o->>'rev')::integer, o->>'device_id') then
        return null;
      end if;
    else
      if ((n->>'updated_at')::bigint, n->>'device_id') <= ((o->>'updated_at')::bigint, o->>'device_id') then
        return null;
      end if;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;
