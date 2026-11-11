// Ligen (v9 J): Wertung aus dem Können über alle Aufgabentypen, Stufen mit Hysterese. DOM-frei.
import type { Attempt } from '../types.ts';
import { SUBTYPES, CATEGORIES } from './catalog.ts';
import { subtypeStats } from './scoring.ts';

export type LeagueId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

export interface LeagueDef {
  id: LeagueId;
  /** Mindestwertung je Stufe I → III (Meister: eine Stufe) */
  mins: readonly number[];
}

/** Abstieg erst so viele LP unter der Schwelle der aktuellen Stufe */
export const DEMOTE_BUFFER = 25;
/** Champion = beste N Meister aller Konten; der Server (Paket K) kann die Zahl erhöhen */
export const CHAMPION_DEFAULT = 10;
export const MAX_RATING = 1000;

export const LEAGUES: readonly LeagueDef[] = [
  { id: 'bronze', mins: [0, 50, 100] },
  { id: 'silver', mins: [150, 200, 250] },
  { id: 'gold', mins: [300, 350, 400] },
  { id: 'platinum', mins: [450, 500, 550] },
  { id: 'diamond', mins: [600, 660, 720] },
  { id: 'master', mins: [780] },
];

/** Mindestwertung je Stufe 0 (Bronze I) … 15 (Meister), aufsteigend */
export const TIER_MINS: readonly number[] = LEAGUES.flatMap((l) => l.mins);
export const MAX_TIER = TIER_MINS.length - 1;
/** Meister (höchste Stufe, ohne Unterstufen) */
export const MASTER_TIER = MAX_TIER;

/** Champion-Status vom Server (Paket K); null/fehlend = nicht Champion bzw. unbekannt */
export interface ChampionInfo { rank: number }

/** Aufgabentypen, die in die Wertung zählen: alle sichtbaren Kategorien, unabhängig von `enabledCategories`. */
export const RANKED_SUBTYPE_IDS: readonly string[] = Object.keys(SUBTYPES).filter(
  (id) => !CATEGORIES.find((c) => c.id === SUBTYPES[id]?.category)?.hidden,
);

/** Ligawertung 0–1000 (ganzzahlig): 10 × Mittelwert der Skill-Werte aller Aufgabentypen, ungeübt = 0. */
export function leagueRating(attempts: readonly Attempt[]): number {
  const stats = subtypeStats(attempts as Attempt[]);
  if (!RANKED_SUBTYPE_IDS.length) return 0;
  const sum = RANKED_SUBTYPE_IDS.reduce((s, id) => s + (stats[id]?.score ?? 0), 0);
  return Math.max(0, Math.min(MAX_RATING, Math.round((10 * sum) / RANKED_SUBTYPE_IDS.length)));
}

const clampTier = (n: number): number => Math.max(0, Math.min(MAX_TIER, Math.floor(n)));

/** Stufe zur Wertung ohne Hysterese: 0 (Bronze I) … 15 (Meister). */
export function tierIndex(rating: number): number {
  const r = Number.isFinite(rating) ? rating : 0;
  let tier = 0;
  for (let i = 0; i < TIER_MINS.length; i++) if (r >= (TIER_MINS[i] ?? 0)) tier = i;
  return tier;
}

/**
 * Neue Stufe mit Hysterese: Aufstieg sofort, Abstieg erst unter Schwelle − DEMOTE_BUFFER.
 * Ohne bisherige Stufe (null) gilt die reine Wertung.
 */
export function nextTier(prevTier: number | null, rating: number): number {
  const raw = tierIndex(rating);
  if (prevTier === null || !Number.isFinite(prevTier)) return raw;
  const prev = clampTier(prevTier);
  if (raw >= prev) return raw;
  if (rating >= (TIER_MINS[prev] ?? 0) - DEMOTE_BUFFER) return prev;
  // Abgestiegen: die höchste Stufe, deren Schwelle (mit Puffer) noch erreicht ist, nie über der bisherigen
  return Math.min(prev, tierIndex(rating + DEMOTE_BUFFER));
}

export interface TierInfo {
  league: LeagueId;
  /** Stufe 1–3 (III ist die höchste); null bei Meister */
  step: 1 | 2 | 3 | null;
  min: number;
  /** Schwelle der nächsten Stufe; null bei Meister */
  next: number | null;
}

export function tierInfo(tier: number): TierInfo {
  const t = clampTier(tier);
  let rest = t;
  for (const l of LEAGUES) {
    if (rest < l.mins.length) {
      return {
        league: l.id,
        step: l.mins.length === 1 ? null : ((rest + 1) as 1 | 2 | 3),
        min: TIER_MINS[t] ?? 0,
        next: TIER_MINS[t + 1] ?? null,
      };
    }
    rest -= l.mins.length;
  }
  return { league: 'master', step: null, min: TIER_MINS[MAX_TIER] ?? 0, next: null };
}

/** Fortschritt zur nächsten Stufe (0–1); bei Meister 1. Im Abstiegspuffer (Wertung unter der Schwelle) 0. */
export function tierProgress(tier: number, rating: number): { into: number; needed: number; fraction: number } {
  const info = tierInfo(tier);
  if (info.next === null) return { into: Math.max(0, rating - info.min), needed: 0, fraction: 1 };
  const needed = info.next - info.min;
  const into = Math.max(0, Math.min(needed, rating - info.min));
  return { into, needed, fraction: needed > 0 ? into / needed : 0 };
}

/** Stufe einer Liga (Stufe 1–3; Meister ignoriert `step`) → Index 0–15. */
export function tierOf(league: LeagueId, step: 1 | 2 | 3 = 1): number {
  let idx = 0;
  for (const l of LEAGUES) {
    if (l.id === league) return idx + (l.mins.length === 1 ? 0 : step - 1);
    idx += l.mins.length;
  }
  return 0;
}

/** Gespeicherter Stand (Einstellung `league`). */
export interface LeagueState { tier: number; peak: number; ts: number }

/** Neuer Stand nach einer Auswertung; `changed` nur bei neuer Stufe oder neuem Peak. */
export function advanceLeague(
  prev: LeagueState | null, rating: number, now: number,
): { state: LeagueState; from: number | null; to: number; changed: boolean } {
  const tier = nextTier(prev ? prev.tier : null, rating);
  const peak = Math.max(prev ? prev.peak : 0, tier);
  const changed = prev === null || prev.tier !== tier || prev.peak !== peak;
  return {
    state: changed ? { tier, peak, ts: now } : (prev as LeagueState),
    from: prev ? prev.tier : null, to: tier, changed,
  };
}
