// Orden (v9 J): Stufen Bronze/Silber/Gold, alle aus der Historie berechenbar. DOM-frei.
// Gespeichert wird die höchste je erreichte Stufe (mergeBadges) – ein Orden geht nie verloren.
import type { Attempt, DailyResult, Level, Session } from '../types.ts';
import { CATEGORIES, SUBTYPES } from './catalog.ts';
import { CASE_TEMPLATES } from './cases/index.ts';
import { MASTERY_FULL } from './mastery.ts';
import { NO_BEST } from './recap.ts';
import { RANKED_SUBTYPE_IDS } from './league.ts';
import { subtypeStats } from './scoring.ts';

export type BadgeTier = 0 | 1 | 2 | 3;

export type BadgeId =
  | 'streak' | 'perfect' | 'solved' | 'rounds' | 'blitz' | 'daily' | 'dailyPerfect' | 'bests' | 'noHelp' | 'reviews'
  | 'variety' | 'categories' | 'cards' | 'cases' | 'exhibits' | 'estimate' | 'chain' | 'parallel' | 'climber'
  | 'early' | 'night' | 'placement';

export interface BadgeInput {
  attempts: readonly Attempt[];
  sessions: readonly Session[];
  dailyResults: Readonly<Record<string, DailyResult>>;
  /** beste Serie in Tagen (habitInfo(...).best) */
  streakBest: number;
  chainBest: Readonly<Partial<Record<Level, number>>>;
  /** beste Anzahl paralleler Ketten (ParallelStats.bestChains) */
  parallelBest: number;
  /** höchste je erreichte Liga-Stufe 0–15 */
  leaguePeak: number;
  /** freigeschaltete Trick-Karten (gespeichert + neu verdient) */
  cardCount: number;
  placement: boolean;
}

export interface BadgeDef {
  id: BadgeId;
  /** Schwellen je Stufe (Länge 1 = einstufiger Orden); Funktion, weil „alle“ vom Katalog abhängt */
  thresholds(): readonly number[];
  measure(input: BadgeInput): number;
  /** Eigene Stufenlogik statt „Messwert ≥ Schwelle“ */
  tier?(input: BadgeInput): BadgeTier;
  /** Eigener Fortschritt zur nächsten Stufe */
  progress?(input: BadgeInput, tier: BadgeTier): { value: number; nextAt: number | null };
}

const sum = (n: number, a: Attempt): number => n + (a.correct ? 1 : 0);

/** Ziel der Kette: Treffer in Folge je Level, es zählt das beste Level */
export const CHAIN_THRESHOLDS: readonly number[] = [5, 15, 30];
/** Liga-Stufen für „Aufsteiger“: Silber I, Gold I, Diamant I */
export const CLIMBER_THRESHOLDS: readonly number[] = [3, 6, 12];

const caseSessions = (sessions: readonly Session[]): Session[] =>
  sessions.filter((s) => s.mode.startsWith('case:') && s.n > 0);
const perfectCases = (sessions: readonly Session[]): Session[] => caseSessions(sessions).filter((s) => s.correct === s.n);
const distinctCases = (sessions: readonly Session[]): number =>
  new Set(perfectCases(sessions).map((s) => s.mode.slice(5)).filter((id) => CASE_TEMPLATES.some((c) => c.id === id))).size;

const hourCount = (sessions: readonly Session[], pred: (hour: number) => boolean): number =>
  sessions.reduce((n, s) => (Number.isFinite(s.ts) && pred(new Date(s.ts).getHours()) ? n + 1 : n), 0);

/** Zahl neuer Bestzeiten (chronologisch, je Modus wie die Rundenbilanz: ≥ 5 Aufgaben, ≥ 80 %, Ø-Zeit schlägt die bisherige). */
export function countBests(sessions: readonly Session[]): number {
  const best = new Map<string, number>();
  let count = 0;
  const ordered = [...sessions].sort((a, b) => a.ts - b.ts);
  for (const s of ordered) {
    if (NO_BEST.has(s.mode) || s.mode === 'chain' || s.mode === 'parallel' || s.mode.startsWith('case:')) continue;
    if (s.n < 5 || s.correct / s.n < 0.8 || !(s.avgTimeMs > 0)) continue;
    const prev = best.get(s.mode);
    if (prev === undefined || s.avgTimeMs < prev) { best.set(s.mode, s.avgTimeMs); count += 1; }
  }
  return count;
}

