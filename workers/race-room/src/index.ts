// Worker „mental-math-race-room“: stellt das Durable Object RaceRoom für Live-Rennen bereit (eine Instanz je Rennen,
// `idFromName(raceId)` in der Pages Function functions/api/race/live). Es ist nur Treffpunkt und Taktgeber – Lobby,
// Startzeit, Positionen; die Regeln stehen im Zustandsautomaten src/core/race-room.ts (dort getestet). Gewertet wird über
// POST /api/challenge/race/:id/finish.
// WebSocket-Hibernation-API: Das Objekt schläft, solange nichts los ist; Zustand liegt im Storage, Zeitpunkte im Alarm.
// Der Worker hat keine öffentliche Route (workers_dev = false); erreichbar ist nur das Durable Object über das Binding.
// Die Identität (Nutzer, Name, Dauer) steht in Headern, die nur die Pages Function nach der Ticket-Prüfung setzen kann.
import {
  createRoom, durationMsOf, nextWake, roomJoin, roomLeave, roomMessage, roomTick, ROOM_KEEP_MS,
} from '../../../src/core/race-room.ts';
import type { Out, RoomState } from '../../../src/core/race-room.ts';
import { RACE_HEADERS } from '../../../server/race-live.ts';

// Nur die genutzten Teile der Cloudflare-APIs (Typen-Paket gibt es im Repo nicht, wie bei workers/rate-limiter)
export interface DoStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}
export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
  /** 1 = offen (Cloudflare setzt es; fehlt es, gilt der Socket als offen) */
  readyState?: number;
}
export interface DoCtx {
  storage: DoStorage;
  acceptWebSocket(ws: WsLike, tags?: string[]): void;
  getWebSockets(tag?: string): WsLike[];
}

interface Attachment { id: string }
const STORE_KEY = 'room';
const isOpen = (ws: WsLike): boolean => ws.readyState === undefined || ws.readyState === 1;
const text = (status: number, body: string): Response => new Response(body, { status });

export class RaceRoom {
  private readonly ctx: DoCtx;
  private readonly now: () => number;
  private room: RoomState | null | undefined;
  private alarmAt: number | null = null;

  constructor(ctx: DoCtx, _env?: unknown, now: () => number = Date.now) {
    this.ctx = ctx;
    this.now = now;
  }

  private async load(): Promise<RoomState | null> {
    if (this.room === undefined) this.room = (await this.ctx.storage.get<RoomState>(STORE_KEY)) ?? null;
    return this.room;
  }

  private async save(room: RoomState): Promise<void> {
    this.room = room;
    await this.ctx.storage.put(STORE_KEY, room);
  }

  private socketsOf(to: string): WsLike[] {
    return (to === '*' ? this.ctx.getWebSockets() : this.ctx.getWebSockets(to)).filter(isOpen);
  }

  /** Nachrichten zustellen; nach `end` werden die Verbindungen geschlossen (Rennen vorbei). */
  private deliver(outs: readonly Out[]): void {
    for (const o of outs) {
      const data = JSON.stringify(o.msg);
      const targets = this.socketsOf(o.to);
      for (const ws of targets) {
        try { ws.send(data); } catch { /* Verbindung gerade weg: der Close-Handler räumt auf */ }
      }
      if (o.msg.t === 'end') for (const ws of targets) { try { ws.close(1000, 'ended'); } catch { /* schon zu */ } }
    }
  }

  private async reschedule(room: RoomState): Promise<void> {
    const at = nextWake(room, this.now());
    if (at === this.alarmAt) return;
    this.alarmAt = at;
    if (at === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
  }

  /** Persistieren, wenn etwas Wesentliches hinausging (Beitritt, Start, Positionen, Ende) – reine pong/Fehler nicht. */
  private async finish(room: RoomState, outs: readonly Out[]): Promise<void> {
    if (outs.some((o) => o.msg.t !== 'pong' && o.msg.t !== 'error')) await this.save(room);
    this.deliver(outs);
    await this.reschedule(room);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return text(426, 'Expected WebSocket');
    const id = request.headers.get(RACE_HEADERS.user) ?? '';
    const raceId = request.headers.get(RACE_HEADERS.race) ?? '';
    const durationMs = durationMsOf(Number(request.headers.get(RACE_HEADERS.duration)));
    let name = '';
    try { name = decodeURIComponent(request.headers.get(RACE_HEADERS.name) ?? ''); } catch { /* bleibt leer */ }
    if (!id || !raceId || durationMs === null) return text(400, 'Bad request');
    const Pair = (globalThis as unknown as { WebSocketPair?: new () => { 0: WsLike; 1: WsLike } }).WebSocketPair;
    if (!Pair) return text(500, 'WebSocketPair unavailable');
    const pair = new Pair();
    const client = pair[0];
    const server = pair[1];
    await this.connect({ id, name, raceId, durationMs }, server);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  /** Verbindung annehmen (Tests rufen das mit einem Fake-Socket auf). Eine zweite Verbindung derselben Person ersetzt die erste. */
  async connect(who: { id: string; name: string; raceId: string; durationMs: number }, ws: WsLike): Promise<void> {
    const now = this.now();
    const room = (await this.load()) ?? createRoom(who.raceId, who.durationMs, now);
    for (const old of this.ctx.getWebSockets(who.id)) { try { old.close(4000, 'replaced'); } catch { /* schon zu */ } }
    this.ctx.acceptWebSocket(ws, [who.id]);
    ws.serializeAttachment({ id: who.id } satisfies Attachment);
    const r = roomJoin(room, { id: who.id, name: who.name }, now);
    await this.save(room);
    this.deliver(r.out);
    if (!r.accept) { try { ws.close(1008, 'rejected'); } catch { /* schon zu */ } }
    await this.reschedule(room);
  }

  private idOf(ws: WsLike): string | null {
    const a = ws.deserializeAttachment();
    return a !== null && typeof a === 'object' && typeof (a as Attachment).id === 'string' ? (a as Attachment).id : null;
  }

  async webSocketMessage(ws: WsLike, message: string | ArrayBuffer): Promise<void> {
    const id = this.idOf(ws);
    const room = await this.load();
    if (!id || !room || typeof message !== 'string') return;
    await this.finish(room, roomMessage(room, id, message, this.now()));
  }

  async webSocketClose(ws: WsLike): Promise<void> {
    const id = this.idOf(ws);
    const room = await this.load();
    if (!id || !room) return;
    // Ersetzte oder doppelte Verbindung: die Person ist über einen anderen Socket noch da
    if (this.ctx.getWebSockets(id).some((w) => w !== ws && isOpen(w))) return;
    await this.finish(room, roomLeave(room, id, this.now()));
  }

  async webSocketError(ws: WsLike): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Zeitgesteuert: Lobby-Verfall, Countdown → Läuft, Positionen bündeln, Ende, Aufräumen. */
  async alarm(): Promise<void> {
    this.alarmAt = null;
    const room = await this.load();
    if (!room) return;
    const now = this.now();
    if (room.phase === 'ended' && room.endedAt !== null && now >= room.endedAt + ROOM_KEEP_MS) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.finish(room, roomTick(room, now));
  }
}

export default {
  fetch(): Response {
    return new Response('Not found', { status: 404 });
  },
};
