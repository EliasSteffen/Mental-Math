// Serie und Tagesziel aus dem Speicher (v10): Sessions, Aktivität, Ziel, zusätzliche Freezes und Reparaturen an einer Stelle.
import { habitInfo, type HabitInfo } from '../core/habit.ts';
import { getActivity, getSessions, getSettings } from '../data/storage.ts';

export function currentHabit(now: number = Date.now()): HabitInfo {
  const s = getSettings();
  return habitInfo({
    sessions: getSessions(), activity: getActivity(), goalRounds: s.dailyGoalRounds, now,
    boughtFreezes: s.freezesBought, repairedDays: s.streakRepairs,
  });
}
