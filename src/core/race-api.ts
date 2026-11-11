// Geister- und Live-Rennen in Gruppen (v12 R2): Typen der API (Schnittstelle PLAN-v12 §3a), Grenzen und die reinen
// Prüf- und Wertungsfunktionen. DOM-frei – Server (server/race.ts), Client (features/race-sync.ts) und Tests nutzen sie.
// Der Server ist maßgeblich: Er erzeugt die Aufgaben aus dem Seed, wertet die Abgabe neu und vertraut nur den Antworten.
import type { RaceConfig } from './race.ts';
import {
  RACE_DURATIONS, RACE_GRACE_MS, RACE_MAX_TASKS, decodeRaceConfig, raceDurationMs, raceScore, raceTasks,
} from './race.ts';
import { evaluate } from './scoring.ts';

/* ---------- Typen (verbindlich, PLAN-v12 §3a) ---------- */

export type RaceKind = 'ghost' | 'live';
export type RunStatus = 'none' | 'running' | 'finished' | 'expired' | 'flagged';

export interface RaceInfo {
  id: string;
  groupId: string;
  createdBy: string;
  createdByName: string;
  kind: RaceKind;
  config: RaceConfig;
  seed: number;
  createdAt: string;
  startsAt: string | null;
  endsAt: string;
}

export interface RaceListItem extends RaceInfo { myStatus: RunStatus; runs: number }

export interface RaceBoardRow {
  rank: number;
  name: string;
  me: boolean;
  correct: number;
  wrong: number;
  lastOkMs: number;
  status: RunStatus;
  steps: Array<[number, 0 | 1]>;
}

/* ---------- Grenzen ---------- */

export type RaceOpen = '1h' | '24h' | '48h' | '7d';
export const RACE_OPEN_CHOICES: readonly RaceOpen[] = ['1h', '24h', '48h', '7d'];
export const RACE_OPEN_DEFAULT: RaceOpen = '24h';
export const RACE_OPEN_MS: Readonly<Record<RaceOpen, number>> = {
  '1h': 3_600_000, '24h': 86_400_000, '48h': 172_800_000, '7d': 604_800_000,
};
/** Höchstens so viele offene Rennen (beider Arten) je Gruppe */
export const RACE_MAX_OPEN_PER_GROUP = 5;
/** Live: Lobby verfällt ohne Start nach 15 Minuten */
export const RACE_LIVE_LOBBY_MS = 15 * 60_000;
/** Live: Start liegt so weit nach `go` (Countdown) und das Fenster endet Dauer + 60 s danach */
export const RACE_LIVE_LEAD_MS = 5000;
export const RACE_LIVE_TAIL_MS = 60_000;
/** Unter dieser Zeit je richtiger Aufgabe (ms seit der vorigen Antwort) ist ein Lauf unplausibel → `flagged` */
export const RACE_MIN_TASK_MS = 250;
/**
 * Abgabe nach Dauer + Kulanz + so langer Wartezeit gilt als abgelaufen (`expired`, zählt nicht). Großzügig, weil die Abgabe
 * eines Geister-Rennens offline warten darf (Outbox wie bei der Daily) – die Antworten tragen ihre Zeit selbst.
 */
export const RACE_FINISH_SLACK_MS = 6 * 3_600_000;
/** Beendete Rennen bleiben so lange gespeichert (Datenschutz) */
export const RACE_KEEP_DAYS = 120;
export const RACE_LIST_ENDED = 10;

export const isRaceOpen = (x: unknown): x is RaceOpen => typeof x === 'string' && (RACE_OPEN_CHOICES as readonly string[]).includes(x);
export const isRaceKind = (x: unknown): x is RaceKind => x === 'ghost' || x === 'live';

/* ---------- Kennungen, Konfiguration ---------- */

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const RACE_ID_RE = /^[a-z0-9]{12}$/;
export const isRaceId = (x: unknown): x is string => typeof x === 'string' && RACE_ID_RE.test(x);

function randomBytes(random: () => number, n: number): Uint8Array {
  const b = new Uint8Array(n);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < n; i++) b[i] = Math.floor(random() * 256);
  }
  return b;
}

export function newRaceId(random: () => number = Math.random): string {
  return Array.from(randomBytes(random, 12), (x) => ID_ALPHABET[x % ID_ALPHABET.length]).join('');
}

/** 32-Bit-Seed (vorzeichenlos) für den Aufgabenstrom */
export function newRaceSeedFrom(random: () => number = Math.random): number {
  const b = randomBytes(random, 4);
  return ((b[0] ?? 0) * 16_777_216 + (b[1] ?? 0) * 65_536 + (b[2] ?? 0) * 256 + (b[3] ?? 0)) >>> 0;
}

/** Streng: Objekt mit genau den Feldern `durationS` (30/60/90/120), `cat` (sichtbare Kategorie oder „all“), `lvl` (1–3). */
export function parseRaceConfig(raw: unknown): RaceConfig | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { durationS, cat, lvl } = raw as Record<string, unknown>;
  if (typeof durationS !== 'number' || typeof cat !== 'string' || typeof lvl !== 'number') return null;
  if (!(RACE_DURATIONS as readonly number[]).includes(durationS)) return null;
  return decodeRaceConfig(`${durationS}.${cat}.${lvl}`);
}

/* ---------- Abgabe ---------- */

export interface RaceAnswerIn { i: number; input: number | null; ms: number }

