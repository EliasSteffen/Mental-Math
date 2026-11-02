// Fehler-Wiederholung über Tage (Leitner-Boxen pro Aufgabentyp): Logik in packages/learning-engine, hier nur weitergereicht.
export { recordResult, dueReviews, nextDue } from '../vendor/learning.ts';
export type { ReviewResult, DueReview } from '../vendor/learning.ts';
import { DEFAULT_CONFIG } from '../vendor/learning.ts';

/** Intervalle der Boxen in Tagen */
export const INTERVAL_DAYS: readonly number[] = DEFAULT_CONFIG.reviewIntervalsDays;
