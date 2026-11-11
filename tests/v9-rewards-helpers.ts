// Gemeinsame Helfer für die Tests zu Ligen, Orden und Karten (v9 J; kein *.test.ts)
import type { Attempt, Session } from '../src/types.ts';
import { RANKED_SUBTYPE_IDS } from '../src/core/league.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import type { BadgeInput } from '../src/core/badges.ts';

export const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 'x', mode: 'all', category: 'mult', subtype: 'mult.2x1', prompt: 'p', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 3000, targetMs: 6000, weight: 1, points: 100, ...o,
} as Attempt);

export const sess = (o: Partial<Session> = {}): Session => ({ id: 's0', ts: 1000, mode: 'all', n: 10, correct: 9, points: 500, avgTimeMs: 5000, ...o });

/** `n` Versuche eines Typs; `right` davon richtig (schnell → Skill = 100 · (0,7 · right/n + 0,3)) */
export function subtypeAttempts(subtype: string, n: number, right: number, o: Partial<Attempt> = {}): Attempt[] {
  const category = SUBTYPES[subtype]?.category ?? 'mult';
  return Array.from({ length: n }, (_, i) => att({ subtype, category, correct: i < right, ts: 10 + i, ...o }));
}

/** Perfekte Versuche (Skill 100) für die ersten `count` Typen der Wertung */
export function perfectFor(count: number): Attempt[] {
  return RANKED_SUBTYPE_IDS.slice(0, count).flatMap((id) => subtypeAttempts(id, 3, 3));
}

export const emptyInput = (o: Partial<BadgeInput> = {}): BadgeInput => ({
  attempts: [], sessions: [], dailyResults: {}, streakBest: 0, chainBest: {}, parallelBest: 0, leaguePeak: 0, cardCount: 0, placement: false, ...o,
});
