// Live-Rennen (v12 R3): Zustandsautomat des Raums, Nachrichten, Uhrabgleich und das Durable Object mit Fake-Sockets
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_FLUSH_MS, ROOM_LOBBY_TTL_MS, ROOM_MAX_PLAYERS, ROOM_START_FUTURE_MS, clockOffset, createRoom, durationMsOf, lobbyFor, nextWake,
  parseClientMsg, parseServerMsg, perfAt, roomJoin, roomLeave, roomMessage, roomTick,
} from '../src/core/race-room.ts';
import type { Out, RoomState, ServerMsg } from '../src/core/race-room.ts';
import { RACE_GRACE_MS } from '../src/core/race.ts';
import { RaceRoom } from '../workers/race-room/src/index.ts';
import type { DoCtx, DoStorage, WsLike } from '../workers/race-room/src/index.ts';

const T0 = 1_800_000_000_000;
const DUR = 30_000;

const msgs = (out: Out[], t: ServerMsg['t']): Out[] => out.filter((o) => o.msg.t === t);

/** Raum mit Host `a` und `b` in der Lobby */
function lobby(): RoomState {
  const s = createRoom('race-1', DUR, T0);
  roomJoin(s, { id: 'a', name: 'Anna' }, T0);
  roomJoin(s, { id: 'b', name: 'Ben' }, T0 + 1);
  return s;
}

/** Gestartet: Countdown bis T0 + 5 s */
function started(): RoomState {
  const s = lobby();
  roomMessage(s, 'a', { t: 'start', startsAt: T0 + 5000 }, T0 + 100);
  return s;
}

describe('Lobby', () => {
  it('der erste Beitretende wird Host; Name wird bereinigt, Schnappschuss je Person mit „you“', () => {
    const s = createRoom('r', DUR, T0);
    const r = roomJoin(s, { id: 'a', name: '  Anna​  ' }, T0);
    assert.equal(r.accept, true);
    assert.equal(s.hostId, 'a');
    assert.equal(s.players[0]?.name, 'Anna');
    const snap = lobbyFor(s, 'a', T0);
    assert.equal(snap.t === 'lobby' && snap.you, 'a');
    assert.equal(snap.t === 'lobby' && snap.players[0]?.host, true);
    roomJoin(s, { id: 'b', name: 'Ben' }, T0 + 1);
    assert.equal(s.hostId, 'a');
    const out = roomJoin(s, { id: 'c', name: 'Cy' }, T0 + 2).out;
    assert.deepEqual(out.map((o) => o.to).sort(), ['a', 'b', 'c']);
  });

  it('wieder verbinden ist kein neuer Spieler', () => {
    const s = lobby();
    roomJoin(s, { id: 'b', name: 'Ben' }, T0 + 5);
    assert.equal(s.players.length, 2);
  });

  it('voll: mehr als 8 Spieler werden abgewiesen', () => {
    const s = createRoom('r', DUR, T0);
    for (let i = 0; i < ROOM_MAX_PLAYERS; i++) assert.equal(roomJoin(s, { id: `p${i}`, name: `P${i}` }, T0).accept, true);
    const r = roomJoin(s, { id: 'extra', name: 'X' }, T0);
    assert.equal(r.accept, false);
    assert.deepEqual(r.out.find((o) => o.to === 'extra')?.msg, { t: 'error', code: 'full' });
  });

  it('Host-Nachfolge: Verlässt der Host die Lobby, wird der Nächste Host', () => {
    const s = lobby();
    roomJoin(s, { id: 'c', name: 'Cy' }, T0 + 2);
    const out = roomLeave(s, 'a', T0 + 10);
    assert.equal(s.hostId, 'b');
    assert.equal(s.players.length, 2);
    const snap = msgs(out, 'lobby')[0]?.msg;
    assert.equal(snap?.t === 'lobby' && snap.hostId, 'b');
    roomLeave(s, 'b', T0 + 11);
    roomLeave(s, 'c', T0 + 12);
    assert.equal(s.hostId, null);
    // Neuer Beitritt in die leere Lobby → neuer Host
    roomJoin(s, { id: 'd', name: 'Di' }, T0 + 13);
    assert.equal(s.hostId, 'd');
  });

  it('Lobby ohne Start verfällt nach 15 Minuten', () => {
    const s = lobby();
    assert.deepEqual(roomTick(s, T0 + ROOM_LOBBY_TTL_MS - 1), []);
    assert.equal(s.phase, 'lobby');
    const out = roomTick(s, T0 + ROOM_LOBBY_TTL_MS);
    assert.equal(s.phase, 'ended');
    assert.equal(s.endReason, 'expired');
    assert.equal(msgs(out, 'end').length, 1);
    // Beitritt danach: abgewiesen mit „end“
    const late = roomJoin(s, { id: 'z', name: 'Z' }, T0 + ROOM_LOBBY_TTL_MS + 1);
    assert.equal(late.accept, false);
    assert.equal(late.out.at(-1)?.msg.t, 'end');
  });
});

