// Client der gewerteten Challenge (src/features/challenge.ts): Outbox, Abgabe, Netzfehler, laufender Versuch
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthSession } from '../src/vendor/auth.ts';
import * as acct from '../src/features/account.ts';
import type { VendorModuleLike } from '../src/features/account.ts';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
} as unknown as Storage;

const session: AuthSession = { user: { id: 'u1', username: 'Anna' }, accessToken: 'access-token-xxxxxxxxxxxxxxxx', expiresAt: Date.now() + 60_000 };
function fakeModule(): VendorModuleLike {
  let cb: ((s: AuthSession | null) => void) | null = null;
  const auth = {
    login: async () => { cb?.(session); return session; },
    getAccessToken: async () => session.accessToken,
    onChange: (f: (s: AuthSession | null) => void) => { cb = f; return () => { cb = null; }; },
    restore: async () => session,
    logout: async () => { cb?.(null); },
  };
  return {
    createPasskeyAuth: () => auth as never, createPasskeySupabaseClient: () => ({}), createAccountApi: () => ({}) as never,
    createSupabaseSyncProvider: () => ({}) as never,
  };
}

interface Call { method: string; path: string; body: unknown; auth: string | null }
let calls: Call[] = [];
let reply: (c: Call) => { status: number; body: unknown } = () => ({ status: 200, body: {} });
let offline = false;
globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
  if (offline) throw new TypeError('Failed to fetch');
  const headers = (init.headers ?? {}) as Record<string, string>;
  const c: Call = {
    method: init.method ?? 'GET', path: String(input), body: init.body ? JSON.parse(String(init.body)) : null,
    auth: headers.Authorization ?? null,
  };
  calls.push(c);
  const r = reply(c);
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const ch = await import('../src/features/challenge.ts');

const RESULT = { status: 'finished', n: 15, correct: 2, points: 300, timeMs: 5000, rank: 1, total: 1, percentile: null, marks: [] };

beforeEach(async () => {
  store.clear();
  calls = [];
  offline = false;
  reply = (c) => c.path.endsWith('/start')
    ? { status: 201, body: { id: 'daily-2026-11-08', tasks: [{ id: 't0' }, { id: 't1' }], startedAt: '2026-11-08T10:00:00Z', deadline: '2026-11-08T10:30:00Z' } }
    : c.path.endsWith('/finish') ? { status: 200, body: { result: RESULT } } : { status: 404, body: { error: { code: 'not_found' } } };
  acct._setModuleForTests(fakeModule(), { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' });
  await acct.login();
});

test('rankedAvailable: nur angemeldet', async () => {
  assert.equal(ch.rankedAvailable(), true);
  await acct.logout();
  assert.equal(ch.rankedAvailable(), false);
});

test('startAttempt legt die Outbox an; laufender Versuch wird nicht vorzeitig abgegeben', async () => {
  const s = await ch.startAttempt('daily-2026-11-08');
  assert.equal(s.tasks.length, 2);
  assert.equal(calls[0]?.auth, `Bearer ${session.accessToken}`);
  assert.deepEqual(calls[0]?.body, { id: 'daily-2026-11-08', lang: 'de' });
  ch.recordAnswer('daily-2026-11-08', { i: 0, input: 42, ms: 1500 });
  ch.recordAnswer('daily-2026-11-08', { i: 0, input: 99, ms: 1 }); // doppelt: die erste zählt
  assert.equal(await ch.flushPending(), null);
  assert.equal(calls.length, 1, 'kein /finish während der Runde');
  const r = await ch.finishAttempt('daily-2026-11-08');
  assert.deepEqual(r, RESULT);
  assert.deepEqual(calls[1]?.body, { id: 'daily-2026-11-08', lang: 'de', answers: [{ i: 0, input: 42, ms: 1500 }] });
  assert.equal(ch.pendingAttempt(), null);
  assert.deepEqual(ch.cachedResult('daily-2026-11-08'), RESULT);
});

test('ohne Netz bleibt die Abgabe in der Outbox und geht beim nächsten Versuch raus', async () => {
  await ch.startAttempt('daily-2026-11-08');
  ch.recordAnswer('daily-2026-11-08', { i: 1, input: 7, ms: 2000 });
  offline = true;
  assert.equal(await ch.finishAttempt('daily-2026-11-08'), null);
  assert.equal(ch.pendingAttempt()?.closed, true);
  offline = false;
  assert.deepEqual(await ch.flushPending(), RESULT);
  assert.equal(ch.pendingAttempt(), null);
});

test('abgebrochene Runde (neu geladen): flushPending gibt sie mit den bisherigen Antworten ab', async () => {
  store.set('mm:v3:challenge.pending', JSON.stringify({
    id: 'daily-2026-11-07', lang: 'en', startedAt: 'x', deadline: 'y', count: 15, answers: [{ i: 0, input: 5, ms: 900 }], closed: false,
  }));
  assert.deepEqual(await ch.flushPending(), RESULT);
  assert.deepEqual(calls[0]?.body, { id: 'daily-2026-11-07', lang: 'en', answers: [{ i: 0, input: 5, ms: 900 }] });
});

test('endgültige Fehler leeren die Outbox, vorübergehende nicht', async () => {
  store.set('mm:v3:challenge.pending', JSON.stringify({ id: 'daily-2026-11-07', lang: 'de', startedAt: 'x', deadline: 'y', count: 15, answers: [], closed: true }));
  reply = () => ({ status: 503, body: { error: { code: 'server_error' } } });
  assert.equal(await ch.flushPending(), null);
  assert.ok(ch.pendingAttempt());
  reply = () => ({ status: 404, body: { error: { code: 'no_attempt' } } });
  assert.equal(await ch.flushPending(), null);
  assert.equal(ch.pendingAttempt(), null);
});

test('Fehlercodes vom Server kommen als ChallengeError an', async () => {
  reply = () => ({ status: 409, body: { error: { code: 'already_played' } } });
  await assert.rejects(ch.startAttempt('daily-2026-11-08'), (e: unknown) => ch.challengeErrorCode(e) === 'already_played');
  reply = () => ({ status: 500, body: { error: { code: 'weird' } } });
  await assert.rejects(ch.loadBoard('daily-2026-11-08', null), (e: unknown) => ch.challengeErrorCode(e) === 'server_error');
  offline = true;
  await assert.rejects(ch.loadOverview(), (e: unknown) => ch.challengeErrorCode(e) === 'network');
});
