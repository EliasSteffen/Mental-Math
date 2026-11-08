// Gewertete Challenges (Daily und Wettbewerbe): gemeinsame Regeln für Client und Server (DOM-frei, auch in der
// Pages Function). Der Server erzeugt die Aufgaben, speichert sie und bewertet die Abgabe mit evaluate() neu;
// der Client spielt sie mit der Trainings-Ansicht. Plan: docs/PLAN-wettbewerb.md.
import type { CategoryId, Level, LangCode, Task } from '../types.ts';
import { CATEGORIES, SUBTYPES, mixCategories } from './catalog.ts';
import { generate } from './generators/index.ts';
import { pick } from './numbers.ts';
import { evaluate } from './scoring.ts';
import { mulberry32, seedFromString } from './daily.ts';
import { getLang, setLang } from '../i18n/index.ts';

/** Ein Tag beginnt für alle um 00:00 in dieser Zeitzone (eine Rangliste je Tag). */
export const CHALLENGE_TZ = 'Europe/Berlin';
export const DAILY_RANKED_COUNT = 15;
export const DAILY_RANKED_LEVEL: Level = 2;
/** Nach dem Start bleibt so lange Zeit für die Abgabe (danach zählt der Versuch mit 0 Punkten). */
export const ATTEMPT_WINDOW_MS = 30 * 60_000;
/** Pro Aufgabe zählen höchstens so viele Millisekunden (Tab im Hintergrund o. ä.). */
export const MAX_TASK_MS = 5 * 60_000;
/** Richtige Antworten schneller als das gelten als unplausibel. */
export const MIN_PLAUSIBLE_MS = 350;
/** Ab so vielen unplausibel schnellen richtigen Antworten wird ein Versuch markiert (nicht öffentlich). */
export const FLAG_AFTER_FAST = 3;
export const COUNT_CHOICES: readonly number[] = [10, 15, 20];
export const LEVEL_CHOICES: readonly Level[] = [1, 2, 3];
export const DURATION_DAYS: readonly number[] = [1, 3, 7];
export const NAME_MIN = 3;
export const NAME_MAX = 20;
export const GROUP_NAME_MAX = 30;
export const GROUP_MAX_MEMBERS = 50;
export const GROUPS_PER_USER = 10;
export const LEADERBOARD_LIMIT = 50;

export type ChallengeKind = 'daily' | 'competition';
export type ChallengeState = 'upcoming' | 'open' | 'running' | 'done' | 'closed';
export type AttemptStatus = 'running' | 'finished' | 'expired' | 'flagged';

export interface ChallengeConfig {
  count: number;
  level: Level;
  /** null = alle Kategorien gemischt (wie die Daily) */
  categories: CategoryId[] | null;
}

export interface LocalizedText { de: string; en: string }

/** Öffentliche Sicht auf eine Challenge (ohne Aufgaben). Zeiten als ISO-Strings. */
export interface ChallengeInfo {
  id: string;
  kind: ChallengeKind;
  title: LocalizedText | null;
  startsAt: string;
  endsAt: string;
  count: number;
  level: Level;
  categories: CategoryId[] | null;
  groupId: string | null;
  groupName: string | null;
  state: ChallengeState;
  participants: number;
  result: ChallengeResult | null;
  /** Nur bei state 'running': bis wann die Abgabe angenommen wird */
  deadline: string | null;
}

export interface ChallengeAnswer {
  /** Index der Aufgabe */
  i: number;
  /** Zahl bzw. Index der Auswahl; null = „Weiß nicht“ */
  input: number | null;
  ms: number;
}

export interface ChallengeResult {
  status: AttemptStatus;
  n: number;
  correct: number;
  points: number;
  timeMs: number;
  /** null: nicht öffentlich (markiert, abgelaufen oder nicht in Ranglisten) */
  rank: number | null;
  total: number;
  /** „besser als X %“ (0–100), null bei weniger als zwei Teilnehmenden */
  percentile: number | null;
  marks: boolean[];
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  timeMs: number;
  correct: number;
  /** Bei Wochen-Ranglisten: gespielte Tage */
  days?: number;
  me: boolean;
}

export interface Leaderboard {
  scope: 'day' | 'week' | 'challenge';
  id: string;
  title: LocalizedText | null;
  groupId: string | null;
  total: number;
  top: LeaderboardEntry[];
  /** Eigene Zeile, auch wenn sie nicht in top steht (oder nicht öffentlich ist) */
  me: LeaderboardEntry | null;
}

export interface PublicProfile { displayName: string; listed: boolean }

export interface GroupInfo {
  id: string;
  name: string;
  code: string;
  owner: boolean;
  members: number;
}