describe('Start', () => {
  it('nur der Host startet', () => {
    const s = lobby();
    const out = roomMessage(s, 'b', { t: 'start', startsAt: T0 + 5000 }, T0 + 100);
    assert.deepEqual(out, [{ to: 'b', msg: { t: 'error', code: 'not_host' } }]);
    assert.equal(s.phase, 'lobby');
  });

  it('mindestens zwei Spieler', () => {
    const s = createRoom('r', DUR, T0);
    roomJoin(s, { id: 'a', name: 'Anna' }, T0);
    const out = roomMessage(s, 'a', { t: 'start', startsAt: T0 + 5000 }, T0 + 100);
    assert.deepEqual(out, [{ to: 'a', msg: { t: 'error', code: 'too_few' } }]);
    // Ein getrennter Spieler zählt nicht mit
    roomJoin(s, { id: 'b', name: 'Ben' }, T0 + 1);
    s.players[1]!.connected = false;
    assert.equal((roomMessage(s, 'a', { t: 'start', startsAt: T0 + 5000 }, T0 + 100)[0]?.msg as { code?: string }).code, 'too_few');
  });

  it('Startzeit muss plausibel sein (nicht weit in der Vergangenheit/Zukunft, Zahl)', () => {
    for (const startsAt of [T0 - 60_000, T0 + ROOM_START_FUTURE_MS + 5000]) {
      const s = lobby();
      assert.equal((roomMessage(s, 'a', { t: 'start', startsAt }, T0 + 100)[0]?.msg as { code?: string }).code, 'bad_start');
      assert.equal(s.phase, 'lobby');
    }
    const s = lobby();
    assert.deepEqual(roomMessage(s, 'a', { t: 'start', startsAt: 'bald' }, T0 + 100), []);
  });

  it('Start verteilt „start“ und Schnappschüsse; zweiter Start wird abgelehnt', () => {
    const s = lobby();
    const out = roomMessage(s, 'a', { t: 'start', startsAt: T0 + 5000 }, T0 + 100);
    assert.equal(s.phase, 'countdown');
    assert.equal(s.startsAt, T0 + 5000);
    assert.equal(s.endsAt, T0 + 5000 + DUR + RACE_GRACE_MS);
    assert.deepEqual(msgs(out, 'start')[0], { to: '*', msg: { t: 'start', startsAt: T0 + 5000 } });
    assert.equal(msgs(out, 'lobby').length, 2);
    assert.equal((roomMessage(s, 'a', { t: 'start', startsAt: T0 + 6000 }, T0 + 200)[0]?.msg as { code?: string }).code, 'bad_start');
    assert.equal(s.startsAt, T0 + 5000);
  });

  it('nach dem Start kommen keine Neuen mehr rein, bekannte verbinden sich wieder', () => {
    const s = started();
    const r = roomJoin(s, { id: 'c', name: 'Cy' }, T0 + 200);
    assert.equal(r.accept, false);
    assert.deepEqual(r.out.find((o) => o.to === 'c')?.msg, { t: 'error', code: 'started' });
    roomLeave(s, 'b', T0 + 300);
    assert.equal(s.players.find((p) => p.id === 'b')?.connected, false);
    assert.equal(s.hostId, 'a');
    assert.equal(roomJoin(s, { id: 'b', name: 'Ben' }, T0 + 400).accept, true);
    assert.equal(s.players.find((p) => p.id === 'b')?.connected, true);
  });
});

