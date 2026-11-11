// Defaults und Normalisierung der Anwendungsdaten (State v2-Sicht). Keine Abhängigkeit zu Adaptern/Repository.
import type {
  Activity, Attempt, DailyResult, Level, ParallelStats, Reviews, Session, Settings, State, ThemeSetting, TimerDisplay,
} from '../types.ts';

export const DEFAULT_SETTINGS: Settings = {
  sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto',
  timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto',
  enabledCategories: null,
  autoSubmit: false, numpadLayout: 'calculator', keypadSide: 'right', estimateMode: false, ghost: true,
  autoFail: false,
  lang: 'auto',
  lastSeenVersion: '',
  timerDisplay: 'calm', breathe: false, confetti: false,
  lastStoreCheck: 0, updateNotifiedVersion: '', updateNotifiedAt: 0, reviewAskedVersion: '', reviewAskedAt: 0,
  onboardingDone: false,
  placement: null,
  dailyGoalRounds: 3, // v9 B
  autoAdvance: true, // v9 A
  duelName: '', // v9 I
  league: null, badges: {}, cards: {}, // v9 J
  // v10
  xp: { earned: 0, seen: 0, bonus: 0, spent: 0 }, purchases: {}, frame: '', freezesBought: [], streakRepairs: [], comebackDays: [],
  questLog: {}, chests: {}, lpSeen: -1,
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
const KEYPAD_SIDES: ReadonlyArray<Settings['keypadSide']> = ['left', 'center', 'right'];

/** Theme-Migration (E1): 'pastel' → 'paper', 'neon'/'oled' bleiben, Unbekanntes → 'system'. */
export function normalizeTheme(v: unknown): ThemeSetting {
  if (v === 'pastel') return 'paper';
  return THEME_SETTINGS.find((x) => x === v) ?? 'system';
}

/** Ergebnis des Einstufungstests: ganze Zahl 0–6 und Zeitpunkt, sonst null. */
export function normalizePlacement(v: unknown): Settings['placement'] {
  if (!isObj(v)) return null;
  const { theta, ts } = v;
  return typeof theta === 'number' && Number.isInteger(theta) && theta >= 0 && theta <= 6 && isNum(ts) ? { theta, ts } : null;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Liga (v9 J): Stufe und Peak ganze Zahlen 0–15, Peak ≥ Stufe; sonst null. */
export function normalizeLeague(v: unknown): Settings['league'] {
  if (!isObj(v)) return null;
  const { tier, peak, ts } = v;
  if (!isInt(tier, 0, 15) || !isInt(peak, 0, 15) || !isNum(ts)) return null;
  return { tier, peak: Math.max(tier, peak), ts };
}

/** Orden (v9 J): höchstens 64 Einträge, Stufe 1–3, Zeitpunkt endlich; Unbrauchbares fällt weg. */
export function normalizeBadges(v: unknown): Settings['badges'] {
  const out: Settings['badges'] = {};
  if (!isObj(v)) return out;
  for (const [id, b] of Object.entries(v).slice(0, 64)) {
    if (id.length === 0 || id.length > 32 || !isObj(b) || !isInt(b.tier, 1, 3) || !isNum(b.ts)) continue;
    out[id] = { tier: b.tier as 1 | 2 | 3, ts: b.ts };
  }
  return out;
}

/** Trick-Karten (v9 J): höchstens 200 Einträge, Zeitpunkt endlich. */
export function normalizeCards(v: unknown): Settings['cards'] {
  const out: Settings['cards'] = {};
  if (!isObj(v)) return out;
  for (const [id, ts] of Object.entries(v).slice(0, 200)) {
    if (id.length === 0 || id.length > 48 || !isNum(ts)) continue;
    out[id] = ts;
  }
  return out;
}

/* ---------- v10: Motivation (docs/PLAN-v10-motivation.md) ---------- */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const XP_MAX = 1_000_000_000;
const okId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 48;

/** XP-Konto: ganze Zahlen 0 … 10⁹, sonst 0. */
export function normalizeXp(v: unknown): Settings['xp'] {
  const o = isObj(v) ? v : {};
  const n = (x: unknown): number => (isInt(x, 0, XP_MAX) ? x : 0);
  return { earned: n(o.earned), seen: n(o.seen), bonus: n(o.bonus), spent: n(o.spent) };
}

/** Artikel-ID → Zeitpunkt (höchstens 100). */
export function normalizePurchases(v: unknown): Settings['purchases'] {
  const out: Settings['purchases'] = {};
  if (!isObj(v)) return out;
  for (const [id, ts] of Object.entries(v).slice(0, 100)) if (okId(id) && isNum(ts)) out[id] = ts;
  return out;
}

/** Endliche Zeitpunkte, aufsteigend, höchstens die letzten 50. */
export function normalizeStamps(v: unknown): number[] {
  return Array.isArray(v) ? v.filter(isNum).sort((a, b) => a - b).slice(-50) : [];
}

/** Tage (YYYY-MM-DD), eindeutig, aufsteigend, höchstens die letzten 60. */
export function normalizeDays(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((d): d is string => typeof d === 'string' && DAY_RE.test(d)))].sort().slice(-60) : [];
}

