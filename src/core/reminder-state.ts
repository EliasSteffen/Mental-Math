// Lernstand für Erinnerungen aus den lokalen Daten (DOM-frei): Web Push meldet ihn dem Server, die iOS-App plant damit lokal.
import type { ReminderState } from './reminders.ts';
import { dayKey, streakInfo } from './progress.ts';
import { habitInfo } from './habit.ts'; // v9 B
import { dueReviews, nextDue } from './review.ts';
import { weaknesses } from './scoring.ts';
import type { Activity, Attempt, CategoryId, Reviews } from '../types.ts';

export interface StateInput {
  activity: Activity;
  goalMin: number;
  reviews: Reviews;
  attempts: Attempt[];
  enabledCategories: CategoryId[] | null;
  /** v9 B: Runden zählen fürs Tagesziel und die Serie; fehlt `sessions`, gilt die alte Minuten-Logik */
  sessions?: readonly { ts: number }[];
  goalRounds?: number;
  /** v10: zusätzliche Freezes und reparierte Tage */
  boughtFreezes?: readonly number[];
  repairedDays?: readonly string[];
}

/** Was die Erinnerungen brauchen – nicht mehr. */
export function buildReminderState(o: StateInput, now: number = Date.now()): ReminderState {
  const goalMin = Math.max(1, Math.round(o.goalMin));
  const st = streakInfo(o.activity, goalMin * 60_000, now);
  const base: ReminderState = {
    day: dayKey(now),
    todayMin: Math.floor(st.todayMs / 60_000),
    goalMin,
    goalDone: st.todayDone,
    streak: st.current,
    reviewsDue: dueReviews(o.reviews, now).length,
    nextReviewAt: nextDue(o.reviews),
    weak: weaknesses(o.attempts, 3, { enabledCategories: o.enabledCategories }).map((w) => w.subtype),
    at: now,
  };
  if (!o.sessions || o.goalRounds === undefined) return base;
  // Alte Felder bleiben gefüllt (todayMin = echte Minuten, goalMin = Altwert); goalDone/streak folgen den Runden
  const habit = habitInfo({
    sessions: o.sessions, activity: o.activity, goalRounds: o.goalRounds, now,
    boughtFreezes: o.boughtFreezes, repairedDays: o.repairedDays,
  });
  return {
    ...base, goalDone: habit.todayDone, streak: habit.streak,
    todayRounds: habit.todayRounds, goalRounds: habit.goalRounds, kept: habit.kept,
  };
}
