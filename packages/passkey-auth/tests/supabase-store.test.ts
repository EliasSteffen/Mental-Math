import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAuthStore } from '../src/supabase/store.ts';
import { createPasskeySupabaseClient } from '../src/supabase/client.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';
import type { NewPasskey } from '../src/shared/types.ts';

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
const pk: NewPasskey = { credentialId: 'cid', publicKey: 'pub', counter: 3, transports: ['usb', 'internal'], deviceType: 'multiDevice', backedUp: true };
const expiresAt = Date.UTC(2030, 0, 1, 12, 0, 0);
const iso = '2030-01-01T12:00:00.000Z';

test('createChallenge: insert auth_challenges, ms -> ISO', async () => {
  const f = makeFake(ok(null));
  await createSupabaseAuthStore(f.sb).createChallenge({ id: 'i', challenge: 'c', purpose: 'add', userId: 'u', username: null, expiresAt });
  assert.equal(f.calls[0]?.table, 'auth_challenges');
  assert.deepEqual(f.calls[0]?.ops[0], ['insert', [{ id: 'i', challenge: 'c', purpose: 'add', user_id: 'u', username: null, expires_at: iso }]]);
});

test('consumeChallenge: rpc-Argumente, Mapping ISO -> ms, leer -> null', async () => {
  const f = makeFake(ok([{ id: 'i', challenge: 'c', purpose: 'register', user_id: 'u', username: 'Ann', expires_at: iso }]));
  const r = await createSupabaseAuthStore(f.sb).consumeChallenge('i', 'register');
  assert.equal(f.calls[0]?.rpc, 'pa_consume_challenge');
  assert.deepEqual(f.calls[0]?.args, { p_id: 'i', p_purpose: 'register' });
  assert.deepEqual(r, { id: 'i', challenge: 'c', purpose: 'register', userId: 'u', username: 'Ann', expiresAt });
  assert.equal(await createSupabaseAuthStore(makeFake(ok([])).sb).consumeChallenge('i', 'login'), null);
});

test('createUserWithPasskey: rpc-Argumente, Transports als CSV', async () => {
  const f = makeFake(ok(null));
  await createSupabaseAuthStore(f.sb).createUserWithPasskey({ id: 'u', username: 'Ann' }, pk);
  assert.equal(f.calls[0]?.rpc, 'pa_create_user_with_passkey');
  assert.deepEqual(f.calls[0]?.args, {
    p_user_id: 'u', p_username: 'Ann', p_credential_id: 'cid', p_public_key: 'pub', p_counter: 3,
    p_transports: 'usb,internal', p_device_type: 'multiDevice', p_backed_up: true,
  });
  const g = makeFake(ok(null));
  await createSupabaseAuthStore(g.sb).createUserWithPasskey({ id: 'u', username: 'Ann' }, { ...pk, transports: [] });
  assert.equal((g.calls[0]?.args as Record<string, unknown>).p_transports, null);
});

test('addPasskey: insert passkeys', async () => {
  const f = makeFake(ok(null));
  await createSupabaseAuthStore(f.sb).addPasskey('u', pk);
  assert.equal(f.calls[0]?.table, 'passkeys');
  assert.deepEqual(f.calls[0]?.ops[0], ['insert', [{
    user_id: 'u', credential_id: 'cid', public_key: 'pub', counter: 3, transports: 'usb,internal', device_type: 'multiDevice', backed_up: true,
  }]]);
});

test('23505 -> credential_exists 409 (rpc und insert)', async () => {
  const dup: Res = { data: null, error: { code: '23505', message: 'secret row' } };
  for (const run of [
    (s: ReturnType<typeof createSupabaseAuthStore>) => s.createUserWithPasskey({ id: 'u', username: 'A' }, pk),
    (s: ReturnType<typeof createSupabaseAuthStore>) => s.addPasskey('u', pk),
  ]) {
    await assert.rejects(run(createSupabaseAuthStore(makeFake(dup).sb)), (e: unknown) =>
      e instanceof PasskeyAuthError && e.code === 'already_registered' && e.message === 'credential_exists' && e.status === 409);
  }
});

test('findPasskey: select/eq/maybeSingle, Mapping (string-Counter, users als Array, Transports gefiltert)', async () => {
  const row = { id: 'p', user_id: 'u', credential_id: 'cid', public_key: 'pub', counter: '42', transports: 'usb,bogus,nfc', device_type: 'singleDevice', backed_up: false, users: [{ username: 'Ann' }] };
  const f = makeFake(ok(row));
  const r = await createSupabaseAuthStore(f.sb).findPasskey('cid');
  assert.equal(f.calls[0]?.table, 'passkeys');
  assert.deepEqual(f.calls[0]?.ops[0], ['select', ['id, user_id, credential_id, public_key, counter, transports, device_type, backed_up, users(username)']]);
  assert.deepEqual(f.calls[0]?.ops[1], ['eq', ['credential_id', 'cid']]);
  assert.equal(f.calls[0]?.ops[2]?.[0], 'maybeSingle');
  assert.deepEqual(r, { id: 'p', userId: 'u', credentialId: 'cid', publicKey: 'pub', counter: 42, transports: ['usb', 'nfc'], deviceType: 'singleDevice', backedUp: false, username: 'Ann' });
  const o = await createSupabaseAuthStore(makeFake(ok({ ...row, counter: 7, transports: null, users: { username: 'Bo' } })).sb).findPasskey('cid');
  assert.equal(o?.counter, 7);
  assert.deepEqual(o?.transports, []);
  assert.equal(o?.username, 'Bo');
  assert.equal(await createSupabaseAuthStore(makeFake(ok(null)).sb).findPasskey('x'), null);
});

