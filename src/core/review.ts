// Fehler-Wiederholung über Tage (Leitner-Boxen pro Aufgabentyp)
import type { Reviews, SubtypeId } from '../types.ts';

export const INTERVAL_DAYS: readonly number[] = [1, 2, 4, 7, 14];
const DAY = 24 * 60 * 60 * 1000;
const interval = (box: number): number => (INTERVAL_DAYS[box] ?? 1) * DAY;

export interface ReviewResult { subtype: SubtypeId; correct: boolean; ts?: number; isReview?: boolean }

export function recordResult(
  reviews: Reviews | null | undefined,
  { subtype, correct, ts = Date.now(), isReview = false }: ReviewResult,
): Reviews {
  const out: Reviews = { ...(reviews || {}) };
  const cur = out[subtype];
  if (!isReview) {
    if (!correct) out[subtype] = { box: 0, dueAt: ts + interval(0), lastTs: ts };
    return out;
  }
  if (!cur) {
    if (!correct) out[subtype] = { box: 0, dueAt: ts + interval(0), lastTs: ts };
    return out;
  }
  if (correct) {
    const box = cur.box + 1;
    if (box > INTERVAL_DAYS.length - 1) delete out[subtype];
    else out[subtype] = { box, dueAt: ts + interval(box), lastTs: ts };
  } else {
    out[subtype] = { box: 0, dueAt: ts + interval(0), lastTs: ts };
  }
  return out;
}

export interface DueReview { subtype: SubtypeId; box: number; dueAt: number }

export function dueReviews(reviews: Reviews | null | undefined, now = Date.now()): DueReview[] {
  return Object.entries(reviews || {})
    .filter(([, r]) => r && r.dueAt <= now)
    .map(([subtype, r]) => ({ subtype, box: r.box, dueAt: r.dueAt }))
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function nextDue(reviews: Reviews | null | undefined): number | null {
  const ts = Object.values(reviews || {}).map((r) => r.dueAt).filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : null;
}