describe('Rennen', () => {
  it('Countdown → Läuft zur Startzeit, Ende nach Dauer + Kulanz', () => {
    const s = started();
    roomTick(s, T0 + 4999);
    assert.equal(s.phase, 'countdown');
    roomTick(s, T0 + 5000);
    assert.equal(s.phase, 'running');
    assert.deepEqual(roomTick(s, T0 + 5000 + DUR + RACE_GRACE_MS - 1).filter((o) => o.msg.t === 'end'), []);
    const out = roomTick(s, T0 + 5000 + DUR + RACE_GRACE_MS);
    assert.equal(s.phase, 'ended');
    assert.equal(s.endReason, 'done');
    assert.equal(msgs(out, 'end').length, 1);
  });

  it('Positionen: nur im Rennen, monoton, gebündelt höchstens 5 × pro Sekunde', () => {
    const s = started();
    // Vor dem Start (Countdown): ignoriert
    roomMessage(s, 'a', { t: 'pos', i: 0, ok: true, ms: 100 }, T0 + 1000);
    assert.equal(s.players[0]?.n, 0);
    const t = T0 + 5000;
    // erste Antwort → sofort ein Bündel (erstes Mal)
    let out = roomMessage(s, 'a', { t: 'pos', i: 0, ok: true, ms: 800 }, t + 800);
    assert.equal(msgs(out, 'positions').length, 1);
    assert.deepEqual((msgs(out, 'positions')[0]?.msg as { p: unknown }).p, [['a', 1, 1], ['b', 0, 0]]);
    // weitere Antworten innerhalb von 200 ms: noch kein Bündel, aber der Alarm ist fällig
    out = roomMessage(s, 'b', { t: 'pos', i: 0, ok: true, ms: 850 }, t + 850);
    out.push(...roomMessage(s, 'a', { t: 'pos', i: 1, ok: false, ms: 900 }, t + 900));
    assert.equal(msgs(out, 'positions').length, 0);
    assert.equal(nextWake(s, t + 900), t + 800 + ROOM_FLUSH_MS);
    out = roomTick(s, t + 800 + ROOM_FLUSH_MS);
    assert.equal(msgs(out, 'positions').length, 1);
    assert.deepEqual((msgs(out, 'positions')[0]?.msg as { p: unknown }).p, [['a', 1, 2], ['b', 1, 1]]);
    // Monoton: alter Index, Zeit zurück → ignoriert
    roomMessage(s, 'a', { t: 'pos', i: 1, ok: true, ms: 1000 }, t + 1000);
    roomMessage(s, 'a', { t: 'pos', i: 0, ok: true, ms: 1000 }, t + 1000);
    roomMessage(s, 'a', { t: 'pos', i: 5, ok: true, ms: 100 }, t + 1000);
    assert.equal(s.players[0]?.n, 1);
    assert.equal(s.players[0]?.a, 2);
    // Zu viele / unmögliche Werte
    roomMessage(s, 'a', { t: 'pos', i: 500, ok: true, ms: 2000 }, t + 2000);
    roomMessage(s, 'a', { t: 'pos', i: 3, ok: true, ms: DUR + 99_999 }, t + 2000);
    assert.equal(s.players[0]?.n, 1);
    // Bündel nie öfter als alle 200 ms
    let count = 0;
    for (let k = 0; k < 40; k++) {
      const now = t + 3000 + k * 50;
      count += msgs(roomMessage(s, 'a', { t: 'pos', i: 2 + k, ok: true, ms: 3000 + k * 50 }, now), 'positions').length;
    }
    assert.ok(count <= 11, `Bündel: ${count}`); // 2 s ⇒ höchstens 10–11
    assert.equal(s.players[0]?.n, 41);
  });

  it('Ende enthält den letzten Stand; danach wird alles ignoriert', () => {
    const s = started();
    roomTick(s, T0 + 5000);
    roomMessage(s, 'a', { t: 'pos', i: 0, ok: true, ms: 500 }, T0 + 5500);
    const out = roomTick(s, T0 + 5000 + DUR + RACE_GRACE_MS);
    assert.deepEqual((msgs(out, 'end')[0]?.msg as { p: unknown }).p, [['a', 1, 1], ['b', 0, 0]]);
    const after = T0 + 5000 + DUR + RACE_GRACE_MS + 10;
    for (const m of [{ t: 'pos', i: 1, ok: true, ms: 900 }, { t: 'start', startsAt: after + 1000 }, { t: 'ping', c: 1 }, { t: 'leave' }]) {
      assert.deepEqual(roomMessage(s, 'a', m, after), []);
    }
    assert.equal(s.players[0]?.n, 1);
    assert.equal(s.players[0]?.connected, true);
    assert.deepEqual(roomLeave(s, 'a', after), []);
  });

  it('ping → pong mit Raumzeit; Unbekanntes und Fremde werden ignoriert', () => {
    const s = lobby();
    assert.deepEqual(roomMessage(s, 'a', { t: 'ping', c: 77 }, T0 + 50), [{ to: 'a', msg: { t: 'pong', c: 77, s: T0 + 50 } }]);
    assert.deepEqual(roomMessage(s, 'a', { t: 'boom' }, T0 + 50), []);
    assert.deepEqual(roomMessage(s, 'a', 'kein json', T0 + 50), []);
    assert.deepEqual(roomMessage(s, 'ghost', { t: 'ping', c: 1 }, T0 + 50), []);
  });

  it('Verbindung weg im Rennen: bleibt mit letztem Stand, „connected: false“', () => {
    const s = started();
    roomTick(s, T0 + 5000);
    roomMessage(s, 'b', { t: 'pos', i: 0, ok: true, ms: 500 }, T0 + 5500);
    const out = roomLeave(s, 'b', T0 + 6000);
    assert.equal(s.players[1]?.n, 1);
    const snap = out.find((o) => o.to === 'a')?.msg;
    assert.equal(snap?.t === 'lobby' && snap.players.find((p) => p.id === 'b')?.connected, false);
    // Explizites „leave“ im Rennen ebenso
    roomMessage(s, 'a', { t: 'leave' }, T0 + 6100);
    assert.equal(s.players[0]?.connected, false);
  });
});

