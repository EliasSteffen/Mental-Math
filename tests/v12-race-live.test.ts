// Live-Rennen (v12 R3), Client: WebSocket mit Fake (Uhrabgleich, Wiederverbinden, Ende), Gegner aus Live-Positionen, Auswertung
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChallengeError } from '../src/features/challenge.ts';
import { liveOpponents, liveSocketUrl, openLive, runsFromBoard, submittedCount, toMs, toSubmitted } from '../src/features/race-live.ts';
import type { LiveStatus, SocketLike } from '../src/features/race-live.ts';
import type { RaceBoardRow, ServerMsg } from '../src/core/race-room.ts';

class FakeSocket implements SocketLike {
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  constructor(url: string) { this.url = url; }
  send(d: string): void { this.sent.push(JSON.parse(d) as Record<string, unknown>); }
  close(): void { this.closed = true; }
  open(): void { this.onopen?.(); }
  push(m: ServerMsg): void { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop(): void { this.onclose?.({ code: 1006 }); }
}

/** Zeit und Zeitgeber unter Kontrolle */
function harness(opts: { tickets?: Array<string | Error> } = {}) {
  let t = 1_000_000;
  const jobs: Array<{ at: number; fn: () => void; live: boolean }> = [];
  const sockets: FakeSocket[] = [];
  const status: Array<[LiveStatus, string | undefined]> = [];
  const msgs: ServerMsg[] = [];
  const tickets = [...(opts.tickets ?? [])];
  let n = 0;
  const handle = openLive({
    raceId: 'race-abc',
    getTicket: () => {
      const next = tickets.shift() ?? `ticket-${++n}`;
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    onMessage: (m) => msgs.push(m),
    onStatus: (s, c) => status.push([s, c]),
    createSocket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    now: () => t,
    schedule: (fn, ms) => { const j = { at: t + ms, fn, live: true }; jobs.push(j); return () => { j.live = false; }; },
  });
  return {
    handle, sockets, status, msgs,
    advance(ms: number): void {
      const end = t + ms;
      for (;;) {
        const next = jobs.filter((j) => j.live && j.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        t = Math.max(t, next.at);
        next.live = false;
        next.fn();
      }
      t = end;
    },
    set(ms: number): void { t = ms; },
    now: () => t,
  };
}
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('openLive', () => {
  it('holt ein Ticket, verbindet auf wss://…/api/race/live/<id>?t=… und gleicht die Uhr ab', async () => {
    const h = harness();
    await flush();
    const s = h.sockets[0]!;
    const u = new URL(s.url);
    assert.equal(u.pathname, '/api/race/live/race-abc');
    assert.equal(u.searchParams.get('t'), 'ticket-1');
    assert.match(u.protocol, /^wss?:$/);
    assert.equal(h.handle.serverNow(), null);
    s.open();
    assert.deepEqual(h.status.map((x) => x[0]), ['connecting', 'open']);
    // Der erste Ping geht sofort hinaus; der Raum geht 2 s vor, der Austausch dauert 40 ms
    const ping = s.sent[0]!;
    assert.equal(ping.t, 'ping');
    const sentAt = h.now();
    h.advance(40);
    s.push({ t: 'pong', c: ping.c as number, s: sentAt + 20 + 2000 });
    assert.equal(h.handle.offset(), 2000);
    assert.equal(h.handle.serverNow(), h.now() + 2000);
    // Weitere Pings folgen (erst schnell, dann alle 4 s)
    h.advance(300);
    assert.ok(s.sent.filter((m) => m.t === 'ping').length >= 2);
    // Ein langsamer Austausch verdrängt den genauen nicht
    const p2 = s.sent.filter((m) => m.t === 'ping').at(-1)!;
    h.advance(300);
    s.push({ t: 'pong', c: p2.c as number, s: h.now() - 100 + 1500 });
    assert.equal(h.handle.offset(), 2000);
    // Fremde pong-Werte werden ignoriert
    s.push({ t: 'pong', c: 12345, s: 1 });
    assert.equal(h.handle.offset(), 2000);
    h.handle.stop();
  });

  it('reicht Nachrichten des Raums weiter und sendet Client-Nachrichten', async () => {
    const h = harness();
    await flush();
    const s = h.sockets[0]!;
    assert.equal(h.handle.send({ t: 'leave' }), false, 'vor dem Öffnen nichts senden');
    s.open();
    assert.equal(h.handle.send({ t: 'pos', i: 0, ok: true, ms: 400 }), true);
    assert.deepEqual(s.sent.at(-1), { t: 'pos', i: 0, ok: true, ms: 400 });
    s.push({ t: 'positions', at: 1, p: [['a', 1, 1]] });
    s.onmessage?.({ data: 'kaputt' });
    s.onmessage?.({ data: JSON.stringify({ t: 'unbekannt' }) });
    assert.deepEqual(h.msgs.filter((m) => m.t === 'positions').length, 1);
    h.handle.stop();
  });

  it('Verbindungsabbruch: „lost“, neues Ticket, wieder verbinden – bis zum Ende', async () => {
    const h = harness();
    await flush();
    const s1 = h.sockets[0]!;
    s1.open();
    s1.drop();
    assert.equal(h.status.at(-1)?.[0], 'lost');
    assert.equal(h.handle.send({ t: 'leave' }), false);
    h.advance(600);
    await flush();
    const s2 = h.sockets[1]!;
    assert.equal(new URL(s2.url).searchParams.get('t'), 'ticket-2', 'neues Ticket je Verbindung');
    // Kommt die Verbindung nicht zustande, wird die Wartezeit länger (0,5 s → 1 s)
    s2.drop();
    h.advance(600);
    await flush();
    assert.equal(h.sockets.length, 2, 'noch nicht wieder dran');
    h.advance(600);
    await flush();
    assert.equal(h.sockets.length, 3);
    // Ende: keine weiteren Versuche
    const s3 = h.sockets[2]!;
    s3.open();
    s3.push({ t: 'end', reason: 'done', p: [] });
    assert.equal(h.status.at(-1)?.[0], 'closed');
    assert.equal(h.msgs.at(-1)?.t, 'end');
    assert.equal(s3.closed, true);
    s3.drop();
    h.advance(60_000);
    await flush();
    assert.equal(h.sockets.length, 3);
  });

  it('Ticket-Fehler: Netz → weiter versuchen; Rennen weg/vorbei → endgültig', async () => {
    const h = harness({ tickets: [new ChallengeError('network')] });
    await flush();
    assert.equal(h.status.at(-1)?.[0], 'lost');
    h.advance(600);
    await flush();
    assert.equal(h.sockets.length, 1);
    const g = harness({ tickets: [new ChallengeError('closed')] });
    await flush();
    assert.deepEqual(g.status.at(-1), ['fatal', 'closed']);
    g.advance(60_000);
    await flush();
    assert.equal(g.sockets.length, 0);
  });

  it('Raum lehnt ab („started“, „full“): endgültig, kein Wiederverbinden', async () => {
    const h = harness();
    await flush();
    const s = h.sockets[0]!;
    s.open();
    s.push({ t: 'error', code: 'started' });
    assert.equal(h.status.at(-1)?.[0], 'fatal');
    s.drop();
    h.advance(60_000);
    await flush();
    assert.equal(h.sockets.length, 1);
  });

  it('stop() beendet alles und sendet nichts mehr', async () => {
    const h = harness();
    await flush();
    const s = h.sockets[0]!;
    s.open();
    h.handle.stop();
    assert.equal(s.closed, true);
    assert.equal(h.handle.send({ t: 'leave' }), false);
    h.advance(60_000);
    await flush();
    assert.equal(h.sockets.length, 1);
  });
});

describe('Live-Gegner und Auswertung', () => {
  it('liveOpponents: Höhen aus Positionen, nur die Mitspielenden, sinken nie', () => {
    const o = liveOpponents([{ id: 'b', name: 'Ben' }, { id: 'c', name: 'Cy' }]);
    assert.deepEqual(o.names(), ['Ben', 'Cy']);
    assert.deepEqual(o.altitudes(0), [0, 0]);
    o.update([['a', 5, 5], ['b', 2, 3], ['c', 1, 1]]);
    assert.deepEqual(o.altitudes(12345), [2, 1]);
    o.update([['b', 1, 4], ['c', 3, 4]]);
    assert.deepEqual(o.altitudes(0), [2, 3]);
    assert.equal(o.altitudeOf('a'), 5);
    assert.equal(o.altitudeOf('zzz'), 0);
  });

  it('runsFromBoard: nur wer abgegeben hat; Zeitleiste [ms, ok] → { ms, ok }', () => {
    const rows: RaceBoardRow[] = [
      { rank: 1, name: 'Anna', me: true, correct: 2, wrong: 1, lastOkMs: 900, status: 'finished', steps: [[300, 1], [600, 0], [900, 1]] },
      { rank: 2, name: 'Ben', me: false, correct: 1, wrong: 0, lastOkMs: 500, status: 'flagged', steps: [[500, 1]] },
      { rank: 0, name: 'Cy', me: false, correct: 0, wrong: 0, lastOkMs: 0, status: 'running', steps: [] },
      { rank: 0, name: 'Di', me: false, correct: 0, wrong: 0, lastOkMs: 0, status: 'none', steps: [] },
    ];
    const runs = runsFromBoard(rows);
    assert.equal(runs.length, 2);
    assert.deepEqual(runs[0], { name: 'Anna', me: true, steps: [{ ms: 300, ok: true }, { ms: 600, ok: false }, { ms: 900, ok: true }] });
    assert.deepEqual(runs[1], { name: 'Ben', steps: [{ ms: 500, ok: true }] });
    assert.equal(submittedCount(rows), 2);
  });

  it('toSubmitted und toMs', () => {
    assert.deepEqual(toSubmitted([{ i: 0, given: 42, ms: 700 }, { i: 1, given: null, ms: 1500 }]), [
      { i: 0, input: 42, ms: 700 }, { i: 1, input: null, ms: 1500 },
    ]);
    assert.equal(toMs(1234), 1234);
    assert.equal(toMs('2026-11-11T12:00:05.000Z'), Date.parse('2026-11-11T12:00:05Z'));
    assert.equal(toMs('x'), null);
    assert.equal(toMs(undefined), null);
  });

  it('liveSocketUrl: http → ws, https → wss, Ticket als Query', () => {
    assert.equal(liveSocketUrl('r-1', 'abc.def', 'https://mental-math.example/app/'), 'wss://mental-math.example/api/race/live/r-1?t=abc.def');
    assert.equal(liveSocketUrl('r-1', 'x', 'http://localhost:8788/'), 'ws://localhost:8788/api/race/live/r-1?t=x');
  });
});
