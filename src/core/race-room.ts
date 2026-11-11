// Live-Rennen (v12 R3), DOM-frei: Zustandsautomat des Raums (Lobby → Countdown → Läuft → Ende), Nachrichten zwischen Client
// und Raum sowie Uhrabgleich. Genutzt vom Durable Object (workers/race-room), vom Client (src/features/race-live.ts) und von Tests.
// Der Raum ist nur Treffpunkt und Taktgeber: Er verteilt Startzeit und Positionen (reine Anzeige). Gewertet wird
// über POST /api/challenge/race/:id/finish (Server prüft gegen starts_at) – so bleiben Rangliste und Verlauf gleich.
// Alle Funktionen sind rein bis auf die Mutation des übergebenen `RoomState`; die Zeit kommt als Argument (`now`, ms Unix).
import { RACE_DURATIONS, RACE_GRACE_MS, RACE_MAX_TASKS, cleanRaceName, type RaceConfig } from './race.ts';

/* ---------- Typen aus der Schnittstelle R2 ↔ R3 (PLAN-v12 §3a) ---------- */

// TODO(v12-merge): aus race-api.ts
export type RaceKind = 'ghost' | 'live';
// TODO(v12-merge): aus race-api.ts
export type RunStatus = 'none' | 'running' | 'finished' | 'expired' | 'flagged';
// TODO(v12-merge): aus race-api.ts
export interface RaceInfo {
  id: string; groupId: string; createdBy: string; createdByName: string; kind: RaceKind; config: RaceConfig; seed: number;
  createdAt: string; startsAt: string | null; endsAt: string;
}
// TODO(v12-merge): aus race-api.ts
export interface RaceBoardRow {
  rank: number; name: string; me: boolean; correct: number; wrong: number; lastOkMs: number; status: RunStatus;
  steps: Array<[number, 0 | 1]>;
}

/* ---------- Konstanten ---------- */

/** Eine Lobby ohne Start verfällt nach 15 Minuten. */
export const ROOM_LOBBY_TTL_MS = 15 * 60_000;
export const ROOM_MIN_PLAYERS = 2;
/** So viele Raketen passen auf die Rennbahn */
export const ROOM_MAX_PLAYERS = 8;
/** Positionen gehen gebündelt hinaus: höchstens 5 × pro Sekunde */
export const ROOM_FLUSH_MS = 200;
/** Erlaubtes Fenster für `startsAt` (Host-Client schickt den Wert aus POST /race/:id/go): Vergangenheit / Zukunft */
export const ROOM_START_PAST_MS = 5_000;
export const ROOM_START_FUTURE_MS = 30_000;
/** Nach dem Ende bleibt der Zustand so lange, dann räumt der Raum auf (Nachzügler sehen „beendet“) */
export const ROOM_KEEP_MS = 60 * 60_000;
/** Antworten dürfen minimal vor dem Takt des Raums eintreffen (Uhrabweichung) */
const POS_EARLY_MS = 500;

export type RoomPhase = 'lobby' | 'countdown' | 'running' | 'ended';
export type EndReason = 'done' | 'expired';
export type RoomError = 'not_host' | 'too_few' | 'bad_start' | 'started' | 'full' | 'ended' | 'invalid';

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  /** Richtige Antworten (Höhe der Rakete) */
  n: number;
  /** Beantwortete Aufgaben (nächster Index ≥ a) */
  a: number;
  lastMs: number;
}

export interface RoomState {
  raceId: string;
  durationMs: number;
  createdAt: number;
  /** Lobby verfällt zu diesem Zeitpunkt (ms) */
  expiresAt: number;
  phase: RoomPhase;
  startsAt: number | null;
  /** Dauer + Kulanz nach `startsAt` */
  endsAt: number | null;
  endedAt: number | null;
  endReason: EndReason | null;
  hostId: string | null;
  /** In Beitrittsreihenfolge (Host-Nachfolge: der Nächste in der Liste) */
  players: RoomPlayer[];
  lastFlushAt: number;
  dirty: boolean;
}

/* ---------- Nachrichten ---------- */

