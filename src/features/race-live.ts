// Live-Rennen im Client (v12 R3): schlanke API-Aufrufe (Anlegen, Start, Abgabe, Ticket), WebSocket zum Rennraum mit Uhrabgleich
// und Wiederverbinden, Gegner-Raketen aus den Live-Positionen. Die Regeln des Raums stehen in src/core/race-room.ts.
// Eigene schlanke Aufrufe statt race-sync.ts: `go` liest die Startzeit auch aus `409 already`, die Abgabe braucht das Ergebnis
// sofort (Podest) statt der Offline-Outbox der Geister-Rennen. Routen und Formen wie PLAN-v12 §3a.
import type { RaceConfig, RaceOpponents, RaceRun } from '../core/race.ts';
import {
  clockOffset, parseServerMsg, type ClientMsg, type ClockSample, type PositionRow, type RaceBoardRow, type RaceInfo,
  type RunStatus, type ServerMsg,
} from '../core/race-room.ts';
import { apiUrl } from '../platform/index.ts';
import { accessToken } from './account.ts';
import { ChallengeError, type ChallengeErrorCode } from './challenge.ts';

const TIMEOUT_MS = 15_000;
const KNOWN: readonly string[] = [
  'invalid', 'unauthorized', 'not_found', 'closed', 'not_member', 'no_profile', 'full', 'too_many', 'rate_limited', 'server_error',
  'unavailable', 'already', 'no_run', 'not_started',
];

/* ---------- HTTP (Routen aus PLAN-v12 §3a) ---------- */

interface HttpResult { status: number; body: Record<string, unknown> }

