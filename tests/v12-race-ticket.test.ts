// Live-Rennen (v12 R3): Ticket (HMAC-SHA-256), Route POST /race/:id/ticket gegen einen Fake-Store, Pages-Function-Logik, Einhängen
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TICKET_TTL_MS, raceTicketRoute, signTicket, verifyTicket } from '../server/race-ticket.ts';
import type { TicketClaims, TicketRoute } from '../server/race-ticket.ts';
import { RACE_HEADERS, handleRaceLive } from '../server/race-live.ts';
import type { RaceLiveEnv, RoomStub } from '../server/race-live.ts';
import { _resetChallengeState, handleChallenge } from '../server/challenge.ts';
import type { Rpc } from '../server/challenge-store.ts';
import type { RaceInfo } from '../src/core/race-room.ts';

const KEY = 'k'.repeat(48);
const NOW = Date.parse('2026-11-11T12:00:00Z');
const claims = (over: Partial<TicketClaims> = {}): TicketClaims => ({ raceId: 'race-abc', userId: 'u1', name: 'Anna', d: 60, exp: NOW + TICKET_TTL_MS, ...over });
const flip = (s: string, at: number): string => s.slice(0, at) + (s[at] === 'A' ? 'B' : 'A') + s.slice(at + 1);

describe('Ticket: Signatur und Prüfung', () => {
  it('Round-Trip', async () => {
    const t = await signTicket(claims(), KEY);
    assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(await verifyTicket(t, KEY, NOW), claims());
  });

  it('läuft nach 60 s ab', async () => {
    const t = await signTicket(claims(), KEY);
    assert.ok(await verifyTicket(t, KEY, NOW + TICKET_TTL_MS - 1));
    assert.equal(await verifyTicket(t, KEY, NOW + TICKET_TTL_MS), null);
    assert.equal(await verifyTicket(t, KEY, NOW + 10 * TICKET_TTL_MS), null);
  });

  it('Manipulation an Nutzlast oder Signatur, falscher Schlüssel, Müll', async () => {
    const t = await signTicket(claims(), KEY);
    const [p, s] = t.split('.') as [string, string];
    assert.equal(await verifyTicket(`${flip(p, 3)}.${s}`, KEY, NOW), null);
    assert.equal(await verifyTicket(`${p}.${flip(s, 3)}`, KEY, NOW), null);
    assert.equal(await verifyTicket(t, 'x'.repeat(48), NOW), null);
    assert.equal(await verifyTicket(t, '', NOW), null);
    // Fremde Nutzlast mit gültiger Signatur eines anderen Tickets
    const other = await signTicket(claims({ userId: 'u2' }), KEY);
    assert.equal(await verifyTicket(`${other.split('.')[0]}.${s}`, KEY, NOW), null);
    for (const junk of ['', '.', 'a.b.c', 'a', `${p}.`, `.${s}`, 'ä.ö', 'x'.repeat(2000)]) assert.equal(await verifyTicket(junk, KEY, NOW), null);
  });

  it('Nutzlast mit falschen Typen wird verworfen, auch bei gültiger Signatur', async () => {
    const bad = await signTicket({ ...claims(), d: 'sechzig' } as unknown as TicketClaims, KEY);
    assert.equal(await verifyTicket(bad, KEY, NOW), null);
    const empty = await signTicket(claims({ userId: '' }), KEY);
    assert.equal(await verifyTicket(empty, KEY, NOW), null);
  });

  it('ist kein JWT: ein mit demselben Schlüssel signierter Text ohne Präfix passt nicht', async () => {
    const payload = Buffer.from(JSON.stringify(claims())).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', KEY).update(payload).digest('base64url');
    assert.equal(await verifyTicket(`${payload}.${sig}`, KEY, NOW), null);
    const sigOk = createHmac('sha256', KEY).update(`race-ticket.v1.${payload}`).digest('base64url');
    assert.ok(await verifyTicket(`${payload}.${sigOk}`, KEY, NOW));
  });
});

/* ---------- Route ---------- */

