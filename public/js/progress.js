// Fortschritt: Serie, Heatmap, Verlauf, XP, Empfehlung (reine Funktionen, Datum lokal)
import { SUBTYPES, CATEGORIES } from './generators.js';
import { weaknesses } from './scoring.js';
import { dueReviews } from './review.js';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayKey(ts = Date.now()) {
  return keyOf(new Date(ts));
}

// Lokaler Tag um 12 Uhr (DST-sicher), n Tage verschoben
const dayAt = (ts, offset = 0) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12);
};
const keyFromParts = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export function streakInfo(activity, goalMs, now = Date.now()) {
  const act = activity || {};
  const goal = Math.max(1, goalMs || 1);
  const ok = (k) => (act[k] || 0) >= goal;
  const todayKey = dayKey(now);
  const todayMs = act[todayKey] || 0;
  let current = 0;
  let off = ok(todayKey) ? 0 : -1;
  while (ok(keyOf(dayAt(now, off)))) { current++; off--; }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const k of Object.keys(act).filter(ok).sort()) {
    const t = keyFromParts(k);
    run = prev && keyOf(dayAt(prev.getTime(), 1)) === k ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  best = Math.max(best, current);
  return { current, best, todayMs, goalMs, todayDone: todayMs >= goal };
}

function hmLevel(ms, goal) {
  if (!(ms > 0)) return 0;
  const r = ms / Math.max(1, goal);
  return r < 0.5 ? 1 : r < 1 ? 2 : r < 2 ? 3 : 4;
}

export function heatmap(activity, goalMs, now = Date.now(), weeks = 16) {
  const act = activity || {};
  const today = dayAt(now);
  const mondayOffset = -((today.getDay() + 6) % 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = dayAt(now, mondayOffset - (weeks - 1) * 7 + i);
    const date = keyOf(d);
    const ms = act[date] || 0;
    cells.push({ date, ms, level: hmLevel(ms, goalMs) });
  }
  return cells;
}

export function dailySeries(attempts, { category = null, days = 14, now = Date.now() } = {}) {
  const byDay = {};
  for (const a of attempts || []) {
    if (category && a.category !== category) continue;
    (byDay[dayKey(a.ts)] ||= []).push(a);
  }
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = keyOf(dayAt(now, -i));
    const list = byDay[date] || [];
    const n = list.length;
    const timedRight = list.filter((a) => a.correct && !a.untimed && a.timeMs > 0);
    out.push({
      date,
      n,
      accuracy: n ? list.reduce((s, a) => s + (a.correct ? (a.assisted ? 0.5 : 1) : 0), 0) / n : null,
      speed: timedRight.length
        ? timedRight.reduce((s, a) => s + Math.min(1, a.targetMs / a.timeMs), 0) / timedRight.length
        : null,
    });
  }
  return out;
}

export function xpInfo(attempts) {
  const xp = (attempts || []).reduce((s, a) => s + (a.points || 0), 0);
  let level = 1;
  let rest = xp;
  while (rest >= 500 * level) { rest -= 500 * level; level++; }
  return { xp, level, into: rest, needed: 500 * level };
}

export function recommendation(attempts, reviews, now = Date.now()) {
  const due = dueReviews(reviews, now);
  if (due.length) {
    return {
      kind: 'review', mode: 'review', subtype: null,
      title: 'Fehler-Wiederholung',
      reason: `${due.length} ${due.length === 1 ? 'Wiederholung' : 'Wiederholungen'} fällig`,
    };
  }
  const weak = weaknesses(attempts, 1)[0];
  if (weak) {
    return {
      kind: 'weak', mode: weak.subtype, subtype: weak.subtype,
      title: weak.name,
      reason: `${Math.round(weak.accuracy * 100)} % richtig in den letzten Versuchen`,
    };
  }
  const seen = new Set((attempts || []).map((a) => a.subtype));
  for (const c of CATEGORIES) {
    const s = Object.values(SUBTYPES).find((x) => x.category === c.id && !seen.has(x.id));
    if (s) return { kind: 'new', mode: s.id, subtype: s.id, title: s.name, reason: 'Noch nie geübt' };
  }
  return { kind: 'mixed', mode: 'all', subtype: null, title: 'Gemischtes Training', reason: 'Alles im grünen Bereich – bleib im Rhythmus' };
}