describe('Nachrichten und Uhr', () => {
  it('parseClientMsg prüft streng', () => {
    assert.deepEqual(parseClientMsg('{"t":"ping","c":5}'), { t: 'ping', c: 5 });
    assert.deepEqual(parseClientMsg({ t: 'pos', i: 2, ok: false, ms: 1234 }), { t: 'pos', i: 2, ok: false, ms: 1234 });
    assert.equal(parseClientMsg({ t: 'pos', i: 1.5, ok: true, ms: 1 }), null);
    assert.equal(parseClientMsg({ t: 'pos', i: 1, ok: 1, ms: 1 }), null);
    assert.equal(parseClientMsg({ t: 'start', startsAt: Number.NaN }), null);
    assert.equal(parseClientMsg('x'.repeat(600)), null);
    assert.equal(parseClientMsg([]), null);
    assert.equal(parseClientMsg(null), null);
  });

  it('parseServerMsg: Round-Trip des Schnappschusses, Müll → null', () => {
    const s = lobby();
    const snap = lobbyFor(s, 'a', T0);
    assert.deepEqual(parseServerMsg(JSON.stringify(snap)), snap);
    assert.deepEqual(parseServerMsg({ t: 'positions', at: 1, p: [['a', 1, 2]] }), { t: 'positions', at: 1, p: [['a', 1, 2]] });
    assert.equal(parseServerMsg({ t: 'positions', at: 1, p: [['a', 1]] }), null);
    assert.equal(parseServerMsg({ t: 'end', reason: 'x', p: [] }), null);
    assert.equal(parseServerMsg('{'), null);
  });

  it('durationMsOf: nur 30/60/90/120 s', () => {
    assert.equal(durationMsOf(60), 60_000);
    assert.equal(durationMsOf(45), null);
    assert.equal(durationMsOf('60'), null);
  });

  it('Uhrversatz aus dem Austausch mit der kürzesten Laufzeit', () => {
    assert.equal(clockOffset([]), null);
    // Server 1000 ms voraus; langsamer Austausch (200 ms) und schneller (20 ms): der schnelle gewinnt
    const samples = [
      { sent: 10_000, recv: 10_200, server: 11_100 },
      { sent: 20_000, recv: 20_020, server: 21_010 },
    ];
    assert.equal(clockOffset(samples), 1000);
    assert.equal(clockOffset([{ sent: 5, recv: 1, server: 9 }]), null);
  });

  it('perfAt: Raumzeit → performance.now()', () => {
    // Raum 1000 ms voraus; Start in Raumzeit 11_000 bei wall 5000 ⇒ in 5000 ms
    assert.equal(perfAt(11_000, 1000, 5000, 300), 5300);
    // Start schon vorbei ⇒ kleiner als jetzt
    assert.ok(perfAt(5000, 0, 6000, 300) < 300);
  });
});

