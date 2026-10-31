import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSyncError } from '../src/errors.ts';
import { createSupabaseSyncProvider } from '../src/supabase/index.ts';
import type { SupabaseSyncSchema, SyncRecord } from '../src/types.ts';

const U = '00000000-0000-4000-8000-00000000000a';
type Call = { table: string; ops: Array<[string, unknown[]]> };
type Reply = { data?: unknown; error?: unknown; status?: number };

/** Fake-Client: zeichnet Aufrufe je Tabelle auf, Antwort über reply(table, call). */
function fake(reply: (table: string, call: Call) => Reply | Error) {
  const calls: Call[] = [];
  const rpcs: string[] = [];
  const make = (call: Call): unknown =>
    new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          const r = reply(call.table, call);
          return (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            r instanceof Error ? rej(r) : res({ data: null, error: null, status: 200, ...r });
        }
        return (...args: unknown[]) => { call.ops.push([prop, args]); return make(call); };
      },
    });
  const client = {
    from(table: string) { const call: Call = { table, ops: [] }; calls.push(call); return make(call); },
    rpc(name: string) { rpcs.push(name); return make({ table: `rpc:${name}`, ops: [] }); },
  };
  return { client: client as unknown as SupabaseClient, calls, rpcs };
}

const op = (c: Call, name: string): unknown[][] => c.ops.filter(([n]) => n === name).map(([, a]) => a);
const rec = (id: string): SyncRecord => ({ id, createdAt: 1, updatedAt: 2, deletedAt: null, deviceId: 'd', rev: 1 });

const fromRow = (row: unknown): SyncRecord | null => {
  const r = row as { id?: unknown } | null;
  return r && typeof r.id === 'string' && r.id !== 'kaputt' ? rec(r.id) : null;
};
const schema: SupabaseSyncSchema = {
  collections: {
    big: { table: 't_big', toRow: (i, u) => ({ user_id: u, id: i.id }), fromRow, initialWindowDays: 30 },
    small: { table: 't_small', toRow: (i, u) => ({ user_id: u, id: i.id, small: true }), fromRow },
  },
  docsTable: 't_docs',
  deleteAllRpc: 'delete_everything',
};
const mk = (client: SupabaseClient, o?: { now?: () => number; chunkSize?: number }) => createSupabaseSyncProvider(client, U, schema, o);
const row = (id: string, at: string) => ({ id, server_updated_at: at });
const drow = (name: string, at: string) => ({ name, data: {}, updated_at: 1, device_id: 'd', server_updated_at: at });
const find = (calls: Call[], t: string) => calls.find((c) => c.table === t)!;

test('upsert: Chunks, onConflict, Tabelle je Collection', async () => {
  const { client, calls } = fake(() => ({}));
  const p = mk(client);
  assert.equal(p.name, 'supabase');
  await p.upsertRecords('big', Array.from({ length: 450 }, (_, i) => rec(`r${i}`)));
  assert.deepEqual(calls.map((c) => (op(c, 'upsert')[0]?.[0] as unknown[]).length), [200, 200, 50]);
  for (const c of calls) {
    assert.equal(c.table, 't_big');
    assert.deepEqual(op(c, 'upsert')[0]?.[1], { onConflict: 'user_id,id' });
  }
  assert.deepEqual((op(calls[0]!, 'upsert')[0]?.[0] as unknown[])[0], { user_id: U, id: 'r0' });
  await p.upsertRecords('small', [rec('x')]);
  assert.equal(calls[3]?.table, 't_small');
  await p.upsertDocs([{ name: 'settings', data: { a: 1 }, updatedAt: 5, deviceId: 'd' }]);
  assert.equal(calls[4]?.table, 't_docs');
  assert.deepEqual(op(calls[4]!, 'upsert')[0]?.[1], { onConflict: 'user_id,name' });
  assert.deepEqual((op(calls[4]!, 'upsert')[0]?.[0] as unknown[])[0], { user_id: U, name: 'settings', data: { a: 1 }, updated_at: 5, device_id: 'd' });
});

test('upsert: chunkSize-Option, leere Liste ohne Aufruf', async () => {
  const { client, calls } = fake(() => ({}));
  const p = mk(client, { chunkSize: 2 });
  await p.upsertRecords('big', [rec('a'), rec('b'), rec('c')]);
  assert.equal(calls.length, 2);
  await p.upsertRecords('big', []);
  assert.equal(calls.length, 2);
});

test('upsert: unbekannte Collection → invalid', async () => {
  const { client, calls } = fake(() => ({}));
  await assert.rejects(mk(client).upsertRecords('nope', [rec('a')]), (e: unknown) => isSyncError(e) && e.kind === 'invalid');
  await assert.rejects(mk(client).upsertRecords('toString', [rec('a')]), (e: unknown) => isSyncError(e) && e.kind === 'invalid');
  assert.equal(calls.length, 0);
});