/* ---------- Zeit: Tage in Europe/Berlin ---------- */

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(ts: number, tz: string): { y: number; m: number; d: number; hh: number; mm: number; ss: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const get = (type: string): number => Number(f.formatToParts(new Date(ts)).find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute'), ss: get('second') };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in der Challenge-Zeitzone. */
export function challengeDay(ts: number, tz: string = CHALLENGE_TZ): string {
  const p = parts(ts, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Abstand der Zeitzone zu UTC in ms zu einem Zeitpunkt (Berlin: +1 h bzw. +2 h). */
function offsetAt(ts: number, tz: string): number {
  const p = parts(ts, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ts / 1000) * 1000;
}

/** UTC-Zeitpunkt von 00:00 eines Tages in der Zeitzone (auch an Tagen der Zeitumstellung). */
export function dayStart(day: string, tz: string = CHALLENGE_TZ): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Ungültiger Tag: ${day}`);
  const local = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  let ts = local - offsetAt(local, tz);
  ts = local - offsetAt(ts, tz);
  return ts;
}

/** Tag ± n Tage (Kalender, nicht 24 h). */
export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Ungültiger Tag: ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  return addDays(s, 0) === s;
}

/** Montag der Woche (ISO, Montag–Sonntag) eines Tages. */
export function weekStart(day: string): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Ungültiger Tag: ${day}`);
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay(); // 0 = Sonntag
  return addDays(day, -((dow + 6) % 7));
}

/** Die sieben Tage einer Woche ab Montag. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/* ---------- IDs ---------- */

export const dailyId = (day: string): string => `daily-${day}`;

export function dayOfDailyId(id: string): string | null {
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(id);
  return m?.[1] && isDay(m[1]) ? m[1] : null;
}

const COMP_RE = /^comp-[a-z0-9][a-z0-9-]{2,46}$/;
export const isCompetitionId = (id: string): boolean => COMP_RE.test(id);
export const isChallengeId = (id: unknown): id is string =>
  typeof id === 'string' && (dayOfDailyId(id) !== null || isCompetitionId(id));

/** Zufällige ID für einen Gruppen-Wettbewerb: comp-g-<12 Zeichen> */
export function newCompetitionId(random: () => number = Math.random): string {
  const a = 'abcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += a[Math.floor(random() * a.length)] ?? 'a';
  return `comp-g-${s}`;
}

/** Einladungscode einer Gruppe: 6 Zeichen ohne leicht verwechselbare (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newGroupCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] ?? 'A';
  return s;
}

export function normalizeGroupCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 6) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}

/* ---------- Namen ---------- */

/** Wortteile, die in öffentlichen Namen nicht vorkommen dürfen (klein, ohne Leerzeichen geprüft). */
const BLOCKED = ['admin', 'moderator', 'support', 'mentalmath', 'nazi', 'hitler', 'fuck', 'fick', 'hure', 'nigg', 'schlampe', 'wichser', 'arschloch', 'bitch', 'cunt'];

/** Öffentlicher Name: getrimmt, Leerzeichen zusammengefasst, 3–20 Zeichen aus Buchstaben, Ziffern, Leerzeichen und . _ - */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const len = [...s].length;
  if (len < NAME_MIN || len > NAME_MAX) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(s)) return null;
  const flat = s.toLowerCase().replace(/[\s._-]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return s;
}

export function normalizeGroupName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  const len = [...s].length;
  if (len < 2 || len > GROUP_NAME_MAX) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .,_&'!?+-]*$/u.test(s)) return null;
  const flat = s.toLowerCase().replace(/[\s._-]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return s;
}

/* ---------- Konfiguration ---------- */

export const DAILY_CONFIG: ChallengeConfig = { count: DAILY_RANKED_COUNT, level: DAILY_RANKED_LEVEL, categories: null };

/** Gültige Konfiguration oder null (Anzahl, Stufe, nur sichtbare Kategorien ohne Drills). */
export function parseConfig(raw: unknown): ChallengeConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { count, level, categories } = raw as Record<string, unknown>;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 5 || count > 30) return null;
  if (level !== 1 && level !== 2 && level !== 3) return null;
  if (categories === null || categories === undefined) return { count, level, categories: null };
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > CATEGORIES.length) return null;
  const allowed = new Set<string>(mixCategories(null).map((c) => c.id));
  const list: CategoryId[] = [];
  for (const c of categories) {
    if (typeof c !== 'string' || !allowed.has(c) || list.includes(c as CategoryId)) return null;
    list.push(c as CategoryId);
  }
  return { count, level, categories: list };
}

export function parseTitle(raw: unknown): LocalizedText | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { de, en } = raw as Record<string, unknown>;
  const clean = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/\s+/g, ' ');
    return s.length >= 2 && s.length <= 60 ? s : null;
  };
  const d = clean(de);
  const e = clean(en) ?? d;
  return d && e ? { de: d, en: e } : null;
}

/* ---------- Aufgaben ---------- */