/** Runden ab 10 Aufgaben, ≥ 90 % richtig und ohne Hilfe (kein Versuch der Runde mit `assisted`). */
function noHelpRounds(input: BadgeInput): number {
  const helped = new Set<string>();
  for (const a of input.attempts) if (a.assisted === true) helped.add(a.sessionId);
  return input.sessions.filter((s) => s.n >= 10 && s.correct / s.n >= 0.9 && !helped.has(s.id)).length;
}

/** Kategorien (sichtbar), in denen jeder Aufgabentyp „sicher“ ist. */
export function completeCategories(attempts: readonly Attempt[]): number {
  const stats = subtypeStats(attempts as Attempt[]);
  const visible = CATEGORIES.filter((c) => !c.hidden);
  return visible.filter((c) => {
    const ids = RANKED_SUBTYPE_IDS.filter((id) => SUBTYPES[id]?.category === c.id);
    return ids.length > 0 && ids.every((id) => (stats[id]?.score ?? 0) >= MASTERY_FULL);
  }).length;
}

const categoryCount = (): number => CATEGORIES.filter((c) => !c.hidden && RANKED_SUBTYPE_IDS.some((id) => SUBTYPES[id]?.category === c.id)).length;

export const BADGES: readonly BadgeDef[] = [
  { id: 'streak', thresholds: () => [7, 30, 100], measure: (i) => i.streakBest },
  {
    id: 'perfect', thresholds: () => [1, 10, 50],
    measure: (i) => i.sessions.filter((s) => s.n >= 5 && s.correct === s.n).length,
  },
  { id: 'solved', thresholds: () => [100, 1000, 5000], measure: (i) => i.attempts.reduce(sum, 0) },
  { id: 'rounds', thresholds: () => [10, 100, 500], measure: (i) => i.sessions.length },
  {
    id: 'blitz', thresholds: () => [25, 250, 1000],
    measure: (i) => i.attempts.filter((a) => a.correct && a.assisted !== true && a.untimed !== true && a.targetMs > 0 && a.timeMs <= a.targetMs / 3).length,
  },
  { id: 'daily', thresholds: () => [7, 30, 100], measure: (i) => Object.keys(i.dailyResults).length },
  {
    id: 'dailyPerfect', thresholds: () => [1, 5, 20],
    measure: (i) => Object.values(i.dailyResults).filter((d) => d && d.n > 0 && d.correct === d.n).length,
  },
  { id: 'bests', thresholds: () => [1, 10, 50], measure: (i) => countBests(i.sessions) },
  { id: 'noHelp', thresholds: () => [1, 10, 50], measure: noHelpRounds },
  { id: 'reviews', thresholds: () => [10, 100, 500], measure: (i) => i.attempts.filter((a) => a.isReview === true && a.correct).length },
  {
    id: 'variety', thresholds: () => [10, 25, RANKED_SUBTYPE_IDS.length],
    measure: (i) => new Set(i.attempts.map((a) => a.subtype).filter((id) => RANKED_SUBTYPE_IDS.includes(id))).size,
  },
  { id: 'categories', thresholds: () => [1, 5, categoryCount()], measure: (i) => completeCategories(i.attempts) },
  { id: 'cards', thresholds: () => [10, 25, RANKED_SUBTYPE_IDS.length], measure: (i) => i.cardCount },
  {
    // Bronze: ein fehlerfreier Case · Silber: jede Vorlage einmal fehlerfrei · Gold: 50 fehlerfreie Cases
    id: 'cases', thresholds: () => [1, CASE_TEMPLATES.length, 50],
    measure: (i) => perfectCases(i.sessions).length,
    tier: (i) => {
      const total = perfectCases(i.sessions).length;
      if (total >= 50) return 3;
      if (distinctCases(i.sessions) >= CASE_TEMPLATES.length) return 2;
      return total >= 1 ? 1 : 0;
    },
    progress: (i, tier) => {
      const total = perfectCases(i.sessions).length;
      if (tier === 0) return { value: total, nextAt: 1 };
      if (tier === 1) return { value: distinctCases(i.sessions), nextAt: CASE_TEMPLATES.length };
      if (tier === 2) return { value: total, nextAt: 50 };
      return { value: total, nextAt: null };
    },
  },
  { id: 'exhibits', thresholds: () => [10, 100, 500], measure: (i) => i.attempts.filter((a) => a.category === 'exhibit' && a.correct).length },
  {
    id: 'estimate', thresholds: () => [10, 100, 500],
    measure: (i) => i.attempts.filter((a) => a.correct && (a.category === 'est' || a.estimate === true)).length,
  },
  {
    id: 'chain', thresholds: () => CHAIN_THRESHOLDS,
    measure: (i) => Math.max(0, ...Object.values(i.chainBest).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))),
  },
  { id: 'parallel', thresholds: () => [2, 3, 4], measure: (i) => i.parallelBest },
  { id: 'climber', thresholds: () => CLIMBER_THRESHOLDS, measure: (i) => i.leaguePeak },
  { id: 'early', thresholds: () => [1, 10, 50], measure: (i) => hourCount(i.sessions, (h) => h < 7) },
  { id: 'night', thresholds: () => [1, 10, 50], measure: (i) => hourCount(i.sessions, (h) => h >= 22) },
  { id: 'placement', thresholds: () => [1], measure: (i) => (i.placement ? 1 : 0) },
];

