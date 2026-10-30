// Fehler-Wiederholung über Tage (Leitner-Boxen pro Aufgabentyp)
export const INTERVAL_DAYS = [1, 2, 4, 7, 14];
const DAY = 24 * 60 * 60 * 1000;

export function recordResult(reviews, { subtype, correct, ts = Date.now(), isReview = false }) {
  const out = { ...(reviews || {}) };
  const cur = out[subtype];
  if (!isReview) {
    if (!correct) out[subtype] = { box: 0, dueAt: ts + INTERVAL_DAYS[0] * DAY, lastTs: ts };
    return out;
  }
  if (!cur) {
    if (!correct) out[subtype] = { box: 0, dueAt: ts + INTERVAL_DAYS[0] * DAY, lastTs: ts };
    return out;
  }
  if (correct) {
    const box = cur.box + 1;
    if (box > INTERVAL_DAYS.length - 1) delete out[subtype];
    else out[subtype] = { box, dueAt: ts + INTERVAL_DAYS[box] * DAY, lastTs: ts };
  } else {
    out[subtype] = { box: 0, dueAt: ts + INTERVAL_DAYS[0] * DAY, lastTs: ts };
  }
  return out;
}

export function dueReviews(reviews, now = Date.now()) {
  return Object.entries(reviews || {})
    .filter(([, r]) => r && r.dueAt <= now)
    .map(([subtype, r]) => ({ subtype, box: r.box, dueAt: r.dueAt }))
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function nextDue(reviews) {
  const ts = Object.values(reviews || {}).map((r) => r.dueAt).filter(Number.isFinite);
  return ts.length ? Math.min(...ts) : null;
}