export type ClientMsg =
  | { t: 'ping'; c: number }
  /** Nur der Host; `startsAt` stammt aus POST /race/:id/go (ms Unix) */
  | { t: 'start'; startsAt: number }
  /** Antwort Nr. `i` (Index der Aufgabe) war richtig/falsch, `ms` seit „Los“ – nur Anzeige */
  | { t: 'pos'; i: number; ok: boolean; ms: number }
  | { t: 'leave' };

export interface LobbyPlayer { id: string; name: string; host: boolean; connected: boolean }
/** Position: [Spieler-ID, richtig, beantwortet] */
export type PositionRow = [string, number, number];

export type ServerMsg =
  | {
    t: 'lobby'; you: string; phase: RoomPhase; hostId: string | null; players: LobbyPlayer[]; startsAt: number | null;
    durationS: number; expiresAt: number; now: number;
  }
  | { t: 'start'; startsAt: number }
  | { t: 'positions'; at: number; p: PositionRow[] }
  | { t: 'end'; reason: EndReason; p: PositionRow[] }
  | { t: 'pong'; c: number; s: number }
  | { t: 'error'; code: RoomError };

/** Empfänger: Spieler-ID oder `'*'` für alle Verbundenen */
export interface Out { to: string; msg: ServerMsg }

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Nachricht eines Clients prüfen (Text oder schon geparstes JSON); alles Unbekannte → null. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 512) return null;
    try { v = JSON.parse(raw); } catch { return null; }
  }
  if (!isObj(v)) return null;
  switch (v.t) {
    case 'ping': return isNum(v.c) ? { t: 'ping', c: v.c } : null;
    case 'start': return isNum(v.startsAt) ? { t: 'start', startsAt: Math.round(v.startsAt) } : null;
    case 'pos':
      return isNum(v.i) && Number.isInteger(v.i) && typeof v.ok === 'boolean' && isNum(v.ms)
        ? { t: 'pos', i: v.i, ok: v.ok, ms: v.ms } : null;
    case 'leave': return { t: 'leave' };
    default: return null;
  }
}

const isRow = (x: unknown): x is PositionRow => Array.isArray(x) && x.length === 3 && typeof x[0] === 'string' && isNum(x[1]) && isNum(x[2]);

/** Nachricht des Raums prüfen (Client-Seite); Unbekanntes → null. */
export function parseServerMsg(raw: unknown): ServerMsg | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 8192) return null;
    try { v = JSON.parse(raw); } catch { return null; }
  }
  if (!isObj(v)) return null;
  switch (v.t) {
    case 'pong': return isNum(v.c) && isNum(v.s) ? { t: 'pong', c: v.c, s: v.s } : null;
    case 'start': return isNum(v.startsAt) ? { t: 'start', startsAt: v.startsAt } : null;
    case 'error': return typeof v.code === 'string' ? { t: 'error', code: v.code as RoomError } : null;
    case 'positions': return isNum(v.at) && Array.isArray(v.p) && v.p.every(isRow) ? { t: 'positions', at: v.at, p: v.p as PositionRow[] } : null;
    case 'end':
      return (v.reason === 'done' || v.reason === 'expired') && Array.isArray(v.p) && v.p.every(isRow)
        ? { t: 'end', reason: v.reason, p: v.p as PositionRow[] } : null;
    case 'lobby': {
      const phases: readonly unknown[] = ['lobby', 'countdown', 'running', 'ended'];
      if (typeof v.you !== 'string' || !phases.includes(v.phase) || !Array.isArray(v.players) || !isNum(v.durationS)
        || !isNum(v.expiresAt) || !isNum(v.now)) return null;
      const players: LobbyPlayer[] = [];
      for (const p of v.players) {
        if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string') return null;
        players.push({ id: p.id, name: p.name, host: p.host === true, connected: p.connected !== false });
      }
      return {
        t: 'lobby', you: v.you, phase: v.phase as RoomPhase, hostId: typeof v.hostId === 'string' ? v.hostId : null, players,
        startsAt: isNum(v.startsAt) ? v.startsAt : null, durationS: v.durationS, expiresAt: v.expiresAt, now: v.now,
      };
    }
    default: return null;
  }
}

/* ---------- Zustandsautomat ---------- */

export function createRoom(raceId: string, durationMs: number, now: number): RoomState {
  return {
    raceId, durationMs, createdAt: now, expiresAt: now + ROOM_LOBBY_TTL_MS, phase: 'lobby', startsAt: null, endsAt: null,
    endedAt: null, endReason: null, hostId: null, players: [], lastFlushAt: 0, dirty: false,
  };
}

