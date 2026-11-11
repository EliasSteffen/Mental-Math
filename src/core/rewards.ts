// Belohnungen erkennen (v9 J): Liga, Orden und Karten aus der Historie berechnen, mit dem Gespeicherten vergleichen. DOM-frei.
import type { Attempt, DailyResult, Level, Session, SubtypeId } from '../types.ts';
import { badgeTiers, effectiveTiers, mergeBadges, type BadgeId, type BadgeInput, type BadgeTier, type StoredBadges } from './badges.ts';
import { CARD_IDS, mergeCards, unlockedCards } from './cards.ts';
import { advanceLeague, leagueRating, type LeagueState } from './league.ts';
import type { IconName } from '../ui/charts.ts';

/** Gespeicherter Stand (die drei synchronisierten Einstellungen) */
export interface RewardStore {
  league: LeagueState | null;
  badges: StoredBadges;
  cards: Record<string, number>;
}

/** Historie, aus der alles berechnet wird */
export interface RewardHistory {
  attempts: readonly Attempt[];
  sessions: readonly Session[];
  dailyResults: Readonly<Record<string, DailyResult>>;
  streakBest: number;
  chainBest: Readonly<Partial<Record<Level, number>>>;
  parallelBest: number;
  placement: boolean;
}

export interface RewardEvents {
  promoted?: { from: number; to: number };
  demoted?: { from: number; to: number };
  badges: Array<{ id: BadgeId; tier: 1 | 2 | 3 }>;
  cards: SubtypeId[];
  /** v10: Zeilen der Erweiterungen (Quests, Comeback, Reparatur, LP – features/rewards.ts → addRewardHook) */
  extra?: ExtraRewardLine[];
}

/** v10: Ergebniszeile einer Erweiterung. order sortiert innerhalb der Erweiterungen (klein zuerst). */
export interface ExtraRewardLine {
  id: string;
  order: number;
  icon: IconName;
  label: string;
  sub?: string;
  href?: string;
  tone: 'good' | 'quiet';
}

export interface RewardResult {
  /** neuer Stand zum Speichern */
  store: RewardStore;
  /** hat sich gegenüber dem gespeicherten Stand etwas geändert? */
  changed: boolean;
  events: RewardEvents;
  rating: number;
  /** erste Auswertung überhaupt (Einstellung `league` war noch leer) */
  first: boolean;
}

export const emptyEvents = (): RewardEvents => ({ badges: [], cards: [] });

/** Anzahl der freigeschalteten Karten, die zum Katalog gehören. */
export function cardCountOf(cards: Readonly<Record<string, number>>): number {
  return CARD_IDS.filter((id) => Object.hasOwn(cards, id)).length;
}

/**
 * Liga (mit Hysterese), Orden und Karten neu berechnen. Beim ersten Mal (`store.league === null`) wird alles Verdiente
 * still übernommen: `events` bleibt leer (Bestandsnutzer sollen nicht mit Meldungen überschüttet werden).
 */
export function evaluateRewards(history: RewardHistory, store: RewardStore, now: number): RewardResult {
  const first = store.league === null;
  const rating = leagueRating(history.attempts);
  const league = advanceLeague(store.league, rating, now);

  const cardMerge = mergeCards(store.cards, unlockedCards(history.attempts), now);
  const input: BadgeInput = {
    attempts: history.attempts, sessions: history.sessions, dailyResults: history.dailyResults,
    streakBest: history.streakBest, chainBest: history.chainBest, parallelBest: history.parallelBest,
    leaguePeak: league.state.peak, cardCount: cardCountOf(cardMerge.cards), placement: history.placement,
  };
  const badgeMerge = mergeBadges(store.badges, badgeTiers(input), now);

  const events: RewardEvents = emptyEvents();
  if (!first) {
    if (league.from !== null && league.to > league.from) events.promoted = { from: league.from, to: league.to };
    else if (league.from !== null && league.to < league.from) events.demoted = { from: league.from, to: league.to };
    events.badges = badgeMerge.fresh;
    events.cards = cardMerge.fresh;
  }
  const changed = league.changed || badgeMerge.fresh.length > 0 || cardMerge.fresh.length > 0;
  return {
    store: { league: league.state, badges: badgeMerge.badges, cards: cardMerge.cards },
    changed, events, rating, first,
  };
}

/** Wirksame Ordensstufen für die Anzeige (gespeichert ∪ berechnet), ohne zu speichern. */
export function currentBadgeTiers(history: RewardHistory, store: RewardStore, peak: number, cardCount: number): Record<BadgeId, BadgeTier> {
  return effectiveTiers(store.badges, badgeTiers({
    attempts: history.attempts, sessions: history.sessions, dailyResults: history.dailyResults,
    streakBest: history.streakBest, chainBest: history.chainBest, parallelBest: history.parallelBest,
    leaguePeak: peak, cardCount, placement: history.placement,
  }));
}

/* ---------- Ergebniszeilen ---------- */

export type RewardLine =
  | { kind: 'league'; from: number; to: number; up: boolean }
  | { kind: 'badge'; id: BadgeId; tier: 1 | 2 | 3 }
  | { kind: 'card'; id: SubtypeId }
  | { kind: 'extra'; line: ExtraRewardLine };

export const MAX_REWARD_LINES = 4;

/** Alle Zeilen in Anzeigereihenfolge: Aufstieg, Erweiterungen (v10), Orden, Karten, Abstieg (dezent, zuletzt). */
export function rewardLines(events: RewardEvents): RewardLine[] {
  const lines: RewardLine[] = [];
  if (events.promoted) lines.push({ kind: 'league', from: events.promoted.from, to: events.promoted.to, up: true });
  for (const line of [...(events.extra ?? [])].sort((a, b) => a.order - b.order)) lines.push({ kind: 'extra', line });
  for (const b of events.badges) lines.push({ kind: 'badge', id: b.id, tier: b.tier });
  for (const id of events.cards) lines.push({ kind: 'card', id });
  if (events.demoted) lines.push({ kind: 'league', from: events.demoted.from, to: events.demoted.to, up: false });
  return lines;
}

/** Höchstens `max` Zeilen; der Rest wird als Zahl gemeldet („+2 weitere“). */
export function splitRewardLines(events: RewardEvents, max = MAX_REWARD_LINES): { shown: RewardLine[]; more: number } {
  const all = rewardLines(events);
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) };
}

export const hasRewards = (events: RewardEvents): boolean => rewardLines(events).length > 0;