/** Quest-Protokoll: höchstens die letzten 14 Tage, je höchstens 5 IDs. */
export function normalizeQuestLog(v: unknown): Settings['questLog'] {
  const out: Settings['questLog'] = {};
  if (!isObj(v)) return out;
  const ids = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter(okId))].slice(0, 5) : []);
  for (const day of Object.keys(v).filter((k) => DAY_RE.test(k)).sort().slice(-14)) {
    const e = v[day];
    if (isObj(e)) out[day] = { picks: ids(e.picks), done: ids(e.done) };
  }
  return out;
}

/** Wochentruhen: Montag → Stufe 1–3, höchstens die letzten 12 Wochen. */
export function normalizeChests(v: unknown): Settings['chests'] {
  const out: Settings['chests'] = {};
  if (!isObj(v)) return out;
  for (const week of Object.keys(v).filter((k) => DAY_RE.test(k)).sort().slice(-12)) {
    const tier = v[week];
    if (isInt(tier, 1, 3)) out[week] = tier;
  }
  return out;
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
    keypadSide: KEYPAD_SIDES.find((x) => x === s.keypadSide) ?? DEFAULT_SETTINGS.keypadSide,
    breathe: typeof s.breathe === 'boolean' ? s.breathe : DEFAULT_SETTINGS.breathe,
    confetti: typeof s.confetti === 'boolean' ? s.confetti : DEFAULT_SETTINGS.confetti,
    onboardingDone: s.onboardingDone === true,
    placement: normalizePlacement(s.placement),
    // v9 B: ganze Zahl 1–10
    dailyGoalRounds: typeof s.dailyGoalRounds === 'number' && Number.isInteger(s.dailyGoalRounds) && s.dailyGoalRounds >= 1 && s.dailyGoalRounds <= 10
      ? s.dailyGoalRounds : DEFAULT_SETTINGS.dailyGoalRounds,
    autoAdvance: typeof s.autoAdvance === 'boolean' ? s.autoAdvance : DEFAULT_SETTINGS.autoAdvance, // v9 A
    duelName: typeof s.duelName === 'string' ? Array.from(s.duelName.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').trim()).slice(0, 24).join('') : '', // v9 I: ≤ 24 Zeichen, ohne Steuerzeichen
    league: normalizeLeague(s.league), badges: normalizeBadges(s.badges), cards: normalizeCards(s.cards), // v9 J
    // v10
    xp: normalizeXp(s.xp), purchases: normalizePurchases(s.purchases), frame: okId(s.frame) ? s.frame : '',
    freezesBought: normalizeStamps(s.freezesBought), streakRepairs: normalizeDays(s.streakRepairs),
    comebackDays: normalizeDays(s.comebackDays), questLog: normalizeQuestLog(s.questLog), chests: normalizeChests(s.chests),
    lpSeen: isInt(s.lpSeen, -1, 1000) ? s.lpSeen : -1,
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
