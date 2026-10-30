// localStorage mit In-Memory-Fallback, Schema v2 und In-Memory-Cache
import type { Activity, Attempt, DailyResult, Level, ParallelStats, Reviews, Session, Settings, State } from '../types.ts';

const KEY = 'kopfrechner.v1'; // Schlüssel bleibt, damit keine Nutzerdaten verloren gehen
const MAX_ATTEMPTS = 5000;
const MAX_SESSIONS = 500;
const MAX_ACTIVITY_DAYS = 400;

export const DEFAULT_SETTINGS: Settings = {
  sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto',
  timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto',
  enabledCategories: null,
  autoSubmit: false, numpadLayout: 'calculator', estimateMode: false, ghost: true,
};

export const DEFAULT_PARALLEL_STATS: ParallelStats = { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 };

const defaults = (): State => ({
  version: 2, attempts: [], sessions: [], settings: { ...DEFAULT_SETTINGS }, reviews: {}, activity: {},
  dailyResults: {}, chainBest: {},
  parallel: { ...DEFAULT_PARALLEL_STATS },
});

const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

function store(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Beliebige (auch alte v1-)Daten → gültiger State v2. Fehlende Felder werden mit Defaults ergänzt. */
export function normalize(s: unknown): State {
  const d = defaults();
  if (!isObj(s)) return d;
  return {
    version: 2,
    attempts: Array.isArray(s.attempts) ? (s.attempts as Attempt[]) : d.attempts,
    sessions: Array.isArray(s.sessions) ? (s.sessions as Session[]) : d.sessions,
    settings: { ...d.settings, ...(isObj(s.settings) ? (s.settings as Partial<Settings>) : {}) },
    reviews: isObj(s.reviews) ? (s.reviews as Reviews) : d.reviews,
    activity: isObj(s.activity) ? (s.activity as Activity) : d.activity,
    dailyResults: isObj(s.dailyResults) ? (s.dailyResults as Record<string, DailyResult>) : d.dailyResults,
    chainBest: isObj(s.chainBest) ? (s.chainBest as Partial<Record<Level, number>>) : d.chainBest,
    parallel: normalizeParallel(s.parallel),
  };
}

function normalizeParallel(p: unknown): ParallelStats {
  const d = { ...DEFAULT_PARALLEL_STATS };
  if (!isObj(p)) return d;
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb);
  const ns = p.nextStart === 3 || p.nextStart === 4 ? p.nextStart : 2;
  return { nextStart: ns, bestChains: num(p.bestChains, 0), bestCorrectStreak: num(p.bestCorrectStreak, 0), rounds: num(p.rounds, 0) };
}

// ---------- Cache ----------
let mem: State | null = null; // In-Memory-Fallback (wenn localStorage fehlt/voll ist)
let cache: State | null = null; // geparster Stand von localStorage (Write-Through)

if (typeof globalThis.addEventListener === 'function') {
  // Änderungen aus anderen Tabs: Cache verwerfen
  globalThis.addEventListener('storage', (e: Event) => {
    const key = (e as StorageEvent).key;
    if (key === null || key === undefined || key === KEY) cache = null;
  });
}

/** Cache verwerfen (z. B. für Tests oder nach externen Änderungen) */
export function invalidateCache(): void {
  cache = null;
}

export function load(): State {
  if (cache) return cache;
  try {
    const ls = store();
    const raw = ls && ls.getItem(KEY);
    if (raw) {
      cache = normalize(JSON.parse(raw) as unknown);
      return cache;
    }
  } catch {
    /* Fallback unten */
  }
  cache = normalize(mem);
  return cache;
}

export function save(state: State): void {
  const next = normalize(state);
  mem = next;
  cache = next;
  try {
    const ls = store();
    if (ls) ls.setItem(KEY, JSON.stringify(next));
  } catch {
    /* In-Memory-Fallback */
  }
}

export const getAttempts = (): Attempt[] => load().attempts;
export const getSessions = (): Session[] => load().sessions;
export const getSettings = (): Settings => load().settings;

export function setSettings(partial: Partial<Settings>): Settings {
  const s = load();
  s.settings = { ...s.settings, ...partial };
  save(s);
  return s.settings;
}

export const getReviews = (): Reviews => load().reviews;

export function setReviews(reviews: Reviews): Reviews {
  const s = load();
  s.reviews = isObj(reviews) ? reviews : {};
  save(s);
  return s.reviews;
}

export const getActivity = (): Activity => load().activity;

export function addActivityMs(ms: number, ts: number = Date.now()): number {
  const s = load();
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  s.activity[key] = (Number(s.activity[key]) || 0) + (Number(ms) || 0);
  const keys = Object.keys(s.activity).sort();
  if (keys.length > MAX_ACTIVITY_DAYS) for (const k of keys.slice(0, keys.length - MAX_ACTIVITY_DAYS)) delete s.activity[k];
  save(s);
  return s.activity[key] ?? 0;
}

export function addAttempt(attempt: Attempt): void {
  const s = load();
  s.attempts.push(attempt);
  if (s.attempts.length > MAX_ATTEMPTS) s.attempts = s.attempts.slice(-MAX_ATTEMPTS);
  save(s);
}

export function addSession(session: Session): void {
  const s = load();
  s.sessions.push(session);
  if (s.sessions.length > MAX_SESSIONS) s.sessions = s.sessions.slice(-MAX_SESSIONS);
  save(s);
}

// ---------- v2: Daily & Kettenrechnen ----------
export const getDailyResults = (): Record<string, DailyResult> => load().dailyResults;

export function setDailyResult(dateKey: string, result: DailyResult): Record<string, DailyResult> {
  const s = load();
  s.dailyResults[dateKey] = result;
  save(s);
  return s.dailyResults;
}

export const getChainBest = (): Partial<Record<Level, number>> => load().chainBest;

export function setChainBest(level: Level, value: number): Partial<Record<Level, number>> {
  const s = load();
  s.chainBest[level] = value;
  save(s);
  return s.chainBest;
}

export const getParallelStats = (): ParallelStats => load().parallel;

export function setParallelStats(stats: ParallelStats): ParallelStats {
  const s = load();
  s.parallel = normalizeParallel(stats);
  save(s);
  return s.parallel;
}

export function resetAll(): void {
  mem = null;
  cache = null;
  try {
    const ls = store();
    if (ls) ls.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function exportJSON(): string {
  return JSON.stringify(load(), null, 2);
}