/** Form der Abgabe prüfen (höchstens 150 Antworten, endliche Zahlen); die Reihenfolge prüft `judgeRaceRun`. */
export function parseRaceAnswers(raw: unknown): RaceAnswerIn[] | null {
  if (!Array.isArray(raw) || raw.length > RACE_MAX_TASKS) return null;
  const out: RaceAnswerIn[] = [];
  for (const a of raw) {
    if (a === null || typeof a !== 'object') return null;
    const { i, input, ms } = a as Record<string, unknown>;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= RACE_MAX_TASKS) return null;
    if (input !== null && (typeof input !== 'number' || !Number.isFinite(input) || Math.abs(input) > 1e15)) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > 3_600_000) return null;
    out.push({ i, input, ms: Math.round(ms) });
  }
  return out;
}

export interface RaceVerdict {
  /** `finished` zählt für die Rangliste, `flagged` nicht, `expired` = zu spät abgegeben */
  status: 'finished' | 'flagged' | 'expired';
  /** Zeitleiste der gewerteten Antworten (ms seit „Los“, höchstens bis zum Ende der Dauer) */
  steps: Array<[number, 0 | 1]>;
  correct: number;
  wrong: number;
  lastOkMs: number;
}

export interface JudgeInput {
  seed: number;
  config: RaceConfig;
  answers: readonly RaceAnswerIn[];
  /** Zeit seit dem Start des Laufs (Server: jetzt − started_at); `Infinity` = nicht prüfen */
  elapsedMs: number;
}

/**
 * Abgabe prüfen und werten.
 * - Aufgaben kommen aus dem Seed (`raceTasks`), jede Antwort wird mit `evaluate()` bewertet; der Client meldet kein Ergebnis.
 * - Antworten nach Dauer + `RACE_GRACE_MS` werden verworfen; die Kulanz gilt auch für die Uhr (eine Antwort darf nicht
 *   später datiert sein als die seit dem Start vergangene Zeit + Kulanz). Gewertet wird wie im Renn-Bildschirm: nur bis zum Ende der Dauer.
 * - `flagged`: Aufgaben nicht der Reihe nach, Zeiten nicht aufsteigend, eine richtige Antwort in unter `RACE_MIN_TASK_MS`
 *   seit der vorigen, oder Antworten, die später datiert sind als überhaupt Zeit verging.
 * - `expired`: zu spät abgegeben (Dauer + Kulanz + `RACE_FINISH_SLACK_MS`) → ohne Wertung.
 */
export function judgeRaceRun(inp: JudgeInput): RaceVerdict {
  const durationMs = raceDurationMs(inp.config);
  if (Number.isFinite(inp.elapsedMs) && inp.elapsedMs > durationMs + RACE_GRACE_MS + RACE_FINISH_SLACK_MS) {
    return { status: 'expired', steps: [], correct: 0, wrong: 0, lastOkMs: 0 };
  }
  const kept = inp.answers.filter((a) => a.ms <= durationMs + RACE_GRACE_MS);
  const tasks = raceTasks(inp.seed, inp.config, kept.reduce((m, a) => Math.max(m, a.i + 1), 0));
  let flagged = false;
  let prev = 0;
  const steps: Array<{ ms: number; ok: boolean }> = [];
  kept.forEach((a, pos) => {
    const task = tasks[a.i];
    if (!task || a.i !== pos || a.ms < prev) { flagged = true; return; }
    const ok = a.input !== null && evaluate(task, a.input, a.ms).correct;
    if (ok && a.ms - prev < RACE_MIN_TASK_MS) flagged = true;
    if (a.ms > inp.elapsedMs + RACE_GRACE_MS) flagged = true;
    prev = a.ms;
    steps.push({ ms: a.ms, ok });
  });
  const inTime = steps.filter((s) => s.ms <= durationMs);
  const sc = raceScore(inTime, durationMs);
  return {
    status: flagged ? 'flagged' : 'finished',
    steps: inTime.map((s): [number, 0 | 1] => [s.ms, s.ok ? 1 : 0]),
    correct: sc.correct, wrong: sc.wrong, lastOkMs: sc.lastOkMs,
  };
}

/** Zeitleiste aus der Antwort der API (`[ms, 0|1]`) in `RaceStep`s – für Geister-Raketen und die Ergebnisansicht. */
export function stepsOfRow(steps: ReadonlyArray<readonly [number, 0 | 1]>): Array<{ ms: number; ok: boolean }> {
  return steps.map(([ms, ok]) => ({ ms, ok: ok === 1 }));
}

/** Auszug der offenen Rennen: noch nicht abgelaufen (Live: die Lobby bzw. das Rennen läuft noch). */
export const raceIsOpen = (r: Pick<RaceInfo, 'endsAt'>, now: number): boolean => Date.parse(r.endsAt) > now;

/** „noch 20 h“ / „noch 35 min“ – Zahl und Einheit für die Anzeige (`unit`: 'd' | 'h' | 'min'). */
export function timeLeft(endsAtMs: number, nowMs: number): { n: number; unit: 'd' | 'h' | 'min' } {
  const ms = Math.max(0, endsAtMs - nowMs);
  if (ms >= 2 * 86_400_000) return { n: Math.floor(ms / 86_400_000), unit: 'd' };
  if (ms >= 3_600_000) return { n: Math.floor(ms / 3_600_000), unit: 'h' };
  return { n: Math.max(1, Math.ceil(ms / 60_000)), unit: 'min' };
}