test('pull: erste Seite, Filter je Tabelle, Fenster nur für big', async () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  const { client, calls } = fake((t) => ({
    data: t === 't_big' ? [row('r1', '2026-05-01T10:00:00.5+00:00'), row('r2', '2026-05-01T10:00:01+00:00'), { id: 'kaputt' }]
      : t === 't_small' ? [row('s1', '2026-05-02T00:00:00+00:00')] : [],
  }));
  const page = await mk(client, { now: () => now }).pull(null, { limit: 3, rewind: false });
  const big = find(calls, 't_big');
  assert.deepEqual(op(big, 'eq')[0], ['user_id', U]);
  assert.deepEqual(op(big, 'gte')[0], ['created_at', new Date(now - 30 * 86_400_000).toISOString()]);
  assert.equal(op(big, 'or').length, 0);
  assert.deepEqual(op(big, 'order'), [['server_updated_at', { ascending: true }], ['id', { ascending: true }]]);
  assert.deepEqual(op(big, 'limit')[0], [3]);
  assert.equal(op(find(calls, 't_small'), 'gte').length, 0);
  assert.equal(op(find(calls, 't_docs'), 'order')[1]?.[0], 'name');
  assert.equal(page.records.filter((r) => r.collection === 'big').length, 2); // kaputte Zeile übersprungen
  assert.equal(page.records.length, 3);
  assert.equal(page.hasMore, true);
  assert.deepEqual(JSON.parse(page.cursor!), {
    v: 2, p: { big: { at: '2026-05-01T10:00:01+00:00', id: 'r2' }, small: { at: '2026-05-02T00:00:00+00:00', id: 's1' } },
  });
});

test('pull: Folgeseite mit zitiertem Keyset, Cursor bleibt, Fenster nur beim ersten Pull der Tabelle', async () => {
  const { client, calls } = fake(() => ({ data: [] }));
  const cur = JSON.stringify({ v: 2, p: { small: { at: 'A1', id: 'x' }, $docs: { at: 'C3', id: 'settings' } } });
  const page = await mk(client).pull(cur, { limit: 5, rewind: false });
  assert.deepEqual(op(find(calls, 't_small'), 'or')[0], ['server_updated_at.gt."A1",and(server_updated_at.eq."A1",id.gt."x")']);
  assert.deepEqual(op(find(calls, 't_docs'), 'or')[0], ['server_updated_at.gt."C3",and(server_updated_at.eq."C3",name.gt."settings")']);
  assert.equal(op(find(calls, 't_big'), 'gte')[0]?.[0], 'created_at'); // big hat noch keine Position
  assert.equal(op(find(calls, 't_small'), 'gte').length, 0);
  assert.equal(page.hasMore, false);
  assert.deepEqual(JSON.parse(page.cursor!), JSON.parse(cur));
});

test('pull: Docs-Zeilen, Cursor rückt vor, Docs lösen hasMore aus', async () => {
  const { client } = fake((t) => ({ data: t === 't_docs' ? [drow('a', 'T1'), drow('b', 'T2'), { name: 5 }] : [] }));
  const page = await mk(client).pull(null, { limit: 3, rewind: false });
  assert.deepEqual(page.docs.map((d) => d.name), ['a', 'b']);
  assert.equal(page.hasMore, true);
  assert.deepEqual(JSON.parse(page.cursor!).p.$docs, { at: 'T2', id: 'b' });
});

test('pull: rewind zieht 60 s ab; alter/ungültiger Cursor = null', async () => {
  const { client, calls } = fake(() => ({ data: [] }));
  const p = mk(client);
  await p.pull(JSON.stringify({ v: 2, p: { small: { at: '2026-05-01T10:01:00.000Z', id: 'x' } } }), { limit: 5, rewind: true });
  const s = find(calls, 't_small');
  assert.deepEqual(op(s, 'gte')[0], ['server_updated_at', '2026-05-01T10:00:00.000Z']);
  assert.equal(op(s, 'or').length, 0);
  for (const bad of ['{kein json', JSON.stringify({ v: 1, s: { at: 'A', id: 'x' } }), '[]', 'null']) {
    calls.length = 0;
    const page = await p.pull(bad, { limit: 5, rewind: false });
    assert.equal(page.cursor, null);
    assert.equal(op(find(calls, 't_big'), 'gte')[0]?.[0], 'created_at');
    assert.equal(op(find(calls, 't_small'), 'or').length, 0);
  }
});

const kindOf = async (r: Reply | Error): Promise<string> => {
  const { client } = fake(() => r);
  try {
    await mk(client).upsertDocs([{ name: 'settings', data: {}, updatedAt: 1, deviceId: 'd' }]);
  } catch (e) {
    assert.ok(isSyncError(e));
    assert.ok(!/secret/.test(e.message));
    return e.kind;
  }
  return 'ok';
};

test('Fehlerabbildung', async () => {
  const err = (status: number, code = '', message = 'secret row data') => ({ status, error: { code, message, details: 'secret' } });
  assert.equal(await kindOf(err(0, '', 'TypeError: Failed to fetch')), 'offline');
  assert.equal(await kindOf(new TypeError('fetch failed')), 'offline');
  assert.equal(await kindOf(err(401)), 'auth');
  assert.equal(await kindOf(err(400, 'PGRST301')), 'auth');
  assert.equal(await kindOf(err(401, 'PGRST303')), 'auth');
  assert.equal(await kindOf(err(409, '23505')), 'invalid');
  assert.equal(await kindOf(err(400, '22P02')), 'invalid');
  assert.equal(await kindOf(err(400, 'PGRST102')), 'invalid');
  assert.equal(await kindOf(err(500)), 'server');
  assert.equal(await kindOf(new Error('boom')), 'server');
  assert.equal(await kindOf({}), 'ok');
});

test('deleteAll ruft die RPC aus dem Schema auf', async () => {
  const { client, rpcs } = fake(() => ({}));
  await mk(client).deleteAll();
  assert.deepEqual(rpcs, ['delete_everything']);
  const bad = fake(() => ({ status: 401, error: { code: 'PGRST301', message: 'x' } }));
  await assert.rejects(mk(bad.client).deleteAll(), (e: unknown) => isSyncError(e) && e.kind === 'auth');
});
