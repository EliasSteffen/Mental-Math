// Aktueller Lernstand für die Erinnerungen aus dem Speicher – für Web Push (meldet ihn) und die iOS-App (plant damit).
import type { ReminderState } from '../core/reminders.ts';
import { buildReminderState } from '../core/reminder-state.ts';
import { getActivity, getAttempts, getReviews, getSettings } from '../data/storage.ts';

export function currentReminderState(now = Date.now()): ReminderState {
  const s = getSettings();
  return buildReminderState({
    activity: getActivity(), goalMin: s.dailyGoalMin, reviews: getReviews(), attempts: getAttempts(),
    enabledCategories: s.enabledCategories,
  }, now);
}
