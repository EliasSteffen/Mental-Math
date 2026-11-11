// Spielerkarte im Profil (v9 H): Zahlen zusammenstellen, ohne DOM. Liga, Orden und Karten kommen fertig aus Paket J.
import { BADGES, type BadgeId } from '../core/badges.ts';
import { CARD_IDS } from '../core/cards.ts';
import { habitInfo } from '../core/habit.ts';
import { xpInfo } from '../core/progress.ts';
import { cardCountOf } from '../core/rewards.ts';
import type { Activity, Attempt, DailyResult, Session } from '../types.ts';

export interface ProfileCardData {
  tier: number;
  level: number;
  /** XP im aktuellen Level und bis zum nächsten */
  xpInto: number;
  xpNeeded: number;
  xpFraction: number;
  streak: number;
  streakBest: number;
  freezes: number;
  badges: { earned: number; total: number };
  cards: { earned: number; total: number };
  /** richtig gelöste Aufgaben */
  solved: number;
  rounds: number;
  /** 0–100, null ohne Versuche */
  accuracy: number | null;
  bestDaily: { correct: number; n: number } | null;
}

/** Beste Daily: höchster Anteil richtig, bei Gleichstand mehr Punkte. */
export function bestDaily(results: Readonly<Record<string, DailyResult>> | null | undefined): { correct: number; n: number } | null {
  let best: DailyResult | null = null;
  for (const r of Object.values(results ?? {})) {
    if (!r || !(r.n > 0)) continue;
    if (!best || r.correct / r.n > best.correct / best.n || (r.correct / r.n === best.correct / best.n && r.points > best.points)) best = r;
  }
  return best ? { correct: best.correct, n: best.n } : null;
}

export function profileCardData(o: {
  attempts: readonly Attempt[];
  sessions: readonly Session[];
  activity: Activity;
  dailyResults: Readonly<Record<string, DailyResult>>;
  goalRounds: number;
  /** Liga-Stufe 0–15 (rewardView().tier) */
  tier: number;
  /** wirksame Ordensstufen (rewardView().badges) */
  badges: Readonly<Partial<Record<BadgeId, number>>>;
  /** freigeschaltete Karten (rewardView().cards) */
  cards: Readonly<Record<string, number>>;
  now?: number;
}): ProfileCardData {
  const xp = xpInfo([...o.attempts]);
  const habit = habitInfo({ sessions: o.sessions, activity: o.activity, goalRounds: o.goalRounds, now: o.now });
  const answered = o.attempts.filter((a) => a.errorType !== 'skip');
  const correct = answered.filter((a) => a.correct).length;
  return {
    tier: o.tier,
    level: xp.level, xpInto: xp.into, xpNeeded: xp.needed, xpFraction: xp.needed > 0 ? Math.min(1, xp.into / xp.needed) : 0,
    streak: habit.streak, streakBest: Math.max(habit.best, habit.streak), freezes: habit.freezes,
    badges: { earned: BADGES.filter((b) => (o.badges[b.id] ?? 0) > 0).length, total: BADGES.length },
    cards: { earned: cardCountOf(o.cards), total: CARD_IDS.length },
    solved: correct, rounds: o.sessions.length,
    accuracy: answered.length ? Math.round((correct / answered.length) * 100) : null,
    bestDaily: bestDaily(o.dailyResults),
  };
}
