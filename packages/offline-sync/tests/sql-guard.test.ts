import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = join(import.meta.dirname, '..');
const SIM = readFileSync(join(root, 'tests/helpers/supabase-sim.sql'), 'utf8');
const GUARD = readFileSync(join(root, 'sql/offline_sync_guard.sql'), 'utf8');
const U = '00000000-0000-4000-8000-00000000000a';

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(SIM);
  await db.exec(GUARD);
  await db.exec(GUARD); // Idempotenz
  await db.exec(`
    create table public.t_rev (user_id uuid not null, id text not null, v integer not null, updated_at bigint not null,
      device_id text not null, rev integer not null, server_updated_at timestamptz not null default now(), primary key (user_id, id));
    create table public.t_doc (user_id uuid not null, name text not null, data jsonb not null, updated_at bigint not null,
      device_id text not null, server_updated_at timestamptz not null default now(), primary key (user_id, name));
    create trigger g before insert or update on public.t_rev for each row execute function public.offline_sync_guard('id', 'rev');
    create trigger g before insert or update on public.t_doc for each row execute function public.offline_sync_guard('name', 'norev');
  `);
});

const up = (id: string, v: number, at: number, rev = 1, dev = 'd1') =>
  db.query(
    `insert into public.t_rev (user_id,id,v,updated_at,device_id,rev) values ($1,$2,$3,$4,$5,$6)
     on conflict (user_id,id) do update set v=excluded.v, updated_at=excluded.updated_at, device_id=excluded.device_id, rev=excluded.rev`,
    [U, id, v, at, dev, rev],
  );
const upDoc = (name: string, v: number, at: number, dev = 'd1') =>
  db.query(
    `insert into public.t_doc (user_id,name,data,updated_at,device_id) values ($1,$2,$3,$4,$5)
     on conflict (user_id,name) do update set data=excluded.data, updated_at=excluded.updated_at, device_id=excluded.device_id`,
    [U, name, JSON.stringify({ v }), at, dev],
  );
const getV = async (id: string) => (await db.query<{ v: number }>(`select v from public.t_rev where id=$1`, [id])).rows[0]?.v;
const getD = async (name: string) => (await db.query<{ v: number }>(`select (data->>'v')::int as v from public.t_doc where name=$1`, [name])).rows[0]?.v;
const srv = async (table: string, key: string, id: string) =>
  (await db.query<{ t: string }>(`select extract(epoch from server_updated_at)::text as t from public.${table} where ${key}=$1`, [id])).rows[0]!.t;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('offline_sync_guard', () => {
  it('Insert setzt server_updated_at', async () => {
    await db.query(`insert into public.t_rev (user_id,id,v,updated_at,device_id,rev,server_updated_at) values ($1,'ins',1,1,'d',1,'2000-01-01')`, [U]);
    assert.ok(Number(await srv('t_rev', 'id', 'ins')) > 1_000_000_000);
  });

  it('älterer Stand wird verworfen, neuerer angewendet, server_updated_at steigt', async () => {
    await up('a', 1, 100);
    const t0 = await srv('t_rev', 'id', 'a');
    await sleep(15);
    await up('a', 2, 50);
    assert.equal(await getV('a'), 1);
    assert.equal(await srv('t_rev', 'id', 'a'), t0);
    await up('a', 3, 200);
    assert.equal(await getV('a'), 3);
    assert.ok(Number(await srv('t_rev', 'id', 'a')) > Number(t0));
  });

  it('gleicher Stand ist No-op; rev entscheidet bei gleichem updated_at', async () => {
    await up('b', 1, 100, 2);
    await up('b', 9, 100, 2);
    assert.equal(await getV('b'), 1);
    await up('b', 8, 100, 1);
    assert.equal(await getV('b'), 1);
    await up('b', 7, 100, 3);
    assert.equal(await getV('b'), 7);
  });

  it('device_id entscheidet zuletzt', async () => {
    await up('c', 1, 100, 1, 'd1');
    await up('c', 2, 100, 1, 'd2');
    assert.equal(await getV('c'), 2);
    await up('c', 3, 100, 1, 'd1');
    assert.equal(await getV('c'), 2);
  });

  it('user_id und Schlüssel sind unveränderlich (23514)', async () => {
    await up('imm', 1, 1);
    const bad = (sql: string) => assert.rejects(db.query(sql), (e: unknown) => (e as { code?: string }).code === '23514');
    await bad(`update public.t_rev set user_id='00000000-0000-4000-8000-00000000000b' where id='imm'`);
    await bad(`update public.t_rev set id='other', updated_at=99 where id='imm'`);
    await upDoc('n', 1, 1);
    await bad(`update public.t_doc set name='x', updated_at=99 where name='n'`);
  });

  it('norev: updated_at/device_id, Insert und Upsert', async () => {
    await upDoc('settings', 1, 100);
    const t0 = await srv('t_doc', 'name', 'settings');
    await sleep(15);
    await upDoc('settings', 2, 100); // gleich
    await upDoc('settings', 3, 50);  // älter
    assert.equal(await getD('settings'), 1);
    assert.equal(await srv('t_doc', 'name', 'settings'), t0);
    await upDoc('settings', 4, 100, 'd2'); // device_id größer
    assert.equal(await getD('settings'), 4);
    await upDoc('settings', 5, 200);
    assert.equal(await getD('settings'), 5);
    assert.ok(Number(await srv('t_doc', 'name', 'settings')) > Number(t0));
  });
});
