// Liga & Champion (v9 K): /api/challenge/league mit Fake-Store – Validierung, Rechte, Auswahl, CHAMPION_COUNT, unavailable
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _resetChallengeState, handleChallenge } from '../server/challenge.ts';
import type { ChallengeEnv } from '../server/challenge.ts';
import { DbError } from '../server/challenge-store.ts';
import type { Rpc } from '../server/challenge-store.ts';
import { ACTIVE_DAYS, MASTER_RATING, MAX_DAILY_GAIN, MIN_RANKED_DAILIES, createRpcLeagueStore, parseChampionCount } from '../server/league.ts';
import type { ChampionRow, LeagueStore } from '../server/league.ts';
import { tierIndex } from '../src/core/league.ts';

const TOKENS: Record<string, string> = { 'token-of-user-1-xxxxxxxx': 'u1', 'token-of-user-2-xxxxxxxx': 'u2' };

interface Acc { rating: number; tier: number; dayStart: number; ranked: number; listed: boolean; name: string; at: number }

/** Fake-Store mit denselben Regeln wie sql/007_league.sql (Zuwachs pro Tag, Meister, gewertete Dailys) */
function fakeStore(accounts: Record<string, Acc>): LeagueStore & { calls: number } {
  const store = {
    calls: 0,
    async put(userId: string, rating: number, tier: number, maxGain: number) {
      store.calls++;
      const a = accounts[userId] ?? { rating: 0, tier: 0, dayStart: 0, ranked: 0, listed: false, name: userId, at: 0 };
      const next = Math.min(rating, a.dayStart + maxGain);
      const capped = next < rating;
      accounts[userId] = { ...a, rating: next, tier: capped ? a.tier : tier, at: Date.now() };
      return { rating: next, tier: accounts[userId]?.tier ?? 0, capped };
    },
    async champions(o: { minRating: number; limit: number; userId: string | null; activeDays: number; minRanked: number }) {
      assert.equal(o.activeDays, ACTIVE_DAYS);
      assert.equal(o.minRanked, MIN_RANKED_DAILIES);
      assert.equal(o.minRating, MASTER_RATING);
      const ok = (a: Acc): boolean => a.rating >= o.minRating && a.ranked >= o.minRanked;
      const eligible = Object.entries(accounts).filter(([, a]) => ok(a))
        .sort(([, a], [, b]) => b.rating - a.rating || a.at - b.at);
      const rows: ChampionRow[] = eligible.map(([id, a], i) => ({
        rank: i + 1, name: a.listed || id === o.userId ? a.name : null, rating: a.rating, me: id === o.userId, total: eligible.length,
      })).filter((r) => (r.rank ?? 0) <= o.limit || r.me);
      const mine = o.userId ? accounts[o.userId] : undefined;
      if (mine && !rows.some((r) => r.me)) rows.push({ rank: null, name: mine.name, rating: mine.rating, me: true, total: eligible.length });
      return rows;
    },
  };
  return store;
}

const acc = (rating: number, o: Partial<Acc> = {}): Acc => ({ rating, tier: tierIndex(rating), dayStart: rating, ranked: 5, listed: true, name: `n${rating}`, at: 1, ...o });