export const BADGE_IDS: readonly BadgeId[] = BADGES.map((b) => b.id);

const DEF = new Map<string, BadgeDef>(BADGES.map((b) => [b.id, b]));
export const badgeDef = (id: string): BadgeDef | undefined => DEF.get(id);

/** Höchste Stufe 0–3 (einstufige Orden: 0 oder 1). */
function tierOfDef(def: BadgeDef, input: BadgeInput): BadgeTier {
  if (def.tier) return def.tier(input);
  const value = def.measure(input);
  let tier = 0;
  def.thresholds().forEach((min, i) => { if (value >= min) tier = i + 1; });
  return tier as BadgeTier;
}

/** Berechnete Stufe je Orden (ohne die gespeicherten). */
export function badgeTiers(input: BadgeInput): Record<BadgeId, BadgeTier> {
  const out = {} as Record<BadgeId, BadgeTier>;
  for (const def of BADGES) out[def.id] = tierOfDef(def, input);
  return out;
}

/** Stufen, die der Orden insgesamt hat (1 oder 3). */
export function badgeMaxTier(id: BadgeId): number {
  return badgeDef(id)?.thresholds().length ?? 3;
}

/** Stufe, Messwert und Schwelle der nächsten Stufe (null = höchste Stufe erreicht). */
export function badgeProgress(id: BadgeId, input: BadgeInput): { tier: BadgeTier; value: number; nextAt: number | null } {
  const def = badgeDef(id);
  if (!def) return { tier: 0, value: 0, nextAt: null };
  const tier = tierOfDef(def, input);
  if (def.progress) return { tier, ...def.progress(input, tier) };
  const th = def.thresholds();
  return { tier, value: def.measure(input), nextAt: th[tier] ?? null };
}

export type StoredBadges = Record<string, { tier: 1 | 2 | 3; ts: number }>;

/** Gespeicherte Orden mit den berechneten Stufen zusammenführen: Stufe = max(gespeichert, berechnet). `fresh` = neu erreichte Stufen. */
export function mergeBadges(
  stored: Readonly<StoredBadges>, computed: Readonly<Record<BadgeId, BadgeTier>>, now: number,
): { badges: StoredBadges; fresh: Array<{ id: BadgeId; tier: 1 | 2 | 3 }> } {
  const badges: StoredBadges = { ...stored };
  const fresh: Array<{ id: BadgeId; tier: 1 | 2 | 3 }> = [];
  for (const id of BADGE_IDS) {
    const have = stored[id]?.tier ?? 0;
    const calc = computed[id] ?? 0;
    if (calc > have) {
      badges[id] = { tier: calc as 1 | 2 | 3, ts: now };
      fresh.push({ id, tier: calc as 1 | 2 | 3 });
    }
  }
  return { badges, fresh };
}

/** Wirksame Stufe je Orden: max(gespeichert, berechnet). */
export function effectiveTiers(stored: Readonly<StoredBadges>, computed: Readonly<Record<BadgeId, BadgeTier>>): Record<BadgeId, BadgeTier> {
  const out = {} as Record<BadgeId, BadgeTier>;
  for (const id of BADGE_IDS) out[id] = Math.max(stored[id]?.tier ?? 0, computed[id] ?? 0) as BadgeTier;
  return out;
}