/* ---------- Durable Object mit Fake-Speicher und Fake-Sockets ---------- */

class FakeWs implements WsLike {
  sent: ServerMsg[] = [];
  closed: number | null = null;
  attachment: unknown = null;
  readyState = 1;
  send(data: string): void { this.sent.push(JSON.parse(data) as ServerMsg); }
  close(code = 1000): void { this.closed = code; this.readyState = 3; }
  serializeAttachment(v: unknown): void { this.attachment = v; }
  deserializeAttachment(): unknown { return this.attachment; }
  last(t: ServerMsg['t']): ServerMsg | undefined { return [...this.sent].reverse().find((m) => m.t === t); }
}

function fakeCtx(): { ctx: DoCtx; sockets: Array<{ ws: FakeWs; tags: string[] }>; store: Map<string, unknown>; alarm: { at: number | null } } {
  const store = new Map<string, unknown>();
  const alarm = { at: null as number | null };
  const sockets: Array<{ ws: FakeWs; tags: string[] }> = [];
  const storage: DoStorage = {
    get: <T,>(k: string): Promise<T | undefined> => Promise.resolve(store.get(k) as T | undefined),
    put: (k, v) => { store.set(k, structuredClone(v)); return Promise.resolve(); },
    deleteAll: () => { store.clear(); return Promise.resolve(); },
    getAlarm: () => Promise.resolve(alarm.at),
    setAlarm: (t) => { alarm.at = t; return Promise.resolve(); },
    deleteAlarm: () => { alarm.at = null; return Promise.resolve(); },
  };
  const ctx: DoCtx = {
    storage,
    acceptWebSocket: (ws, tags = []) => { sockets.push({ ws: ws as FakeWs, tags }); },
    getWebSockets: (tag) => sockets.filter((s) => !tag || s.tags.includes(tag)).map((s) => s.ws),
  };
  return { ctx, sockets, store, alarm };
}

