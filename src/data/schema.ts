// Defaults und Normalisierung der Anwendungsdaten (State v2-Sicht). Keine Abhängigkeit zu Adaptern/Repository.
import type {
  Activity, Attempt, DailyResult, Level, ParallelStats, Reviews, Session, Settings, State, ThemeSetting, TimerDisplay,
} from '../types.ts';

export const DEFAULT_SETTINGS: Settings = {
  sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto',
  timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto',
  enabledCategories: null,
  autoSubmit: false, numpadLayout: 'calculator', estimateMode: false, ghost: true,
  autoFail: false,
  lang: 'auto',
  lastSeenVersion: '',
  timerDisplay: 'calm', breathe: false, confetti: false,
  lastStoreCheck: 0, updateNotifiedVersion: '', updateNotifiedAt: 0, reviewAskedVersion: '', reviewAskedAt: 0,
  onboardingDone: false,
};

export const DEFAULT_PARALLEL_STATS: ParallelStats = { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 };

export const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Pflichtfelder eines Versuchs – eine Quelle der Wahrheit für Import, Migration und Sync-Push (asResult).
 * Alle App-Versionen seit v1 schreiben diese Felder vollständig (`unit` ggf. ''), daher keine Reparatur.
 */
export function isValidAttempt(x: unknown): x is Attempt {
  return isObj(x)
    && [x.sessionId, x.mode, x.category, x.subtype, x.prompt, x.unit].every(isStr)
    && [x.ts, x.timeMs, x.targetMs, x.points, x.expected, x.weight].every(isNum)
    && typeof x.correct === 'boolean';
}

/** Pflichtfelder einer Runde (`id` fehlt bei Bedarf → wird neu vergeben). */
export function isValidSession(x: unknown): x is Session {
  return isObj(x) && isStr(x.mode) && [x.ts, x.n, x.correct, x.points, x.avgTimeMs].every(isNum);
}

/** Gültige Theme-Einstellungen (Reihenfolge wie im Profil). */
export const THEME_SETTINGS: readonly ThemeSetting[] = ['system', 'paper', 'night', 'oled', 'aurora', 'neon'];
const TIMER_DISPLAYS: readonly TimerDisplay[] = ['calm', 'precise', 'off'];

/** Theme-Migration (E1): 'pastel' → 'paper', 'neon'/'oled' bleiben, Unbekanntes → 'system'. */
export function normalizeTheme(v: unknown): ThemeSetting {
  if (v === 'pastel') return 'paper';
  return THEME_SETTINGS.find((x) => x === v) ?? 'system';
}

/**
 * Beliebige gespeicherte/importierte/synchronisierte Einstellungen → gültige Settings.
 * Fehlende Felder kommen aus den Defaults; Theme wird migriert; fehlende `timerDisplay` folgt dem alten
 * `timer` (false → 'off', sonst 'calm', E3); `breathe`/`confetti` nur als Boolean.
 */
export function normalizeSettings(raw: unknown): Settings {
  const s: Record<string, unknown> = isObj(raw) ? raw : {};
  const td = TIMER_DISPLAYS.find((x) => x === s.timerDisplay);
  return {
    ...DEFAULT_SETTINGS,
    ...(s as Partial<Settings>),
    theme: normalizeTheme(s.theme ?? DEFAULT_SETTINGS.theme),
    timerDisplay: td ?? (s.timer === false ? 'off' : 'calm'),
    breathe: typeof s.breathe === 'boolean' ? s.breathe : DEFAULT_SETTINGS.breathe,
    confetti: typeof s.confetti === 'boolean' ? s.confetti : DEFAULT_SETTINGS.confetti,
    onboardingDone: s.onboardingDone === true,
  };
}

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

/**
 * Beliebige (auch alte v1-)Daten → gültiger State v2. Fehlende Felder werden mit Defaults ergänzt;
 * unvollständige Versuche/Runden fallen weg (sonst scheitert später der Sync-Push).
 */
export function normalize(s: unknown): State {
  const d = defaults();
  if (!isObj(s)) return d;
  return {
    version: 2,
    attempts: Array.isArray(s.attempts) ? s.attempts.filter(isValidAttempt) : d.attempts,
    sessions: Array.isArray(s.sessions) ? s.sessions.filter(isValidSession) : d.sessions,
    settings: normalizeSettings(s.settings),
    reviews: isObj(s.reviews) ? (s.reviews as Reviews) : d.reviews,
    activity: isObj(s.activity) ? (s.activity as Activity) : d.activity,
    dailyResults: isObj(s.dailyResults) ? (s.dailyResults as Record<string, DailyResult>) : d.dailyResults,
    chainBest: isObj(s.chainBest) ? (s.chainBest as Partial<Record<Level, number>>) : d.chainBest,
    parallel: normalizeParallel(s.parallel),
  };
}
