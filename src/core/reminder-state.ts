// Lernstand für Erinnerungen aus den lokalen Daten (DOM-frei): Web Push meldet ihn dem Server, die iOS-App plant damit lokal.
import type { ReminderState } from './reminders.ts';
import { dayKey, streakInfo } from './progress.ts';
import { dueReviews, nextDue } from './review.ts';
import { weaknesses } from './scoring.ts';
import type { Activity, Attempt, CategoryId, Reviews } from '../types.ts';

export interface StateInput {
  activity: Activity;
  goalMin: number;
  reviews: Reviews;
  attempts: Attempt[];
  enabledCategories: CategoryId[] | null;
}

/** Was die Erinnerungen brauchen – nicht mehr. */
export function buildReminderState(o: StateInput, now: number = Date.now()): ReminderState {
  const goalMin = Math.max(1, Math.round(o.goalMin));
  const st = streakInfo(o.activity, goalMin * 60_000, now);
  return {
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
}