test('listCredentialIds', async () => {
  const f = makeFake(ok([{ credential_id: 'a' }, { credential_id: 'b' }]));
  assert.deepEqual(await createSupabaseAuthStore(f.sb).listCredentialIds('u'), ['a', 'b']);
  assert.equal(f.calls[0]?.table, 'passkeys');
  assert.deepEqual(f.calls[0]?.ops, [['select', ['credential_id']], ['eq', ['user_id', 'u']]]);
});

test('touchPasskey: update counter + last_used_at', async () => {
  const f = makeFake(ok(null));
  await createSupabaseAuthStore(f.sb).touchPasskey('p', 9);
  const [m, a] = f.calls[0]?.ops[0] ?? [];
  assert.equal(m, 'update');
  const payload = (a as Array<Record<string, unknown>>)[0] ?? {};
  assert.equal(payload.counter, 9);
  assert.equal(typeof payload.last_used_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(String(payload.last_used_at))));
  assert.deepEqual(f.calls[0]?.ops[1], ['eq', ['id', 'p']]);
});

test('createSession / deleteSession', async () => {
  const f = makeFake(ok(null));
  const s = createSupabaseAuthStore(f.sb);
  await s.createSession('u', 'h', expiresAt);
  await s.deleteSession('h');
  assert.equal(f.calls[0]?.table, 'auth_sessions');
  assert.deepEqual(f.calls[0]?.ops[0], ['insert', [{ user_id: 'u', token_hash: 'h', expires_at: iso }]]);
  assert.equal(f.calls[1]?.table, 'auth_sessions');
  assert.deepEqual(f.calls[1]?.ops, [['delete', []], ['eq', ['token_hash', 'h']]]);
});

test('createSession: absolute Grenze als absolute_expires_at; fehlt die Spalte, ohne Grenze', async () => {
  const f = makeFake(ok(null));
  await createSupabaseAuthStore(f.sb).createSession('u', 'h', expiresAt, expiresAt + 86_400_000);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0]?.ops[0], ['insert', [{
    user_id: 'u', token_hash: 'h', expires_at: iso, absolute_expires_at: '2030-01-02T12:00:00.000Z',
  }]]);

  // sql/001 noch nicht eingespielt: PostgREST meldet die unbekannte Spalte, Login darf nicht scheitern
  const origError = console.error;
  console.error = () => {};
  try {
    for (const code of ['PGRST204', '42703']) {
      const results: Res[] = [{ data: null, error: { code } }, ok(null)];
      const calls: Call[] = [];
      const sb = {
        from(table: string) {
          const res = results.shift() ?? ok(null);
          const c: Call = { kind: 'from', table, ops: [] };
          calls.push(c);
          return { insert: (...a: unknown[]) => { c.ops.push(['insert', a]); return Promise.resolve(res); } };
        },
      } as unknown as SupabaseClient;
      await createSupabaseAuthStore(sb).createSession('u', 'h', expiresAt, expiresAt + 1);
      assert.equal(calls.length, 2, code);
      assert.deepEqual(calls[1]?.ops[0], ['insert', [{ user_id: 'u', token_hash: 'h', expires_at: iso }]]);
    }
  } finally {
    console.error = origError;
  }

  // Andere Fehler bleiben Fehler, ohne zweiten Versuch
  const e = makeFake({ data: null, error: { code: '23505' } });
  await assert.rejects(createSupabaseAuthStore(e.sb).createSession('u', 'h', expiresAt, expiresAt + 1), /supabase: createSession: 23505/);
  assert.equal(e.calls.length, 1);
});

test('rotateSession: rpc-Argumente, User oder null', async () => {
  const f = makeFake(ok([{ user_id: 'u', username: 'Ann' }]));
  assert.deepEqual(await createSupabaseAuthStore(f.sb).rotateSession('o', 'n', expiresAt), { id: 'u', username: 'Ann' });
  assert.equal(f.calls[0]?.rpc, 'pa_rotate_session');
  assert.deepEqual(f.calls[0]?.args, { p_old_hash: 'o', p_new_hash: 'n', p_expires_at: iso });
  assert.equal(await createSupabaseAuthStore(makeFake(ok([])).sb).rotateSession('o', 'n', expiresAt), null);
});

test('Sonstiger Fehler -> Error ohne Daten', async () => {
  const f = makeFake({ data: { token: 'SECRET' }, error: { code: '42501', message: 'SECRET detail' } });
  await assert.rejects(createSupabaseAuthStore(f.sb).createSession('u', 'SECRET', 1), (e: unknown) =>
    e instanceof Error && !(e instanceof PasskeyAuthError) && e.message === 'supabase: createSession: 42501' && !e.message.includes('SECRET'));
});

test('createPasskeySupabaseClient: liefert Client ohne Netzwerkzugriff', () => {
  const c = createPasskeySupabaseClient({ getAccessToken: async () => null }, 'https://example.supabase.co', 'sb_publishable_x');
  assert.equal(typeof c.from, 'function');
});