async function http(method: 'GET' | 'POST', path: string, body?: unknown): Promise<HttpResult> {
  const headers: Record<string, string> = {};
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/challenge${path}`), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal, cache: 'no-store',
    });
  } catch {
    throw new ChallengeError('network');
  } finally {
    clearTimeout(timer);
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* leer oder kein JSON */ }
  const obj = data !== null && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  if (!obj) throw new ChallengeError('server_error');
  return { status: res.status, body: obj };
}

/** Fehlercode aus `{ error: { code } }` (wie die übrigen Challenge-Routen) bzw. `{ error: 'code' }` (Plan §3a). */
function codeOf(body: Record<string, unknown>): ChallengeErrorCode {
  const e = body.error;
  const c = typeof e === 'string' ? e : e !== null && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof c === 'string' && KNOWN.includes(c) ? c as ChallengeErrorCode : 'server_error';
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
  const r = await http(method, path, body);
  if (r.status < 200 || r.status >= 300) throw new ChallengeError(codeOf(r.body));
  return r.body;
}

/** Zeitpunkt als ms Unix: Zahl oder ISO-Text (R2 und R3 nennen beide Formen in §3a). */
export function toMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

export async function createLiveRace(groupId: string, config: RaceConfig): Promise<RaceInfo> {
  const r = await call('POST', '/race/create', { groupId, kind: 'live', config });
  const race = r.race as RaceInfo | undefined;
  if (!race || typeof race.id !== 'string') throw new ChallengeError('server_error');
  return race;
}

export interface RaceDetail { race: RaceInfo; board: RaceBoardRow[]; me: { status: RunStatus; startedAt: string | null } | null }

export async function getRaceInfo(id: string): Promise<RaceDetail> {
  const r = await call('GET', `/race/${encodeURIComponent(id)}`);
  const race = r.race as RaceInfo | undefined;
  if (!race || typeof race.id !== 'string') throw new ChallengeError('server_error');
  return { race, board: Array.isArray(r.board) ? r.board as RaceBoardRow[] : [], me: (r.me ?? null) as RaceDetail['me'] };
}

/** Host: Startzeit festlegen (jetzt + 5 s). War schon gestartet (`409 already`), kommt dieselbe Startzeit zurück. */
export async function goLive(id: string): Promise<number> {
  const r = await http('POST', `/race/${encodeURIComponent(id)}/go`, {});
  const at = toMs(r.body.startsAt);
  if (at !== null && (r.status === 200 || r.status === 409)) return at;
  throw new ChallengeError(codeOf(r.body));
}

export interface SubmittedAnswer { i: number; input: number | null; ms: number }
export interface SubmitResult { rank: number; correct: number; wrong: number; status: RunStatus }

export async function submitAnswers(id: string, answers: SubmittedAnswer[]): Promise<SubmitResult> {
  const r = await call('POST', `/race/${encodeURIComponent(id)}/finish`, { answers });
  return { rank: Number(r.rank ?? 0), correct: Number(r.correct ?? 0), wrong: Number(r.wrong ?? 0), status: (r.status as RunStatus | undefined) ?? 'finished' };
}

export async function fetchTicket(id: string): Promise<string> {
  const r = await call('POST', `/race/${encodeURIComponent(id)}/ticket`, {});
  if (typeof r.ticket !== 'string') throw new ChallengeError('server_error');
  return r.ticket;
}

/** Gibt es Live-Rennen auf diesem Server (Worker-Binding eingerichtet)? Ergebnis wird 5 Minuten gemerkt. */
let probe: { at: number; ok: boolean } | null = null;
export async function liveAvailable(force = false): Promise<boolean> {
  if (!force && probe && Date.now() - probe.at < 300_000) return probe.ok;
  let ok = false;
  try {
    const res = await fetch(apiUrl('/api/race/live/'), { cache: 'no-store' });
    const data: unknown = res.ok ? await res.json() : null;
    ok = data !== null && typeof data === 'object' && (data as { live?: unknown }).live === true;
  } catch { ok = false; }
  probe = { at: Date.now(), ok };
  return ok;
}

/* ---------- Auswertung ---------- */

/** Antworten des Renn-Bildschirms → Abgabe (`ms` ist relativ zu `starts_at`, weil `startPerf` daraus abgeleitet wurde). */
export function toSubmitted(answers: ReadonlyArray<{ i: number; given: number | null; ms: number }>): SubmittedAnswer[] {
  return answers.map((a) => ({ i: a.i, input: a.given, ms: a.ms }));
}

/** Zeilen der Ranglisten-Antwort → Läufe für den Ergebnis-Bildschirm (nur wer abgegeben hat). */
export function runsFromBoard(rows: readonly RaceBoardRow[]): RaceRun[] {
  return rows
    .filter((r) => r.status === 'finished' || r.status === 'flagged' || r.status === 'expired')
    .map((r) => ({ name: r.name, steps: r.steps.map(([ms, ok]) => ({ ms, ok: ok === 1 })), ...(r.me ? { me: true } : {}) }));
}

export const submittedCount = (rows: readonly RaceBoardRow[]): number => runsFromBoard(rows).length;

/* ---------- Gegner-Raketen aus Live-Positionen ---------- */

export interface LiveOpponents extends RaceOpponents {
  /** Neue Positionen des Raums einarbeiten (Höhen sinken nie) */
  update(rows: readonly PositionRow[]): void;
  /** Aktuelle Höhe einer Person (für die Zuschauer-Ansicht) */
  altitudeOf(id: string): number;
}

export function liveOpponents(roster: ReadonlyArray<{ id: string; name: string }>): LiveOpponents {
  const alt = new Map<string, number>();
  return {
    names: () => roster.map((p) => p.name),
    altitudes: () => roster.map((p) => alt.get(p.id) ?? 0),
    update(rows) { for (const [id, n] of rows) if (n > (alt.get(id) ?? 0)) alt.set(id, n); },
    altitudeOf: (id) => alt.get(id) ?? 0,
  };
}

/* ---------- WebSocket ---------- */

export interface SocketLike {
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export type LiveStatus = 'connecting' | 'open' | 'lost' | 'closed' | 'fatal';

export interface LiveOptions {
  raceId: string;
  /** Neues Ticket (je Verbindungsaufbau, auch beim Wiederverbinden) */
  getTicket?: () => Promise<string>;
  onMessage(m: ServerMsg): void;
  onStatus(s: LiveStatus, code?: ChallengeErrorCode): void;
  createSocket?: (url: string) => SocketLike;
  /** Zeit in ms Unix (Tests) */
  now?: () => number;
  /** Zeitgeber (Tests): liefert eine Funktion zum Abbrechen */
  schedule?: (fn: () => void, ms: number) => () => void;
}

export interface LiveHandle {
  /** false, wenn gerade nicht verbunden */
  send(msg: ClientMsg): boolean;
  /** Zeit des Raums (ms Unix) nach Uhrabgleich; null vor der ersten Messung */
  serverNow(): number | null;
  offset(): number | null;
  stop(): void;
}

/** wss://…/api/race/live/<id>?t=<ticket>; auf iOS mit der API-Basis-URL wie die übrigen Challenge-Aufrufe. */
export function liveSocketUrl(raceId: string, ticket: string, base: string = globalThis.location?.href ?? 'http://localhost/'): string {
  const u = new URL(apiUrl(`/api/race/live/${encodeURIComponent(raceId)}`), base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.searchParams.set('t', ticket);
  return u.toString();
}

const PING_EVERY_MS = 4000;
const RETRY_MS = [500, 1000, 2000, 3000, 5000];

export function openLive(o: LiveOptions): LiveHandle {
  const now = o.now ?? Date.now;
  const schedule = o.schedule ?? ((fn, ms): (() => void) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); });
  const getTicket = o.getTicket ?? ((): Promise<string> => fetchTicket(o.raceId));
  const create = o.createSocket ?? ((url: string): SocketLike => new WebSocket(url) as unknown as SocketLike);
  const samples: ClockSample[] = [];
  const pending = new Map<number, number>();
  let socket: SocketLike | null = null;
  let open = false;
  let over = false;
  let attempt = 0;
  let cancelPing: (() => void) | null = null;
  let cancelRetry: (() => void) | null = null;
  let seq = 0;

  const sendRaw = (m: ClientMsg): boolean => {
    if (!socket || !open) return false;
    try { socket.send(JSON.stringify(m)); return true; } catch { return false; }
  };

  const ping = (): void => {
    const c = now() * 1000 + (seq = (seq + 1) % 1000);
    pending.set(c, now());
    if (pending.size > 16) pending.delete(pending.keys().next().value as number);
    sendRaw({ t: 'ping', c });
    cancelPing = schedule(ping, samples.length < 3 ? 250 : PING_EVERY_MS);
  };

  const finish = (s: LiveStatus, code?: ChallengeErrorCode): void => {
    over = true;
    cancelPing?.();
    cancelRetry?.();
    o.onStatus(s, code);
  };

  const lost = (): void => {
    open = false;
    cancelPing?.();
    if (over) return;
    o.onStatus('lost');
    const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 5000;
    attempt += 1;
    cancelRetry = schedule(() => { void connect(); }, wait);
  };

  async function connect(): Promise<void> {
    if (over) return;
    o.onStatus('connecting');
    let ticket: string;
    try {
      ticket = await getTicket();
    } catch (e) {
      const code = e instanceof ChallengeError ? e.code : 'network';
      // Dauerhafte Fehler (Rennen weg/vorbei/kein Mitglied) beenden das Wiederverbinden; Netz- und Serverfehler nicht
      if (code === 'not_found' || code === 'closed' || code === 'not_member' || code === 'unavailable' || code === 'unauthorized' || code === 'no_profile') {
        finish('fatal', code);
      } else lost();
      return;
    }
    if (over) return;
    let ws: SocketLike;
    try { ws = create(liveSocketUrl(o.raceId, ticket)); } catch { lost(); return; }
    socket = ws;
    ws.onopen = (): void => {
      if (socket !== ws) return;
      open = true;
      attempt = 0;
      o.onStatus('open');
      ping();
    };
    ws.onmessage = (e): void => {
      if (socket !== ws) return;
      const m = parseServerMsg(e.data);
      if (!m) return;
      if (m.t === 'pong') {
        const sent = pending.get(m.c);
        if (sent !== undefined) {
          pending.delete(m.c);
          samples.push({ sent, recv: now(), server: m.s });
          if (samples.length > 12) samples.shift();
        }
      } else if (m.t === 'end') {
        o.onMessage(m);
        finish('closed');
        try { ws.close(1000); } catch { /* schon zu */ }
        return;
      } else if (m.t === 'error' && (m.code === 'started' || m.code === 'full' || m.code === 'ended')) {
        o.onMessage(m);
        finish('fatal', m.code === 'full' ? 'full' : 'closed');
        try { ws.close(1000); } catch { /* schon zu */ }
        return;
      }
      o.onMessage(m);
    };
    ws.onclose = (): void => { if (socket === ws) { socket = null; lost(); } };
    ws.onerror = (): void => { /* onclose folgt */ };
  }

  void connect();

  return {
    send: sendRaw,
    serverNow: () => { const off = clockOffset(samples); return off === null ? null : now() + off; },
    offset: () => clockOffset(samples),
    stop(): void {
      over = true;
      cancelPing?.();
      cancelRetry?.();
      const ws = socket;
      socket = null;
      open = false;
      if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(1000); } catch { /* schon zu */ } }
    },
  };
}
