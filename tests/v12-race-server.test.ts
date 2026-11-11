// /api/challenge/race/* (v12 R2) mit dem Fake-Speicher: Validierung, Mitgliedschaft, Zeitgrenzen, Kulanz, Flagging,
// ein Lauf je Person, Live-`go`, unavailable. Das SQL selbst prüft tests/v12-race-sql.test.ts.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _resetChallengeState, handleChallenge } from '../server/challenge.ts';
import type { ChallengeDeps } from '../server/challenge.ts';
import { createFakeRaceStore } from '../server/race.ts';
import type { FakeRaceStore } from '../server/race.ts';
import {
  RACE_LIVE_LEAD_MS, RACE_LIVE_LOBBY_MS, RACE_LIVE_TAIL_MS, RACE_MAX_OPEN_PER_GROUP, RACE_OPEN_MS, RACE_FINISH_SLACK_MS,
  type RaceAnswerIn, type RaceBoardRow, type RaceInfo, type RaceListItem,
} from '../src/core/race-api.ts';
import { RACE_GRACE_MS, raceTasks, type RaceConfig } from '../src/core/race.ts';

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const tokenOf = (n: number): string => `token-of-user-${n}-xxxxxxxx`;
const TOKENS: Record<string, string> = Object.fromEntries([1, 2, 3, 4].map((n) => [tokenOf(n), U(n)]));
const T0 = Date.parse('2026-11-11T12:00:00Z');
const CFG: RaceConfig = { durationS: 30, cat: 'mult', lvl: 2 };

let store: FakeRaceStore;
let now = T0;
let seq = 0;

const deps = (): ChallengeDeps => ({
  rpc: async () => [], race: store, now: () => now, verify: async (t) => TOKENS[t] ?? null,
  random: () => ((seq = (seq * 9301 + 49297) % 233280) / 233280),
});

async function call<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, o: { user?: number; body?: unknown } = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'CF-Connecting-IP': `10.0.${o.user ?? 0}.${(seq += 1) % 250}` };
  if (o.user) headers.Authorization = `Bearer ${tokenOf(o.user)}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await handleChallenge(new Request(`https://mm.test/api/challenge${path}`, {
    method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body),
  }), {}, deps());
  return { status: res.status, body: (await res.json()) as T };
}
const code = (b: unknown): string | undefined => (b as { error?: { code?: string } }).error?.code;