/** Dauer aus dem Ticket: nur die erlaubten 30/60/90/120 s. */
export function durationMsOf(durationS: unknown): number | null {
  return typeof durationS === 'number' && (RACE_DURATIONS as readonly number[]).includes(durationS) ? durationS * 1000 : null;
}

const positions = (s: RoomState): PositionRow[] => s.players.map((p) => [p.id, p.n, p.a]);
const connectedCount = (s: RoomState): number => s.players.filter((p) => p.connected).length;

/** Schnappschuss für genau eine Person (`you`) – wird bei jeder Änderung an alle Verbundenen geschickt. */
export function lobbyFor(s: RoomState, you: string, now: number): ServerMsg {
  return {
    t: 'lobby', you, phase: s.phase, hostId: s.hostId,
    players: s.players.map((p) => ({ id: p.id, name: p.name, host: p.id === s.hostId, connected: p.connected })),
    startsAt: s.startsAt, durationS: Math.round(s.durationMs / 1000), expiresAt: s.expiresAt, now,
  };
}

const lobbyAll = (s: RoomState, now: number): Out[] => s.players.filter((p) => p.connected).map((p) => ({ to: p.id, msg: lobbyFor(s, p.id, now) }));

function endRoom(s: RoomState, reason: EndReason, now: number): Out[] {
  s.phase = 'ended';
  s.endReason = reason;
  s.endedAt = now;
  s.dirty = false;
  return [{ to: '*', msg: { t: 'end', reason, p: positions(s) } }];
}

function flush(s: RoomState, now: number): Out[] {
  s.lastFlushAt = now;
  s.dirty = false;
  return [{ to: '*', msg: { t: 'positions', at: now, p: positions(s) } }];
}

/** Zeitgesteuerte Übergänge und fällige Positionen. Der Raum ruft das bei jedem Ereignis und im Alarm auf. */
export function roomTick(s: RoomState, now: number): Out[] {
  const out: Out[] = [];
  for (let guard = 0; guard < 4; guard++) {
    if (s.phase === 'lobby' && now >= s.expiresAt) out.push(...endRoom(s, 'expired', now));
    else if (s.phase === 'countdown' && s.startsAt !== null && now >= s.startsAt) s.phase = 'running';
    else if (s.phase === 'running' && s.endsAt !== null && now >= s.endsAt) out.push(...endRoom(s, 'done', now));
    else break;
  }
  if (s.phase === 'running' && s.dirty && now - s.lastFlushAt >= ROOM_FLUSH_MS) out.push(...flush(s, now));
  return out;
}

/** Wann der Raum das nächste Mal von selbst aufwachen muss (Alarm); null = nie. */
export function nextWake(s: RoomState, now: number): number | null {
  let at: number | null = null;
  if (s.phase === 'lobby') at = s.expiresAt;
  else if (s.phase === 'countdown') at = s.startsAt;
  else if (s.phase === 'running') {
    at = s.endsAt;
    if (s.dirty) at = Math.min(at ?? Infinity, s.lastFlushAt + ROOM_FLUSH_MS);
  } else if (s.endedAt !== null) at = s.endedAt + ROOM_KEEP_MS;
  return at === null ? null : Math.max(at, now + 1);
}

export interface JoinResult { accept: boolean; out: Out[] }

/** Verbindung einer Person (Identität stammt aus dem geprüften Ticket). Wer schon im Raum ist, verbindet sich neu. */
export function roomJoin(s: RoomState, who: { id: string; name: string }, now: number): JoinResult {
  const out = roomTick(s, now);
  if (s.phase === 'ended') return { accept: false, out: [...out, { to: who.id, msg: { t: 'end', reason: s.endReason ?? 'done', p: positions(s) } }] };
  const known = s.players.find((p) => p.id === who.id);
  if (known) {
    known.connected = true;
  } else {
    if (s.phase !== 'lobby') return { accept: false, out: [...out, { to: who.id, msg: { t: 'error', code: 'started' } }] };
    if (s.players.length >= ROOM_MAX_PLAYERS) return { accept: false, out: [...out, { to: who.id, msg: { t: 'error', code: 'full' } }] };
    s.players.push({ id: who.id, name: cleanRaceName(who.name) || '?', connected: true, n: 0, a: 0, lastMs: 0 });
    if (s.hostId === null) s.hostId = who.id;
  }
  return { accept: true, out: [...out, ...lobbyAll(s, now)] };
}

