// Liga-Sync im Client (v9 K): gedrosselt, nur bei Änderung, Champion-Status nur für Meister, ohne Konto/Netz still
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
  return { createPasskeyAuth: () => auth as never, createPasskeySupabaseClient: () => ({}), createAccountApi: () => ({}) as never, createSupabaseSyncProvider: () => ({}) as never };
}

interface Call { method: string; path: string; body: unknown; auth: string | null }
let calls: Call[] = [];
let reply: (c: Call) => { status: number; body: unknown } = () => ({ status: 200, body: {} });
let offline = false;
globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
  if (offline) throw new TypeError('Failed to fetch');
  const headers = (init.headers ?? {}) as Record<string, string>;
  const c: Call = { method: init.method ?? 'GET', path: String(input), body: init.body ? JSON.parse(String(init.body)) : null, auth: headers.Authorization ?? null };
  calls.push(c);
  const r = reply(c);
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const ls = await import('../src/features/league-sync.ts');
let rating = 520;

const champBoard = (me: { rank: number | null; rating: number; champion: boolean } | null) => ({ count: 10, total: 3, champions: [], me });

beforeEach(async () => {
  store.clear();
  calls = [];
  offline = false;
  rating = 520;
  ls._resetLeagueSync();
  ls._setRatingSourceForTests(() => rating);
  reply = (c) => c.path.endsWith('/league') ? { status: 200, body: { rating, tier: 0, capped: false } }
    : { status: 200, body: champBoard({ rank: 3, rating, champion: true }) };
  acct._setModuleForTests(fakeModule(), { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k' });
  await acct.login();
});

test('lädt Wertung samt passender Stufe hoch, dann nur bei Änderung und höchstens alle 10 Minuten', async () => {
  await ls.syncLeague();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, '/api/challenge/league');
  assert.deepEqual(calls[0]?.body, { rating: 520, tier: 10 });
  assert.equal(calls[0]?.auth, `Bearer ${session.accessToken}`);
  await ls.syncLeague();
  assert.equal(calls.length, 1, 'unverändert: kein Upload');
  rating = 560;
  await ls.syncLeague();
  assert.equal(calls.length, 1, 'geändert, aber gedrosselt');
  const saved = JSON.parse(store.get('mm:v9:league.sync') ?? '{}') as { uploadedAt: number };
  saved.uploadedAt -= 11 * 60_000;
  store.set('mm:v9:league.sync', JSON.stringify(saved));
  await ls.syncLeague();
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
  assert.deepEqual(calls[calls.length - 1]?.body, { rating: 560, tier: 11 });
});

test('Champion-Status nur für Meister: Anzeige erst bei Stufe 15 und Server-Meldung', async () => {
  await ls.syncLeague();
  assert.equal(ls.championInfo(), null);
  assert.equal(calls.some((c) => c.path.endsWith('/champions')), false, 'unter Meister keine Abfrage');
  rating = 800;
  await ls.syncLeague(true);
  assert.deepEqual(ls.championInfo(), { rank: 3 });
  assert.equal(ls.championCount(), 10);
  // Server meldet Champion, lokal aber kein Meister -> keine Anzeige
  rating = 600;
  reply = (c) => c.path.endsWith('/league') ? { status: 200, body: { rating, tier: 12, capped: false } } : { status: 200, body: champBoard({ rank: 1, rating: 900, champion: true }) };
  await ls.loadChampions();
  assert.equal(ls.championInfo(), null);
});

test('gekürzte Wertung: später erneut melden', async () => {
  reply = (c) => c.path.endsWith('/league') ? { status: 200, body: { rating: 150, tier: 3, capped: true } } : { status: 200, body: champBoard(null) };
  await ls.syncLeague();
  const saved = JSON.parse(store.get('mm:v9:league.sync') ?? '{}') as { rating: number; uploadedAt: number };
  assert.equal(saved.rating, 150);
  saved.uploadedAt -= 11 * 60_000;
  store.set('mm:v9:league.sync', JSON.stringify(saved));
  await ls.syncLeague();
  assert.equal(calls.filter((c) => c.method === 'POST').length, 2);
});

test('503 unavailable: Champion ausgeblendet, kein Upload-Sturm', async () => {
  reply = () => ({ status: 503, body: { error: { code: 'unavailable' } } });
  await ls.syncLeague();
  assert.equal(ls.championAvailable(), false);
  assert.equal(ls.championInfo(), null);
  await ls.syncLeague();
  assert.equal(calls.length, 1);
  await assert.rejects(ls.loadChampions(), (e: unknown) => (e as { code?: string }).code === 'unavailable');
});

test('ohne Konto und ohne Netz still', async () => {
  offline = true;
  await ls.syncLeague();
  assert.equal(ls.championInfo(), null);
  assert.equal(ls.championAvailable(), true);
  offline = false;
  await acct.logout();
  calls = [];
  await ls.syncLeague();
  assert.equal(calls.length, 0);
  assert.equal(ls.championInfo(), null);
});

test('Wechsel des Kontos verwirft den Zwischenspeicher', async () => {
  rating = 800;
  await ls.syncLeague(true);
  assert.deepEqual(ls.championInfo(), { rank: 3 });
  const saved = JSON.parse(store.get('mm:v9:league.sync') ?? '{}') as { user: string };
  store.set('mm:v9:league.sync', JSON.stringify({ ...saved, user: 'someone-else' }));
  assert.equal(ls.championInfo(), null);
});