async function make(user = 1, o: { kind?: 'ghost' | 'live'; open?: string; config?: RaceConfig; group?: string } = {}): Promise<RaceInfo> {
  const r = await call<{ race: RaceInfo }>('POST', '/race/create', { user, body: { groupId: o.group ?? G, kind: o.kind ?? 'ghost', config: o.config ?? CFG, ...(o.open ? { open: o.open } : {}) } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.race;
}

/** Eigene Antworten aus dem Seed: erste `right` richtig, danach `wrong` falsche, je `gap` ms */
function play(race: RaceInfo, right: number, wrong = 0, gap = 1000, start = 1000): RaceAnswerIn[] {
  const tasks = raceTasks(race.seed, race.config, right + wrong);
  return tasks.map((task, i) => ({ i, input: i < right ? task.expected : task.expected + 3, ms: start + i * gap }));
}

describe('Gruppen-Rennen: Server', () => {
  beforeEach(() => {
    _resetChallengeState();
    store = createFakeRaceStore();
    store.setGroup(G, { [U(1)]: 'Anna', [U(2)]: 'Ben', [U(3)]: 'Cleo' });
    store.setGroup(G2, { [U(4)]: 'Dora' });
    now = T0;
  });

  it('Anlegen: Validierung und Anmeldung', async () => {
    assert.equal(code((await call('POST', '/race/create', { body: { groupId: G, kind: 'ghost', config: CFG } })).body), 'unauthorized');
    const bad: unknown[] = [
      { kind: 'ghost', config: CFG }, { groupId: 'x', kind: 'ghost', config: CFG }, { groupId: G, kind: 'duell', config: CFG },
      { groupId: G, kind: 'ghost', config: { ...CFG, durationS: 45 } }, { groupId: G, kind: 'ghost', config: 'mult' },
      { groupId: G, kind: 'ghost', config: CFG, open: '2h' }, { groupId: G, config: CFG },
    ];
    for (const body of bad) {
      const r = await call('POST', '/race/create', { user: 1, body });
      assert.deepEqual([r.status, code(r.body)], [400, 'invalid'], JSON.stringify(body));
    }
    const out = await call('POST', '/race/create', { user: 4, body: { groupId: G, kind: 'ghost', config: CFG } });
    assert.deepEqual([out.status, code(out.body)], [403, 'not_member']);
  });

  it('Anlegen: Geister-Rennen mit Offen-Dauer, Live mit 15 min Lobby', async () => {
    const dflt = await make(1);
    assert.equal(Date.parse(dflt.endsAt) - now, RACE_OPEN_MS['24h']);
    assert.deepEqual([dflt.kind, dflt.groupId, dflt.createdBy, dflt.createdByName, dflt.startsAt, dflt.config], ['ghost', G, U(1), 'Anna', null, CFG]);
    assert.ok(Number.isInteger(dflt.seed) && dflt.seed >= 0 && dflt.seed < 2 ** 32);
    for (const open of ['1h', '48h', '7d'] as const) {
      assert.equal(Date.parse((await make(2, { open })).endsAt) - now, RACE_OPEN_MS[open]);
    }
    // höchstens 5 offene je Gruppe (beide Arten); ein anderes Rennen in einer anderen Gruppe zählt nicht
    await make(1, { kind: 'live', open: '7d' });
    const live = [...store.races.values()].find((r) => r.info.kind === 'live')?.info;
    assert.equal(Date.parse(live?.endsAt ?? '') - now, RACE_LIVE_LOBBY_MS); // Live: open ignoriert
    assert.equal(live?.startsAt, null);
    const full = await call('POST', '/race/create', { user: 1, body: { groupId: G, kind: 'ghost', config: CFG } });
    assert.deepEqual([full.status, code(full.body)], [409, 'too_many']);
    assert.equal([...store.races.values()].filter((r) => r.info.groupId === G).length, RACE_MAX_OPEN_PER_GROUP);
    store.setGroup(G2, { [U(4)]: 'Dora', [U(1)]: 'Anna' });
    await make(1, { group: G2 });
    // abgelaufene zählen nicht mehr
    now += RACE_OPEN_MS['1h'] + 1000;
    await make(2);
  });

  it('Anlegen: höchstens 12 je Stunde und Person', async () => {
    let last = 0;
    for (let i = 0; i < 13; i++) {
      store.races.clear(); // die Grenze von 5 offenen soll hier nicht greifen
      last = (await call('POST', '/race/create', { user: 1, body: { groupId: G, kind: 'ghost', config: CFG, open: '1h' } })).status;
    }
    assert.equal(last, 429);
    now += 3_600_001;
    store.races.clear();
    assert.equal((await call('POST', '/race/create', { user: 1, body: { groupId: G, kind: 'ghost', config: CFG } })).status, 201);
  });

  it('Liste: offene zuerst, dann die letzten beendeten; nur Mitglieder', async () => {
    const a = await make(1, { open: '1h' });
    const b = await make(2, { open: '7d' });
    const c = await call<{ races: RaceListItem[] }>('GET', `/race/list?group=${G}`, { user: 3 });
    assert.deepEqual(c.body.races.map((r) => r.id), [a.id, b.id]);
    assert.deepEqual(c.body.races.map((r) => [r.myStatus, r.runs]), [['none', 0], ['none', 0]]);
    assert.equal((await call('GET', `/race/list?group=${G}`, { user: 4 })).status, 403);
    assert.equal((await call('GET', `/race/list?group=nope`, { user: 1 })).status, 400);
    assert.equal((await call('GET', `/race/list?group=${G}`)).status, 401);
    // a wird gespielt, läuft ab -> beendet mit Lauf bleibt in der Liste, b offen
    assert.equal((await call('POST', `/race/${a.id}/start`, { user: 1 })).status, 201);
    const fin = await call('POST', `/race/${a.id}/finish`, { user: 1, body: { answers: play(a, 3) } });
    assert.equal(fin.status, 200, JSON.stringify(fin.body));
    now += RACE_OPEN_MS['1h'] + 5000;
    const after = await call<{ races: RaceListItem[] }>('GET', `/race/list?group=${G}`, { user: 1 });
    assert.deepEqual(after.body.races.map((r) => [r.id, r.myStatus, r.runs]), [[b.id, 'none', 0], [a.id, 'finished', 1]]);
    // ein beendetes ohne Lauf erscheint nicht
    const c2 = await make(3, { open: '1h' });
    now += RACE_OPEN_MS['1h'] + 5000;
    const gone = await call<{ races: RaceListItem[] }>('GET', `/race/list?group=${G}`, { user: 1 });
    assert.ok(!gone.body.races.some((r) => r.id === c2.id));
  });

  it('Einzelnes Rennen: Mitglieder sehen Konfiguration, Seed, Board und eigenen Stand', async () => {
    const race = await make(1);
    const r = await call<{ race: RaceInfo; board: RaceBoardRow[]; me: unknown }>('GET', `/race/${race.id}`, { user: 2 });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.race, r.body.board, r.body.me], [race, [], null]);
    assert.equal((await call('GET', `/race/${race.id}`, { user: 4 })).status, 403);
    assert.equal(code((await call('GET', `/race/${race.id}`, { user: 4 })).body), 'not_member');
    assert.equal((await call('GET', `/race/abcdefghjkmn`, { user: 1 })).status, 404);
    assert.equal((await call('GET', `/race/ZZ`, { user: 1 })).status, 400);
    assert.equal((await call('GET', `/race/${race.id}`)).status, 401);
  });

  it('Lauf: ein Start je Person, Abgabe wertet neu, Rang und Board mit Zeitleisten', async () => {
    const race = await make(1);
    const s1 = await call<{ startedAt: string }>('POST', `/race/${race.id}/start`, { user: 1 });
    assert.equal(s1.status, 201);
    assert.equal(Date.parse(s1.body.startedAt), now);
    now += 5000;
    const again = await call<{ startedAt: string }>('POST', `/race/${race.id}/start`, { user: 1 });
    assert.deepEqual([again.status, code(again.body), again.body.startedAt], [409, 'already', s1.body.startedAt]);
    // Anna: 5 richtig, 1 falsch
    now += 40_000;
    const anna = await call<{ rank: number; correct: number; wrong: number; status: string }>('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: play(race, 5, 1) } });
    assert.deepEqual(anna.body, { rank: 1, correct: 5, wrong: 1, status: 'finished' });
    // Ben: 7 richtig -> Platz 1, Anna Platz 2
    await call('POST', `/race/${race.id}/start`, { user: 2 });
    now += 40_000;
    const ben = await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: play(race, 7) } });
    assert.deepEqual(ben.body, { rank: 1, correct: 7, wrong: 0, status: 'finished' });
    // zweite Abgabe ändert nichts (liefert den gespeicherten Stand)
    const redo = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: play(race, 20) } });
    assert.deepEqual(redo.body, { rank: 2, correct: 5, wrong: 1, status: 'finished' });
    const view = await call<{ board: RaceBoardRow[]; missing: string[]; me: { status: string; startedAt: string } }>('GET', `/race/${race.id}`, { user: 1 });
    assert.deepEqual(view.body.missing, ['Cleo']); // wer noch fehlt
    assert.deepEqual(view.body.board.map((b) => [b.rank, b.name, b.me, b.correct, b.wrong, b.status]), [
      [1, 'Ben', false, 7, 0, 'finished'], [2, 'Anna', true, 5, 1, 'finished'],
    ]);
    assert.deepEqual(view.body.board[0]?.steps.slice(0, 3), [[1000, 1], [2000, 1], [3000, 1]]);
    assert.deepEqual(view.body.board[1]?.steps.at(-1), [6000, 0]);
    assert.equal(view.body.me.status, 'finished');
    // Cleo hat nicht gespielt: sieht das Board, me = null
    const cleo = await call<{ me: unknown }>('GET', `/race/${race.id}`, { user: 3 });
    assert.equal(cleo.body.me, null);
  });

  it('Abgabe: nur Mitglieder, nur nach Start, Form geprüft', async () => {
    const race = await make(1);
    const noRun = await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: [] } });
    assert.deepEqual([noRun.status, code(noRun.body)], [409, 'no_run']);
    assert.equal((await call('POST', `/race/${race.id}/start`, { user: 4 })).status, 403);
    assert.equal((await call('POST', `/race/${race.id}/finish`, { user: 4, body: { answers: [] } })).status, 403);
    assert.equal((await call('POST', `/race/${race.id}/start`)).status, 401);
    assert.equal((await call('POST', `/race/abcdefghjkmn/start`, { user: 1 })).status, 404);
    await call('POST', `/race/${race.id}/start`, { user: 2 });
    for (const answers of ['x', [{ i: 0, input: 'a', ms: 1 }], Array.from({ length: 151 }, (_, i) => ({ i: i % 150, input: 1, ms: i }))]) {
      assert.equal((await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers } })).status, 400);
    }
    assert.equal((await call('POST', `/race/${race.id}/finish`, { user: 2, body: {} })).status, 400);
    // leere Abgabe zählt als 0 richtig
    const empty = await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: [] } });
    assert.deepEqual(empty.body, { rank: 1, correct: 0, wrong: 0, status: 'finished' });
  });

  it('Zeitgrenzen: nach Ende kein Start; Abgabe eines vor Ende gestarteten Laufs bleibt möglich', async () => {
    const race = await make(1, { open: '1h' });
    assert.equal((await call('POST', `/race/${race.id}/start`, { user: 1 })).status, 201);
    now += RACE_OPEN_MS['1h'] + 1;
    const closed = await call('POST', `/race/${race.id}/start`, { user: 2 });
    assert.deepEqual([closed.status, code(closed.body)], [409, 'closed']);
    const fin = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: play(race, 2) } });
    assert.equal(fin.status, 200);
  });

  it('Kulanz: Antworten nach Dauer + 3 s verworfen, zu spät abgegeben = expired, später datiert als die Uhr = flagged', async () => {
    const race = await make(1);
    const dur = CFG.durationS * 1000;
    // 1) Antworten über die Kulanz hinaus fallen weg, in der Kulanz zählen sie nicht
    await call('POST', `/race/${race.id}/start`, { user: 1 });
    now += 40_000;
    const tasks = raceTasks(race.seed, race.config, 4);
    const late: RaceAnswerIn[] = [
      { i: 0, input: tasks[0]?.expected ?? 0, ms: 5000 }, { i: 1, input: tasks[1]?.expected ?? 0, ms: dur },
      { i: 2, input: tasks[2]?.expected ?? 0, ms: dur + 1000 }, { i: 3, input: tasks[3]?.expected ?? 0, ms: dur + RACE_GRACE_MS + 1 },
    ];
    const r1 = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: late } });
    assert.deepEqual(r1.body, { rank: 1, correct: 2, wrong: 0, status: 'finished' });
    // 2) Abgabe nach Dauer + Kulanz + Wartegrenze: abgelaufen, ohne Rang
    await call('POST', `/race/${race.id}/start`, { user: 2 });
    now += dur + RACE_GRACE_MS + RACE_FINISH_SLACK_MS + 1;
    const r2 = await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: play(race, 3) } });
    assert.deepEqual(r2.body, { rank: 0, correct: 0, wrong: 0, status: 'expired' });
    // 3) sofort abgegeben, aber Antworten bis 20 s datiert: mehr Zeit behauptet als vergangen
    await call('POST', `/race/${race.id}/start`, { user: 3 });
    now += 2000;
    const r3 = await call('POST', `/race/${race.id}/finish`, { user: 3, body: { answers: play(race, 3, 0, 1000, 20_000) } });
    assert.deepEqual(r3.body, { rank: 0, correct: 3, wrong: 0, status: 'flagged' });
    const view = await call<{ board: RaceBoardRow[]; me: { status: string } }>('GET', `/race/${race.id}`, { user: 3 });
    assert.deepEqual(view.body.board.map((b) => b.name), ['Anna']); // nur gewertete Läufe
    assert.equal(view.body.me.status, 'flagged');
  });

  it('Flagging: zu schnell (< 250 ms) oder nicht aufsteigend', async () => {
    const race = await make(1);
    await call('POST', `/race/${race.id}/start`, { user: 1 });
    await call('POST', `/race/${race.id}/start`, { user: 2 });
    now += 40_000;
    const fast = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: play(race, 4, 0, 200, 1000) } });
    assert.deepEqual([fast.body as object], [{ rank: 0, correct: 4, wrong: 0, status: 'flagged' }]);
    const back = play(race, 3).reverse();
    const r = await call<{ status: string }>('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: back } });
    assert.equal(r.body.status, 'flagged');
  });

  it('Live: `go` setzt Start und Ende einmal; Abgabe ohne Start-Aufruf, ms relativ zu starts_at', async () => {
    const race = await make(1, { kind: 'live' });
    const early = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: [] } });
    assert.deepEqual([early.status, code(early.body)], [409, 'not_started']);
    const early2 = await call('POST', `/race/${race.id}/start`, { user: 1 });
    assert.deepEqual([early2.status, code(early2.body)], [409, 'not_started']);
    assert.equal((await call('POST', `/race/${race.id}/go`, { user: 4 })).status, 403);
    assert.equal((await call('POST', `/race/${race.id}/go`)).status, 401);
    const go = await call<{ startsAt: string }>('POST', `/race/${race.id}/go`, { user: 2 });
    assert.equal(go.status, 200);
    assert.equal(Date.parse(go.body.startsAt), now + RACE_LIVE_LEAD_MS);
    const info = await call<{ race: RaceInfo }>('GET', `/race/${race.id}`, { user: 1 });
    assert.equal(info.body.race.startsAt, go.body.startsAt);
    assert.equal(Date.parse(info.body.race.endsAt), now + RACE_LIVE_LEAD_MS + CFG.durationS * 1000 + RACE_LIVE_TAIL_MS);
    now += 1000;
    const dup = await call<{ startsAt: string }>('POST', `/race/${race.id}/go`, { user: 1 });
    assert.deepEqual([dup.status, code(dup.body), dup.body.startsAt], [409, 'already', go.body.startsAt]);
    // Anna meldet sich per Start, Ben nur per Abgabe
    const st = await call<{ startedAt: string }>('POST', `/race/${race.id}/start`, { user: 1 });
    assert.equal(st.body.startedAt, go.body.startsAt);
    now += 6000 + CFG.durationS * 1000;
    const a = await call('POST', `/race/${race.id}/finish`, { user: 1, body: { answers: play(race, 6) } });
    const b = await call('POST', `/race/${race.id}/finish`, { user: 2, body: { answers: play(race, 8) } });
    assert.deepEqual([a.body, b.body], [
      { rank: 1, correct: 6, wrong: 0, status: 'finished' }, { rank: 1, correct: 8, wrong: 0, status: 'finished' },
    ]);
    const view = await call<{ board: RaceBoardRow[] }>('GET', `/race/${race.id}`, { user: 1 });
    assert.deepEqual(view.body.board.map((r) => [r.rank, r.name, r.correct]), [[1, 'Ben', 8], [2, 'Anna', 6]]);
    // `go` nur für Live
    const ghost = await make(1, { open: '1h' });
    const notLive = await call('POST', `/race/${ghost.id}/go`, { user: 1 });
    assert.deepEqual([notLive.status, code(notLive.body)], [400, 'invalid']);
  });

  it('Live: `go` nach Verfall der Lobby → closed', async () => {
    const race = await make(1, { kind: 'live' });
    now += RACE_LIVE_LOBBY_MS + 1;
    const r = await call('POST', `/race/${race.id}/go`, { user: 1 });
    assert.deepEqual([r.status, code(r.body)], [409, 'closed']);
  });

  it('ohne SQL 008: 503 unavailable auf allen Routen', async () => {
    const race = await make(1);
    store.unavailable = true;
    const routes: Array<['GET' | 'POST', string, unknown?]> = [
      ['POST', '/race/create', { groupId: G, kind: 'ghost', config: CFG }], ['GET', `/race/list?group=${G}`], ['GET', `/race/${race.id}`],
      ['POST', `/race/${race.id}/start`], ['POST', `/race/${race.id}/go`], ['POST', `/race/${race.id}/finish`, { answers: [] }],
    ];
    for (const [method, path, body] of routes) {
      const r = await call(method, path, { user: 1, ...(body === undefined ? {} : { body }) });
      assert.deepEqual([r.status, code(r.body)], [503, 'unavailable'], `${method} ${path}`);
    }
  });

  it('unbekannte Race-Pfade und Methoden → wie bisher not_found/method', async () => {
    const race = await make(1);
    // POST /race/:id/ticket gehört seit dem Merge mit R3 dem Live-Rennen (tests/v12-race-ticket.test.ts)
    assert.equal((await call('GET', `/race/${race.id}/ticket`, { user: 1 })).status, 404);
    assert.equal((await call('POST', `/race/${race.id}/nope`, { user: 1 })).status, 404);
    assert.equal((await call('GET', '/race/create', { user: 1 })).status, 404);
    assert.equal((await call('GET', '/race/', { user: 1 })).status, 404);
  });

  it('RaceStore.info: Mitglied, Fremde, unbekannt (Schnittstelle für R3)', async () => {
    const race = await make(1);
    assert.deepEqual(await store.info(race.id, U(2)), { race, member: true });
    const stranger = await store.info(race.id, U(4));
    assert.equal(stranger?.member, false);
    assert.equal(stranger?.race.id, race.id);
    assert.equal(stranger?.race.seed, 0); // kein Inhalt für Fremde
    assert.equal(await store.info('abcdefghjkmn', U(1)), null);
  });
});