describe('Durable Object RaceRoom', () => {
  const who = (id: string, name: string) => ({ id, name, raceId: 'race-1', durationMs: DUR });

  it('Lobby, Start, Positionen, Ende – mit Persistenz über „Hibernation“ (neue Instanz, gleicher Speicher)', async () => {
    const f = fakeCtx();
    let now = T0;
    const room = new RaceRoom(f.ctx, undefined, () => now);
    const a = new FakeWs();
    const b = new FakeWs();
    await room.connect(who('a', 'Anna'), a);
    await room.connect(who('b', 'Ben'), b);
    const snap = b.last('lobby');
    assert.equal(snap?.t === 'lobby' && snap.you, 'b');
    assert.equal(snap?.t === 'lobby' && snap.players.length, 2);
    assert.equal(f.alarm.at, T0 + ROOM_LOBBY_TTL_MS);

    await room.webSocketMessage(b, JSON.stringify({ t: 'start', startsAt: T0 + 5000 }));
    assert.deepEqual(b.last('error'), { t: 'error', code: 'not_host' });
    await room.webSocketMessage(a, JSON.stringify({ t: 'start', startsAt: T0 + 5000 }));
    assert.deepEqual(a.last('start'), { t: 'start', startsAt: T0 + 5000 });
    assert.deepEqual(b.last('start'), { t: 'start', startsAt: T0 + 5000 });
    assert.equal(f.alarm.at, T0 + 5000);

    // „Hibernation“: neue Instanz ohne Speicher im Arbeitsspeicher, gleicher Storage und Sockets
    const room2 = new RaceRoom(f.ctx, undefined, () => now);
    now = T0 + 5000;
    await room2.alarm(); // Countdown → Läuft
    now = T0 + 5800;
    await room2.webSocketMessage(a, JSON.stringify({ t: 'pos', i: 0, ok: true, ms: 800 }));
    assert.deepEqual((a.last('positions') as { p: unknown }).p, [['a', 1, 1], ['b', 0, 0]]);
    assert.deepEqual((b.last('positions') as { p: unknown }).p, [['a', 1, 1], ['b', 0, 0]]);

    now = T0 + 5000 + DUR + RACE_GRACE_MS;
    await room2.alarm();
    assert.equal(a.last('end')?.t, 'end');
    assert.equal(a.closed, 1000);
    assert.equal(b.closed, 1000);
    assert.equal(f.alarm.at, now + 60 * 60_000);
    // Aufräumen nach einer Stunde
    now += 60 * 60_000;
    await room2.alarm();
    assert.equal(f.store.size, 0);
  });

  it('zweite Verbindung derselben Person ersetzt die erste, ohne dass sie „geht“', async () => {
    const f = fakeCtx();
    const room = new RaceRoom(f.ctx, undefined, () => T0);
    const a1 = new FakeWs();
    await room.connect(who('a', 'Anna'), a1);
    await room.connect(who('b', 'Ben'), new FakeWs());
    const a2 = new FakeWs();
    await room.connect(who('a', 'Anna'), a2);
    assert.equal(a1.closed, 4000);
    await room.webSocketClose(a1);
    const snap = a2.last('lobby');
    assert.equal(snap?.t === 'lobby' && snap.players.length, 2);
    assert.equal(snap?.t === 'lobby' && snap.hostId, 'a');
    // Echte Trennung der aktuellen Verbindung: Host wechselt
    await room.webSocketClose(a2);
    const b = f.sockets.find((s) => s.tags.includes('b'))!.ws;
    const last = b.last('lobby');
    assert.equal(last?.t === 'lobby' && last.hostId, 'b');
  });

  it('abgewiesene Verbindung bekommt Grund und wird geschlossen', async () => {
    const f = fakeCtx();
    let now = T0;
    const room = new RaceRoom(f.ctx, undefined, () => now);
    const a = new FakeWs();
    await room.connect(who('a', 'Anna'), a);
    await room.connect(who('b', 'Ben'), new FakeWs());
    await room.webSocketMessage(a, JSON.stringify({ t: 'start', startsAt: T0 + 2000 }));
    now = T0 + 100;
    const late = new FakeWs();
    await room.connect(who('c', 'Cy'), late);
    assert.deepEqual(late.last('error'), { t: 'error', code: 'started' });
    assert.equal(late.closed, 1008);
  });

  it('fetch verlangt WebSocket-Upgrade und Identität', async () => {
    const room = new RaceRoom(fakeCtx().ctx, undefined, () => T0);
    assert.equal((await room.fetch(new Request('https://x/connect'))).status, 426);
    const bad = new Request('https://x/connect', { headers: { Upgrade: 'websocket' } });
    assert.equal((await room.fetch(bad)).status, 400);
  });
});
