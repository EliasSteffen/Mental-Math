// Nächstes Ziel aus dem Speicher (v10 F): Liga, Orden, Trick-Karten, Level und Tagesziel für Heute und das Ergebnis.
import { nextGoals, type NextGoal } from '../core/next-goal.ts';
import { RANKED_SUBTYPE_IDS } from '../core/league.ts';
import { subtypeStats } from '../core/scoring.ts';
import { cardCountOf } from '../core/rewards.ts';
import { getAttempts } from '../data/storage.ts';
import { currentHabit } from './habit.ts';
import { rewardView } from './rewards.ts';
import { xpView } from './xp.ts';

/** Die nächsten Ziele (höchstens `max`) aus dem aktuellen Stand. */
export function currentGoals(max = 1, now: number = Date.now()): NextGoal[] {
  const attempts = getAttempts();
  const rv = rewardView();
  const habit = currentHabit(now);
  const xp = xpView();
  const stats = subtypeStats(attempts);
  return nextGoals({
    rating: rv.rating,
    tier: rv.tier,
    badges: { input: { ...rv.history, leaguePeak: rv.peak, cardCount: cardCountOf(rv.cards) }, tiers: rv.badges },
    cardSkills: RANKED_SUBTYPE_IDS.map((id) => ({ id, score: stats[id]?.score ?? null })),
    xp: { level: xp.level, into: xp.into, needed: xp.needed },
    habit: { todayRounds: habit.todayRounds, goalRounds: habit.goalRounds },
  }, max);
}
