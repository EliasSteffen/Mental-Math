// Fehler-Wiederholung über Tage: Leitner-Boxen je Aufgabentyp. Ein Fehler legt den Typ in Box 0; in Wiederholungsrunden
// rückt er bei richtiger Antwort eine Box weiter (längeres Intervall), bei falscher zurück in Box 0. Nach der letzten
// Box gilt er als gemeistert und fällt heraus.
import type { DueReview, ReviewResult, Reviews } from './types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from './config.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Intervall einer Box in ms (unbekannte Box: das erste Intervall). */
export function intervalMs(box: number, cfg: EngineConfig = DEFAULT_CONFIG): number {
  return (cfg.reviewIntervalsDays[box] ?? cfg.reviewIntervalsDays[0] ?? 1) * DAY_MS;
}

/** Neuer Stand nach einer Antwort; die Eingabe bleibt unverändert. */
export function recordResult(
  reviews: Reviews | null | undefined,
  { subtype, correct, ts = Date.now(), isReview = false }: ReviewResult,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Reviews {
  const out: Reviews = { ...(reviews || {}) };
  const cur = out[subtype];
  const reset = (): void => { out[subtype] = { box: 0, dueAt: ts + intervalMs(0, cfg), lastTs: ts }; };
  if (!isReview || !cur) {
    if (!correct) reset();
    return out;
  }
  if (!correct) {
    reset();
    return out;
  }
  const box = cur.box + 1;
  if (box > cfg.reviewIntervalsDays.length - 1) delete out[subtype];
  else out[subtype] = { box, dueAt: ts + intervalMs(box, cfg), lastTs: ts };
  return out;
}

/** Fällige Wiederholungen, die am längsten fälligen zuerst. */
export function dueReviews(reviews: Reviews | null | undefined, now = Date.now()): DueReview[] {
  return Object.entries(reviews || {})
    .filter(([, r]) => r && r.dueAt <= now)
    .map(([subtype, r]) => ({ subtype, box: r.box, dueAt: r.dueAt }))
    .sort((a, b) => a.dueAt - b.dueAt);
}

/** Nächster Fälligkeitszeitpunkt oder null, wenn nichts ansteht. */
export function nextDue(reviews: Reviews | null | undefined): number | null {
  const ts = Object.values(reviews || {}).map((r) => r.dueAt).filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : null;
}