/** Person verlässt den Raum (Verbindung weg oder `leave`). Lobby: raus und ggf. neuer Host; danach: „Verbindung verloren“. */
export function roomLeave(s: RoomState, id: string, now: number): Out[] {
  const out = roomTick(s, now);
  const idx = s.players.findIndex((p) => p.id === id);
  const p = s.players[idx];
  if (!p || s.phase === 'ended') return out;
  if (s.phase === 'lobby') {
    s.players.splice(idx, 1);
    if (s.hostId === id) s.hostId = s.players.find((x) => x.connected)?.id ?? null;
  } else p.connected = false;
  return [...out, ...lobbyAll(s, now)];
}

const error = (to: string, code: RoomError): Out => ({ to, msg: { t: 'error', code } });

/** Nachricht einer verbundenen Person. Nach dem Ende wird alles ignoriert; Unsinn auch. */
export function roomMessage(s: RoomState, id: string, raw: unknown, now: number): Out[] {
  const out = roomTick(s, now);
  if (s.phase === 'ended') return out;
  const player = s.players.find((p) => p.id === id);
  const msg = parseClientMsg(raw);
  if (!player || !msg) return out;
  switch (msg.t) {
    case 'ping':
      return [...out, { to: id, msg: { t: 'pong', c: msg.c, s: now } }];
    case 'leave':
      return [...out, ...roomLeave(s, id, now)];
    case 'start': {
      if (s.hostId !== id) return [...out, error(id, 'not_host')];
      if (s.phase !== 'lobby') return [...out, error(id, 'bad_start')];
      if (connectedCount(s) < ROOM_MIN_PLAYERS) return [...out, error(id, 'too_few')];
      if (msg.startsAt < now - ROOM_START_PAST_MS || msg.startsAt > now + ROOM_START_FUTURE_MS) return [...out, error(id, 'bad_start')];
      s.phase = 'countdown';
      s.startsAt = msg.startsAt;
      s.endsAt = msg.startsAt + s.durationMs + RACE_GRACE_MS;
      return [...out, { to: '*', msg: { t: 'start', startsAt: msg.startsAt } }, ...lobbyAll(s, now), ...roomTick(s, now)];
    }
    case 'pos': {
      const live = s.phase === 'running' || (s.phase === 'countdown' && s.startsAt !== null && now >= s.startsAt - POS_EARLY_MS);
      if (!live) return out;
      // Monoton: nur neuere Antworten (Index ≥ bisher beantwortet), Zeit nicht rückwärts, in Grenzen
      if (msg.i < player.a || msg.i >= RACE_MAX_TASKS || msg.ms < player.lastMs || msg.ms < 0 || msg.ms > s.durationMs + RACE_GRACE_MS) return out;
      player.a = msg.i + 1;
      player.lastMs = msg.ms;
      if (msg.ok) player.n += 1;
      s.dirty = true;
      return [...out, ...roomTick(s, now)];
    }
  }
}

/* ---------- Uhrabgleich (Client) ---------- */

/** Ein ping/pong: Client-Zeit beim Senden/Empfangen und die Zeit des Raums in der Antwort (alles ms Unix). */
export interface ClockSample { sent: number; recv: number; server: number }

/** Versatz „Raumzeit − Client-Zeit“ aus dem Austausch mit der kürzesten Laufzeit (genauester Wert); null ohne Messung. */
export function clockOffset(samples: readonly ClockSample[]): number | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    if (!(s.recv >= s.sent)) continue;
    if (best === null || s.recv - s.sent < best.recv - best.sent) best = s;
  }
  return best === null ? null : Math.round(best.server - (best.sent + best.recv) / 2);
}

/** `performance.now()`-Wert, zu dem die Raumzeit `serverMs` erreicht ist (Eingabe für `playRace({ startPerf })`). */
export function perfAt(serverMs: number, offset: number, wallNow: number, perfNow: number): number {
  return perfNow + (serverMs - (wallNow + offset));
}
