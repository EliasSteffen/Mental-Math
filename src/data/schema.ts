// Defaults und Normalisierung der Anwendungsdaten (State v2-Sicht). Keine Abhängigkeit zu Adaptern/Repository.
import type { Activity, Attempt, DailyResult, Level, ParallelStats, Reviews, Session, Settings, State } from '../types.ts';

export const DEFAULT_SETTINGS: Settings = {
  sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto',
  timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto',
  enabledCategories: null,
  autoSubmit: false, numpadLayout: 'calculator', estimateMode: false, ghost: true,
  autoFail: false,
};

export const DEFAULT_PARALLEL_STATS: ParallelStats = { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 };

export const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export const defaults = (): State => ({
  version: 2, attempts: [], sessions: [], settings: { ...DEFAULT_SETTINGS }, reviews: {}, activity: {},
  dailyResults: {}, chainBest: {},
  parallel: { ...DEFAULT_PARALLEL_STATS },
});

export function normalizeParallel(p: unknown): ParallelStats {
  const d = { ...DEFAULT_PARALLEL_STATS };
  if (!isObj(p)) return d;
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fb);
  const ns = p.nextStart === 3 || p.nextStart === 4 ? p.nextStart : 2;
  return { nextStart: ns, bestChains: num(p.bestChains, 0), bestCorrectStreak: num(p.bestCorrectStreak, 0), rounds: num(p.rounds, 0) };
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