const race = (over: Partial<RaceInfo> = {}): RaceInfo => ({
  id: 'race-abc', groupId: 'g1', createdBy: 'u1', createdByName: 'Anna', kind: 'live',
  config: { durationS: 60, cat: 'mult', lvl: 2 }, seed: 1, createdAt: new Date(NOW - 60_000).toISOString(), startsAt: null,
  endsAt: new Date(NOW + 600_000).toISOString(), ...over,
});

function route(over: Partial<TicketRoute> & { found?: { race: RaceInfo; member: boolean } | null } = {}): TicketRoute {
  const found = over.found === undefined ? { race: race(), member: true } : over.found;
  return {
    path: '/race/race-abc/ticket', userId: 'u1', now: NOW, key: KEY, info: () => Promise.resolve(found),
    name: () => Promise.resolve('Anna'), ...over,
  };
}

describe('Route POST /race/:id/ticket', () => {
  it('Mitglied eines Live-Rennens bekommt ein 60-s-Ticket mit Name und Dauer', async () => {
    const r = await raceTicketRoute(route());
    assert.equal(r.status, 200);
    const body = r.body as { ticket: string; expiresAt: string };
    assert.equal(body.expiresAt, new Date(NOW + TICKET_TTL_MS).toISOString());
    assert.deepEqual(await verifyTicket(body.ticket, KEY, NOW), { raceId: 'race-abc', userId: 'u1', name: 'Anna', d: 60, exp: NOW + TICKET_TTL_MS });
  });

  it('prüft Anmeldung, Mitgliedschaft, Art, Verfall, Profil, Konfiguration', async () => {
    const code = async (o: Parameters<typeof route>[0]): Promise<string> => ((await raceTicketRoute(route(o))).body as { error: { code: string } }).error.code;
    assert.equal((await raceTicketRoute(route({ userId: null }))).status, 401);
    assert.equal((await raceTicketRoute(route({ found: { race: race(), member: false } }))).status, 403);
    assert.equal(await code({ found: { race: race(), member: false } }), 'not_member');
    assert.equal(await code({ found: null }), 'not_found');
    assert.equal(await code({ found: { race: race({ kind: 'ghost' }), member: true } }), 'not_found');
    assert.equal(await code({ found: { race: race({ endsAt: new Date(NOW).toISOString() }), member: true } }), 'closed');
    assert.equal(await code({ name: () => Promise.resolve(null) }), 'no_profile');
    assert.equal(await code({ info: undefined }), 'unavailable');
    assert.equal(await code({ key: '  ' }), 'unavailable');
    assert.equal(await code({ path: '/race/ab/ticket' }), 'not_found');
  });

  it('fragt den Store mit Rennen und Nutzer', async () => {
    const seen: string[] = [];
    await raceTicketRoute(route({ info: (r, u) => { seen.push(`${r}:${u}`); return Promise.resolve({ race: race(), member: true }); } }));
    assert.deepEqual(seen, ['race-abc:u1']);
  });
});

describe('Einhängen in /api/challenge', () => {
  const rpc: Rpc = (fn) => {
    if (fn === 'challenge_profile_get' || fn.includes('profile')) return Promise.resolve([{ display_name: 'Anna', listed: true }]);
    return Promise.resolve([]);
  };
  const call = (deps: Parameters<typeof handleChallenge>[2], auth = true): Promise<Response> =>
    handleChallenge(
      new Request('https://x.test/api/challenge/race/race-abc/ticket', { method: 'POST', headers: auth ? { Authorization: 'Bearer token-of-user-1-xxxxxxxx' } : {} }),
      { AUTH_JWT_KEY: KEY }, { rpc, verify: (tk) => Promise.resolve(tk === 'token-of-user-1-xxxxxxxx' ? 'u1' : null), now: () => NOW, ...deps });

  it('ohne R2-Store → 503 unavailable; mit Store → Ticket; ohne Anmeldung → 401', async () => {
    _resetChallengeState();
    const none = await call({});
    assert.equal(none.status, 503);
    assert.deepEqual(await none.json(), { error: { code: 'unavailable' } });
    assert.equal((await call({ raceInfo: () => Promise.resolve({ race: race(), member: true }) }, false)).status, 401);
    const ok = await call({ raceInfo: () => Promise.resolve({ race: race(), member: true }) });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { ticket: string };
    assert.equal((await verifyTicket(body.ticket, KEY, NOW))?.userId, 'u1');
  });
});

