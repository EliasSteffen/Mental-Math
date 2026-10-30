// Fortschritt: Serie, Heatmap, Verlauf, XP, Empfehlung (reine Funktionen, Datum lokal)
import type {
  Activity, ApmPoint, Attempt, CategoryId, DailyPoint, HeatCell, Mode, PersonalBest, Recommendation, Reviews, Session, StreakInfo, XpInfo,
} from '../types.ts';
import { t } from '../i18n/index.ts';
import { SUBTYPES, activeCategories } from './catalog.ts';
import { weaknesses } from './scoring.ts';
import { dueReviews } from './review.ts';

const pad = (n: number): string => String(n).padStart(2, '0');
const keyOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayKey(ts: number = Date.now()): string {
  return keyOf(new Date(ts));
}

// Lokaler Tag um 12 Uhr (DST-sicher), n Tage verschoben
const dayAt = (ts: number, offset = 0): Date => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12);
};
const keyFromParts = (k: string): Date => {
  const [y = 0, m = 1, d = 1] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export function streakInfo(activity: Activity | null | undefined, goalMs: number, now: number = Date.now()): StreakInfo {
  const act = activity || {};
  const goal = Math.max(1, goalMs || 1);
  const ok = (k: string): boolean => (act[k] || 0) >= goal;
  const todayKey = dayKey(now);
  const todayMs = act[todayKey] || 0;
  let current = 0;
  let off = ok(todayKey) ? 0 : -1;
  while (ok(keyOf(dayAt(now, off)))) { current++; off--; }
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of Object.keys(act).filter(ok).sort()) {
    const t = keyFromParts(k);
    run = prev && keyOf(dayAt(prev.getTime(), 1)) === k ? run + 1 : 1;
    prev = t;
    if (run > best) best = run;
  }
  best = Math.max(best, current);
  return { current, best, todayMs, goalMs, todayDone: todayMs >= goal };
}

function hmLevel(ms: number, goal: number): HeatCell['level'] {
  if (!(ms > 0)) return 0;
  const r = ms / Math.max(1, goal);
  return r < 0.5 ? 1 : r < 1 ? 2 : r < 2 ? 3 : 4;
}

export function heatmap(activity: Activity | null | undefined, goalMs: number, now: number = Date.now(), weeks = 16): HeatCell[] {
  const act = activity || {};
  const today = dayAt(now);
  const mondayOffset = -((today.getDay() + 6) % 7);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = dayAt(now, mondayOffset - (weeks - 1) * 7 + i);
    const date = keyOf(d);
    const ms = act[date] || 0;
    cells.push({ date, ms, level: hmLevel(ms, goalMs) });
  }
  return cells;
}

export function dailySeries(
  attempts: Attempt[] | null | undefined,
  { category = null, days = 14, now = Date.now() }: { category?: CategoryId | null; days?: number; now?: number } = {},
): DailyPoint[] {
  const byDay: Record<string, Attempt[]> = {};
  for (const a of attempts || []) {
    if (category && a.category !== category) continue;
    (byDay[dayKey(a.ts)] ||= []).push(a);
  }
  const out: DailyPoint[] = [];
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

export function xpInfo(attempts: Attempt[] | null | undefined): XpInfo {
  const xp = (attempts || []).reduce((s, a) => s + (a.points || 0), 0);
  let level = 1;
  let rest = xp;
  while (rest >= 500 * level) { rest -= 500 * level; level++; }
  return { xp, level, into: rest, needed: 500 * level };
}

export function recommendation(
  attempts: Attempt[] | null | undefined,
  reviews: Reviews | null | undefined,
  now: number = Date.now(),
  { enabledCategories = null }: { enabledCategories?: CategoryId[] | null } = {},
): Recommendation {
  const cats = activeCategories(enabledCategories);
  const active = new Set<string>(cats.map((c) => c.id));
  const due = dueReviews(reviews, now).filter((r) => {
    const s = SUBTYPES[r.subtype];
    return Boolean(s && active.has(s.category));
  });
  if (due.length) {
    return {
      kind: 'review', mode: 'review', subtype: null,
      title: t('core.rec.review.title'),
      reason: t(due.length === 1 ? 'core.rec.review.one' : 'core.rec.review.many', { n: due.length }),
    };
  }
  const weak = weaknesses(attempts, 1, { enabledCategories })[0];
  if (weak) {
    return {
      kind: 'weak', mode: weak.subtype, subtype: weak.subtype,
      title: weak.name,
      reason: t('core.rec.weak.reason', { pct: Math.round(weak.accuracy * 100) }),
    };
  }
  const seen = new Set((attempts || []).map((a) => a.subtype));
  for (const c of cats) {
    const s = Object.values(SUBTYPES).find((x) => x.category === c.id && !seen.has(x.id));
    if (s) return { kind: 'new', mode: s.id, subtype: s.id, title: s.name, reason: t('core.rec.new.reason') };
  }
  return { kind: 'mixed', mode: 'all', subtype: null, title: t('core.rec.mixed.title'), reason: t('core.rec.mixed.reason') };
}

/** Beste Session eines Modus: niedrigste Ø-Zeit je Aufgabe bei ≥ 5 Aufgaben und ≥ 80 % richtig */
export function personalBest(sessions: Session[] | null | undefined, mode: Mode): PersonalBest | null {
  let best: Session | null = null;
  for (const s of sessions || []) {
    if (s.mode !== mode || s.n < 5 || s.correct / s.n < 0.8 || !(s.avgTimeMs > 0)) continue;
    if (!best || s.avgTimeMs < best.avgTimeMs) best = s;
  }
  return best ? { mode, avgMs: best.avgTimeMs, points: best.points, ts: best.ts } : null;
}

/** Fortschritt des Rekord-Geistes 0..1 nach elapsedMs; null ohne Rekord */
export function ghostProgress(best: PersonalBest | null | undefined, elapsedMs: number, sessionLength: number): number | null {
  if (!best || !(best.avgMs > 0) || !(sessionLength > 0)) return null;
  return Math.min(1, Math.max(0, elapsedMs / (best.avgMs * sessionLength)));
}

/** Aufgaben pro aktive Minute je Tag (null bei < 1 aktiver Minute) und Genauigkeit */
export function apmSeries(
  attempts: Attempt[] | null | undefined,
  activity: Activity | null | undefined,
  { days = 30, now = Date.now() }: { days?: number; now?: number } = {},
): ApmPoint[] {
  const byDay: Record<string, Attempt[]> = {};
  for (const a of attempts || []) (byDay[dayKey(a.ts)] ||= []).push(a);
  const out: ApmPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = keyOf(dayAt(now, -i));
    const list = byDay[date] || [];
    const minutes = ((activity || {})[date] || 0) / 60000;
    out.push({
      date,
      perMinute: minutes >= 1 ? list.length / minutes : null,
      accuracy: list.length ? list.reduce((s, a) => s + (a.correct ? (a.assisted ? 0.5 : 1) : 0), 0) / list.length : null,
    });
  }
  return out;
}