/**
 * Aufgaben einer Challenge aus Seed und Konfiguration, reihum über die Kategorien (wie die Daily).
 * Texte (prompt, hint, Auswahl) entstehen in der Sprache lang; die Zahlen hängen nur am Seed.
 */
export function challengeTasks(seed: string, config: ChallengeConfig, lang: LangCode, idPrefix: string): Task[] {
  const prev = getLang();
  setLang(lang);
  try {
    const rng = mulberry32(seedFromString(`challenge:${seed}`));
    const allowed = config.categories ? new Set(config.categories) : null;
    const cats = mixCategories(null).filter((c) => !allowed || allowed.has(c.id));
    const out: Task[] = [];
    for (let i = 0; i < config.count; i++) {
      const cat = cats[i % cats.length];
      if (!cat) break;
      const ids = Object.values(SUBTYPES).filter((s) => s.category === cat.id).map((s) => s.id);
      const task = generate(pick(ids, rng), rng, { level: config.level });
      task.id = `${idPrefix}-${i}`;
      task.mode = 'challenge';
      out.push(task);
    }
    return out;
  } finally {
    setLang(prev);
  }
}

/** Beide Sprachen aus demselben Seed (gleiche Zahlen, eigene Texte). */
export function challengeTaskSet(seed: string, config: ChallengeConfig, idPrefix: string): { de: Task[]; en: Task[] } {
  return { de: challengeTasks(seed, config, 'de', idPrefix), en: challengeTasks(seed, config, 'en', idPrefix) };
}

/* ---------- Abgabe und Wertung ---------- */

/** Bereinigte Antworten: je Aufgabe höchstens eine (die erste), ms begrenzt; fehlende Aufgaben = „Weiß nicht“. */
export function parseAnswers(raw: unknown, count: number): ChallengeAnswer[] | null {
  if (!Array.isArray(raw) || raw.length > count) return null;
  const seen = new Set<number>();
  const out: ChallengeAnswer[] = [];
  for (const a of raw) {
    if (typeof a !== 'object' || a === null) return null;
    const { i, input, ms } = a as Record<string, unknown>;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= count) return null;
    if (input !== null && (typeof input !== 'number' || !Number.isFinite(input) || Math.abs(input) > 1e15)) return null;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
    if (seen.has(i)) continue;
    seen.add(i);
    out.push({ i, input, ms: Math.min(Math.round(ms), MAX_TASK_MS) });
  }
  return out.sort((a, b) => a.i - b.i);
}

export interface Score {
  n: number;
  correct: number;
  points: number;
  timeMs: number;
  marks: boolean[];
  /** Richtige Antworten unter MIN_PLAUSIBLE_MS */
  fast: number;
}

/** Wertung wie im Training: mit Zeit, ohne Hilfe, ohne Schätzen. Fehlende Antworten zählen als „Weiß nicht“. */
export function scoreAttempt(tasks: readonly Task[], answers: readonly ChallengeAnswer[]): Score {
  const byIndex = new Map(answers.map((a) => [a.i, a]));
  let correct = 0;
  let points = 0;
  let timeMs = 0;
  let fast = 0;
  const marks: boolean[] = [];
  tasks.forEach((task, i) => {
    const a = byIndex.get(i);
    const ms = a?.ms ?? 0;
    const ev = evaluate(task, a ? a.input : null, ms, { assisted: false, untimed: false, estimate: false });
    if (ev.correct) {
      correct += 1;
      if (ms < MIN_PLAUSIBLE_MS) fast += 1;
    }
    points += ev.points;
    timeMs += ms;
    marks.push(ev.correct);
  });
  return { n: tasks.length, correct, points, timeMs, marks, fast };
}

/** Rangfolge: mehr Punkte, dann weniger Zeit, dann früher abgegeben. */
export function compareRank(
  a: { points: number; timeMs: number; finishedAt: number },
  b: { points: number; timeMs: number; finishedAt: number },
): number {
  return b.points - a.points || a.timeMs - b.timeMs || a.finishedAt - b.finishedAt;
}

/** „Besser als X %“ der übrigen Teilnehmenden; null bei weniger als zwei. */
export function percentile(rank: number, total: number): number | null {
  if (total < 2 || rank < 1) return null;
  return Math.round(((total - rank) / (total - 1)) * 100);
}

/** Zustand einer Challenge für eine Person zu einem Zeitpunkt. */
export function stateOf(
  c: { startsAt: number; endsAt: number },
  attempt: { status: AttemptStatus; startedAt: number } | null,
  now: number,
): ChallengeState {
  if (attempt) {
    if (attempt.status !== 'running') return 'done';
    return now <= attempt.startedAt + ATTEMPT_WINDOW_MS ? 'running' : 'done';
  }
  if (now < c.startsAt) return 'upcoming';
  if (now >= c.endsAt) return 'closed';
  return 'open';
}
