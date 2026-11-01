// Bitte um eine App-Store-Bewertung ohne DOM (testbar): nur nach einer guten Runde, bei regelmäßiger Nutzung und selten.
// Kein Vorab-Dialog („Gefällt dir die App?“) und keine Belohnung – Apple verbietet Review-Gating.
// features/app-store.ts verdrahtet sie mit dem Ergebnisbildschirm und dem Systemdialog (nur iOS).
import { dayKey } from '../core/progress.ts';

/** Mindestens so viele abgeschlossene Runden … */
export const REVIEW_MIN_SESSIONS = 5;
/** … an so vielen verschiedenen (lokalen) Tagen. */
export const REVIEW_MIN_DAYS = 3;
/** Trefferquote einer guten Runde (sonst nur mit neuem Bestwert). */
export const REVIEW_MIN_ACCURACY = 0.8;
/** Pause nach einer Bitte (ms). */
export const REVIEW_PAUSE_MS = 60 * 86_400_000;
/** Erst das Ergebnis zeigen, dann bitten (ms). */
export const REVIEW_DELAY_MS = 1500;

export interface ReviewRound { correct: number; n: number; newBest: boolean }

export interface ReviewInput {
  sessions: ReadonlyArray<{ ts: number; n: number }>;
  now: number;
  round: ReviewRound;
  /** Version bzw. Zeitpunkt der letzten Bitte ('' / 0: noch nie) */
  askedVersion: string;
  askedAt: number;
  /** laufende App-Version */
  version: string;
}

/** Anzahl verschiedener lokaler Kalendertage (Mitternacht trennt, nicht 24 h). */
export function distinctDays(timestamps: readonly number[]): number {
  return new Set(timestamps.map((ts) => dayKey(ts))).size;
}

/** Bitten: ≥ 5 Runden an ≥ 3 Tagen, gute Runde (≥ 80 % oder Bestwert), in dieser Version noch nicht, letzte Bitte ≥ 60 Tage her. */
export function shouldAskForReview(i: ReviewInput): boolean {
  const { round } = i;
  const good = round.newBest || (round.n > 0 && round.correct / round.n >= REVIEW_MIN_ACCURACY);
  if (!good || i.askedVersion === i.version || i.now - i.askedAt < REVIEW_PAUSE_MS) return false;
  const done = i.sessions.filter((s) => s.n > 0 && Number.isFinite(s.ts));
  return done.length >= REVIEW_MIN_SESSIONS && distinctDays(done.map((s) => s.ts)) >= REVIEW_MIN_DAYS;
}
