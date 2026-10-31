import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountApi } from '../src/supabase/account.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';

interface Call { kind: string; table?: string; ops: Array<[string, unknown[]]>; rpc?: string; args?: unknown }
interface Res { data: unknown; error: { code?: string; message?: string } | null }

// Fake der supabase-js-Builder-Kette; zeichnet Aufrufe auf
function makeFake(result: Res) {
  const calls: Call[] = [];
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {};
    for (const m of ['insert', 'select', 'update', 'delete', 'eq', 'order', 'maybeSingle', 'single']) {
      b[m] = (...a: unknown[]) => { call.ops.push([m, a]); return b; };
    }
    b.then = (ok: (r: Res) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko);
    return b;
  };
  const client = {
    from(table: string) { const c: Call = { kind: 'from', table, ops: [] }; calls.push(c); return builder(c); },
    rpc(name: string, args?: unknown) { const c: Call = { kind: 'rpc', rpc: name, args, ops: [] }; calls.push(c); return builder(c); },
  };
  return { sb: client as unknown as SupabaseClient, calls };
}

const ok = (data: unknown): Res => ({ data, error: null });
const err = (code?: string, message?: string): Res => ({ data: null, error: { ...(code ? { code } : {}), ...(message ? { message } : {}) } });
const isErr = (code: string, status?: number, message?: string) => (e: unknown) =>
  e instanceof PasskeyAuthError && e.code === code && (status === undefined || e.status === status) && (message === undefined || e.message === message);

test('getProfile', async () => {
  const f = makeFake(ok({ id: 'u', username: 'Ann' }));
  assert.deepEqual(await createAccountApi(f.sb).getProfile(), { id: 'u', username: 'Ann' });
  assert.equal(f.calls[0]?.table, 'users');
  assert.deepEqual(f.calls[0]?.ops[0], ['select', ['id, username']]);
  assert.equal(f.calls[0]?.ops[1]?.[0], 'single');
});

test('renameUser: Validierung und Update', async () => {
  const f = makeFake(ok(null));
  const api = createAccountApi(f.sb);
  await assert.rejects(api.renameUser('u', 'a'), isErr('invalid_username', undefined, 'too_short'));
  assert.equal(f.calls.length, 0);
  assert.equal(await api.renameUser('u', '  Ann   Lee '), 'Ann Lee');
  assert.equal(f.calls[0]?.table, 'users');
  assert.deepEqual(f.calls[0]?.ops, [['update', [{ username: 'Ann Lee' }]], ['eq', ['id', 'u']]]);
});

test('listPasskeys: Mapping und Sortierung', async () => {
  const f = makeFake(ok([
    { id: 'a', name: 'Mac', created_at: '2030-01-01T00:00:00Z', last_used_at: null, backed_up: true, device_type: 'multiDevice', transports: 'internal,x,usb' },
    { id: 'b', name: null, created_at: '2030-02-01T00:00:00Z', last_used_at: '2030-03-01T00:00:00Z', backed_up: false, device_type: null, transports: null },
  ]));
  const r = await createAccountApi(f.sb).listPasskeys();
  assert.deepEqual(f.calls[0]?.ops[1], ['order', ['created_at', { ascending: true }]]);
  assert.deepEqual(r, [
    { id: 'a', name: 'Mac', createdAt: '2030-01-01T00:00:00Z', lastUsedAt: null, backedUp: true, deviceType: 'multiDevice', transports: ['internal', 'usb'] },
    { id: 'b', name: null, createdAt: '2030-02-01T00:00:00Z', lastUsedAt: '2030-03-01T00:00:00Z', backedUp: false, deviceType: null, transports: [] },
  ]);
});

test('renamePasskey: trim, leer -> null, Laenge, 0 Zeilen', async () => {
  const f = makeFake(ok([{ id: 'p' }]));
  const api = createAccountApi(f.sb);
  await api.renamePasskey('p', '  Laptop ');
  assert.deepEqual(f.calls[0]?.ops.slice(0, 2), [['update', [{ name: 'Laptop' }]], ['eq', ['id', 'p']]]);
  assert.equal(f.calls[0]?.ops[2]?.[0], 'select');
  await api.renamePasskey('p', '   ');
  assert.deepEqual(f.calls[1]?.ops[0], ['update', [{ name: null }]]);
  await assert.rejects(api.renamePasskey('p', 'x'.repeat(41)), isErr('invalid_request', 400));
  await assert.rejects(createAccountApi(makeFake(ok([])).sb).renamePasskey('p', 'x'), isErr('invalid_request', 404));
});

test('deletePasskey: rpc und Fehlerabbildung', async () => {
  const f = makeFake(ok(null));
  await createAccountApi(f.sb).deletePasskey('p');
  assert.equal(f.calls[0]?.rpc, 'pa_delete_passkey');
  assert.deepEqual(f.calls[0]?.args, { p_id: 'p' });
  await assert.rejects(createAccountApi(makeFake(err('P0001', 'last_passkey')).sb).deletePasskey('p'), isErr('last_passkey', 409));
  await assert.rejects(createAccountApi(makeFake(err('P0002', 'not_found')).sb).deletePasskey('p'), isErr('invalid_request', 404, 'not_found'));
});

test('deleteAccount: rpc', async () => {
  const f = makeFake(ok(null));
  await createAccountApi(f.sb).deleteAccount();
  assert.equal(f.calls[0]?.rpc, 'pa_delete_account');
});

test('Fehlerabbildung: JWT -> unauthorized, sonst server_error', async () => {
  for (const code of ['PGRST301', 'PGRST303']) {
    await assert.rejects(createAccountApi(makeFake(err(code)).sb).getProfile(), isErr('unauthorized', 401));
    await assert.rejects(createAccountApi(makeFake(err(code)).sb).deleteAccount(), isErr('unauthorized'));
  }
  await assert.rejects(createAccountApi(makeFake(err('XX000', 'boom')).sb).listPasskeys(), isErr('server_error', 500));
});