async function call(store: LeagueStore, method: 'GET' | 'POST', path: string, o: { user?: number; body?: unknown; env?: ChallengeEnv; ip?: string } = {}) {
  const headers: Record<string, string> = { 'CF-Connecting-IP': o.ip ?? '10.0.0.1' };
  if (o.user) headers.Authorization = `Bearer token-of-user-${o.user}-xxxxxxxx`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(`https://mm.test/api/challenge${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const rpc: Rpc = async () => { throw new Error('rpc darf nicht direkt gerufen werden'); };
  const res = await handleChallenge(req, o.env ?? {}, { rpc, league: store, verify: async (t) => TOKENS[t] ?? null });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const code = (b: Record<string, unknown>): unknown => (b.error as { code?: unknown } | undefined)?.code;

describe('v9 K: POST /league', () => {
  beforeEach(() => { _resetChallengeState(); });

  it('braucht Anmeldung', async () => {
    const store = fakeStore({});
    const r = await call(store, 'POST', '/league', { body: { rating: 500, tier: 9 } });
    assert.equal(r.status, 401);
    assert.equal(code(r.body), 'unauthorized');
    assert.equal(store.calls, 0);
  });

  it('prüft Ganzzahlen, Bereiche und tier === tierIndex(rating)', async () => {
    const store = fakeStore({});
    const bad: unknown[] = [
      {}, { rating: 500 }, { tier: 9 }, { rating: '500', tier: 9 }, { rating: 500.5, tier: 9 }, { rating: -1, tier: 0 },
      { rating: 1001, tier: 15 }, { rating: 500, tier: 16 }, { rating: 500, tier: 8 }, { rating: 779, tier: 15 }, { rating: 780, tier: 14 },
      { rating: null, tier: null },
    ];
    for (const body of bad) {
      const r = await call(store, 'POST', '/league', { user: 1, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(code(r.body), 'invalid');
    }
    assert.equal(store.calls, 0);
    for (const rating of [0, 49, 50, 449, 450, 779, 780, 1000]) {
      const r = await call(store, 'POST', '/league', { user: 1, body: { rating, tier: tierIndex(rating) } });
      assert.equal(r.status, 200, String(rating));
    }
  });

  it('kürzt den Zuwachs auf 150 LP pro Tag, Abstieg gilt sofort', async () => {
    const store = fakeStore({ u1: acc(500) });
    const up = await call(store, 'POST', '/league', { user: 1, body: { rating: 900, tier: tierIndex(900) } });
    assert.equal(up.status, 200);
    assert.deepEqual(up.body, { rating: 500 + MAX_DAILY_GAIN, tier: tierIndex(500), capped: true });
    const ok = await call(store, 'POST', '/league', { user: 1, body: { rating: 640, tier: tierIndex(640) } });
    assert.deepEqual(ok.body, { rating: 640, tier: tierIndex(640), capped: false });
    const down = await call(store, 'POST', '/league', { user: 1, body: { rating: 300, tier: tierIndex(300) } });
    assert.deepEqual(down.body, { rating: 300, tier: tierIndex(300), capped: false });
  });

  it('Rate-Limit wie die übrigen Routen (60/min je IP)', async () => {
    const store = fakeStore({});
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await call(store, 'POST', '/league', { user: 1, body: { rating: 0, tier: 0 }, ip: '10.9.9.9' })).status;
    assert.equal(last, 429);
  });

  it('503 unavailable, wenn Funktion/Tabelle fehlt', async () => {
    for (const c of ['42883', '42P01', 'PGRST202', 'PGRST205']) {
      const broken: LeagueStore = { put: async () => { throw new DbError(c); }, champions: async () => { throw new DbError(c); } };
      const p = await call(broken, 'POST', '/league', { user: 1, body: { rating: 0, tier: 0 } });
      assert.equal(p.status, 503, c);
      assert.equal(code(p.body), 'unavailable');
      const g = await call(broken, 'GET', '/league/champions');
      assert.equal(g.status, 503);
      assert.equal(code(g.body), 'unavailable');
    }
    const other: LeagueStore = { put: async () => { throw new DbError('XX000'); }, champions: async () => [] };
    const r = await call(other, 'POST', '/league', { user: 1, body: { rating: 0, tier: 0 } });
    assert.equal(r.status, 503);
    assert.equal(code(r.body), 'server_error');
  });

  it('RPC-Store ruft league_put mit benannten Argumenten', async () => {
    const seen: Array<[string, Record<string, unknown>]> = [];
    const rpc: Rpc = async (fn, args) => { seen.push([fn, args]); return [{ rating: 600, tier: 12, capped: false }]; };
    const r = await createRpcLeagueStore(rpc).put('u1', 600, 12, 150);
    assert.deepEqual(r, { rating: 600, tier: 12, capped: false });
    assert.deepEqual(seen[0], ['league_put', { p_user: 'u1', p_rating: 600, p_tier: 12, p_max_daily_gain: 150 }]);
  });
});

describe('v9 K: GET /league/champions', () => {
  beforeEach(() => { _resetChallengeState(); });

  const field = (): Record<string, Acc> => {
    const a: Record<string, Acc> = {};
    for (let i = 0; i < 14; i++) a[`m${i}`] = acc(990 - i * 5, { name: `Meister${i}`, at: i });
    a.u1 = acc(800, { name: 'Ich', listed: false });
    a.u2 = acc(1000, { name: 'Zwei', listed: false, ranked: 2 }); // zu wenige gewertete Dailys
    a.low = acc(MASTER_RATING - 1, { name: 'Fast' });             // noch kein Meister
    return a;
  };

  it('Standard 10: Top 10 nach Wertung, Namen nur mit Zustimmung, ohne Konto kein me', async () => {
    const r = await call(fakeStore(field()), 'GET', '/league/champions');
    assert.equal(r.status, 200);
    assert.equal(r.body.count, 10);
    const list = r.body.champions as Array<{ rank: number; name: string; rating: number; me: boolean }>;
    assert.deepEqual(list.map((c) => c.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(list[0]?.name, 'Meister0');
    assert.ok(list.every((c, i) => i === 0 || (list[i - 1]?.rating ?? 0) >= c.rating));
    assert.equal(r.body.me, null);
    assert.equal(JSON.stringify(r.body).includes('Zwei'), false);
  });

  it('Gleichstand: früher erreicht gewinnt', async () => {
    const a = { x: acc(900, { name: 'Spaet', at: 9 }), y: acc(900, { name: 'Frueh', at: 1 }) };
    const r = await call(fakeStore(a), 'GET', '/league/champions');
    assert.deepEqual((r.body.champions as Array<{ name: string }>).map((c) => c.name), ['Frueh', 'Spaet']);
  });

  it('me: Platz 15 ist kein Champion, bleibt aber sichtbar', async () => {
    const r = await call(fakeStore(field()), 'GET', '/league/champions', { user: 1 });
    assert.deepEqual(r.body.me, { rank: 15, rating: 800, champion: false });
    assert.equal((r.body.champions as unknown[]).length, 10);
  });

  it('me ist Champion, wenn unter den besten N; eigener Name auch ohne listed', async () => {
    const a = field();
    a.u1 = acc(995, { name: 'Ich', listed: false, at: 0 });
    const r = await call(fakeStore(a), 'GET', '/league/champions', { user: 1 });
    assert.deepEqual(r.body.me, { rank: 1, rating: 995, champion: true });
    const first = (r.body.champions as Array<{ name: string; me: boolean }>)[0];
    assert.equal(first?.name, 'Ich');
    assert.equal(first?.me, true);
  });

  it('me ohne gewertete Dailys: Rang null, kein Champion', async () => {
    const r = await call(fakeStore(field()), 'GET', '/league/champions', { user: 2 });
    assert.deepEqual(r.body.me, { rank: null, rating: 1000, champion: false });
    assert.equal((r.body.champions as Array<{ me: boolean }>).some((c) => c.me), false);
  });

  it('CHAMPION_COUNT: erweiterbar, begrenzt auf 1–1000, Unsinn -> 10', async () => {
    const run = async (v: string | undefined) => (await call(fakeStore(field()), 'GET', '/league/champions', { env: { CHAMPION_COUNT: v } })).body;
    assert.equal(((await run('3')).champions as unknown[]).length, 3);
    const big = await run('25');
    assert.equal(big.count, 25);
    assert.equal((big.champions as unknown[]).length, 15); // nur so viele zählen (14 + Ich)
    assert.equal((await run('0')).count, 1);
    assert.equal((await run('5000')).count, 1000);
    assert.equal((await run('abc')).count, 10);
    assert.equal((await run(undefined)).count, 10);
    const r3 = await call(fakeStore(field()), 'GET', '/league/champions', { user: 1, env: { CHAMPION_COUNT: '15' } });
    assert.deepEqual(r3.body.me, { rank: 15, rating: 800, champion: true });
  });

  it('parseChampionCount', () => {
    assert.equal(parseChampionCount(undefined), 10);
    assert.equal(parseChampionCount(''), 10);
    assert.equal(parseChampionCount(' 20 '), 20);
    assert.equal(parseChampionCount('1'), 1);
    assert.equal(parseChampionCount('-4'), 1);
    assert.equal(parseChampionCount('1000'), 1000);
    assert.equal(parseChampionCount('1001'), 1000);
    assert.equal(parseChampionCount('12.9'), 12);
    assert.equal(parseChampionCount('1e3'), 10);
    assert.equal(parseChampionCount('NaN'), 10);
  });
});