/* ---------- Pages Function ---------- */

describe('GET /api/race/live/<id>?t=<ticket>', () => {
  const calls: Request[] = [];
  const env = (): RaceLiveEnv => ({
    AUTH_JWT_KEY: KEY,
    RACE_ROOM: {
      idFromName: (n: string) => `id:${n}`,
      get: (id: unknown): RoomStub => ({ fetch: (r: Request) => { calls.push(r); return Promise.resolve(new Response(`room ${String(id)}`, { status: 200 })); } }),
    },
  });
  const ws = (path: string, extra: Record<string, string> = {}): Request =>
    new Request(`https://x.test/api/race/live/${path}`, { headers: { Upgrade: 'websocket', ...extra } });

  it('ohne Binding oder Schlüssel: 503 unavailable; Erreichbarkeitsprüfung ohne ID: 200', async () => {
    assert.equal((await handleRaceLive(ws('race-abc'), { AUTH_JWT_KEY: KEY }, NOW)).status, 503);
    assert.equal((await handleRaceLive(ws('race-abc'), { RACE_ROOM: env().RACE_ROOM }, NOW)).status, 503);
    const probe = await handleRaceLive(new Request('https://x.test/api/race/live/'), env(), NOW);
    assert.equal(probe.status, 200);
    assert.deepEqual(await probe.json(), { live: true });
  });

  it('gültiges Ticket: Upgrade geht mit geprüfter Identität an das Objekt dieses Rennens', async () => {
    calls.length = 0;
    const t = await signTicket(claims({ name: 'Zoë Müller' }), KEY);
    const res = await handleRaceLive(ws(`race-abc?t=${t}`, { [RACE_HEADERS.user]: 'attacker', [RACE_HEADERS.name]: 'x' }), env(), NOW);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'room id:race-abc');
    const fwd = calls[0]!;
    assert.equal(fwd.headers.get(RACE_HEADERS.user), 'u1');
    assert.equal(decodeURIComponent(fwd.headers.get(RACE_HEADERS.name) ?? ''), 'Zoë Müller');
    assert.equal(fwd.headers.get(RACE_HEADERS.race), 'race-abc');
    assert.equal(fwd.headers.get(RACE_HEADERS.duration), '60');
    assert.equal(fwd.headers.get('Upgrade'), 'websocket');
  });

  it('ablehnen: kein/abgelaufenes/fremdes Ticket, falsches Rennen, kein Upgrade, falsche Methode', async () => {
    calls.length = 0;
    const t = await signTicket(claims(), KEY);
    assert.equal((await handleRaceLive(ws('race-abc'), env(), NOW)).status, 401);
    assert.equal((await handleRaceLive(ws(`race-abc?t=${t}`), env(), NOW + TICKET_TTL_MS)).status, 401);
    assert.equal((await handleRaceLive(ws(`race-abc?t=${flip(t, 4)}`), env(), NOW)).status, 401);
    assert.equal((await handleRaceLive(ws(`race-other?t=${t}`), env(), NOW)).status, 401);
    assert.equal((await handleRaceLive(new Request(`https://x.test/api/race/live/race-abc?t=${t}`), env(), NOW)).status, 426);
    assert.equal((await handleRaceLive(new Request(`https://x.test/api/race/live/race-abc?t=${t}`, { method: 'POST', headers: { Upgrade: 'websocket' } }), env(), NOW)).status, 405);
    assert.equal((await handleRaceLive(ws(`a/b?t=${t}`), env(), NOW)).status, 404);
    assert.equal(calls.length, 0);
  });
});
