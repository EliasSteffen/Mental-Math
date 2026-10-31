// Reine Helfer für „Heute“ (ohne DOM, testbar): Begrüßung, Datum, Median-Zeit (E9), Ziel und Dauer der Empfehlung (E10).
import { CATEGORIES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import type { Attempt, CategoryId, Recommendation, SubtypeId } from '../types.ts';

/* ---------- Large Title (E11) ---------- */

export type Daypart = 'morning' | 'day' | 'evening';

/** Tageszeit der Begrüßung: vor 11 Uhr Morgen, vor 17 Uhr Tag, danach Abend. */
export function daypart(hour: number): Daypart {
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

/** Datum über dem Titel, z. B. „Samstag, 31. Oktober“ (de-DE) bzw. „Saturday, October 31“ (en-US). */
export function dateLine(ts: number, loc: string): string {
  return new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts));
}

/* ---------- Zeit-Insight (E9) ---------- */

/** Mindestzahl gemessener Versuche eines Subtyps für den Zeitvergleich. */
export const MIN_TIMED = 3;
/** Fenster der letzten Versuche (wie skill() in core/scoring.ts). */
const WINDOW = 25;

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/**
 * Median der Lösezeit eines Subtyps über die letzten 25 gemessenen Versuche.
 * Ohne Zeitwertung (untimed) und „Weiß nicht“ (skip) – das sind keine Lösezeiten. null unter 3 Versuchen.
 */
export function medianTimeMs(attempts: readonly Attempt[] | null | undefined, subtype: SubtypeId): number | null {
  const times = (attempts ?? [])
    .filter((a) => a.subtype === subtype && !a.untimed && a.errorType !== 'skip' && a.timeMs > 0)
    .slice(-WINDOW)
    .map((a) => a.timeMs);
  return times.length >= MIN_TIMED ? median(times) : null;
}

export interface TimeGap { targetMs: number; medianMs: number }

/**
 * Balken „Hier verlierst du am meisten Zeit“: nur mit Subtyp, ab 3 gemessenen Versuchen und wenn der Median
 * über der Zielzeit des Subtyps liegt (sonst wäre der Satz falsch). Sonst null → die Karte zeigt rec.reason.
 */
export function timeGap(attempts: readonly Attempt[] | null | undefined, subtype: SubtypeId | null): TimeGap | null {
  const s = subtype ? SUBTYPES[subtype] : undefined;
  if (!s) return null;
  const medianMs = medianTimeMs(attempts, s.id);
  return medianMs !== null && medianMs > s.targetMs ? { targetMs: s.targetMs, medianMs } : null;
}

/* ---------- Ziel und Dauer der Empfehlung (E10) ---------- */

/** Pauschale für das Methoden-Intro vor den 5 Aufgaben. */
export const METHOD_MS = 60_000;
/** Aufgaben nach dem Methoden-Intro (?n=5&intro=1). */
export const METHOD_TASKS = 5;

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const targetsOf = (cat: string): number[] =>
  Object.values(SUBTYPES).filter((s) => s.category === cat).map((s) => s.targetMs);

/**
 * Typische Zielzeit je Aufgabe eines Modus: Subtyp direkt, Kategorie als Mittel ihrer Subtypen, sonst
 * (all, weak …) wie der Generator: erst Kategorie, dann Subtyp gleich verteilt über die aktiven Kategorien.
 */
export function typicalTargetMs(mode: string, enabledCategories: CategoryId[] | null = null): number {
  const sub = SUBTYPES[mode];
  if (sub) return sub.targetMs;
  if (CATEGORIES.some((c) => c.id === mode)) return mean(targetsOf(mode));
  return mean(activeCategories(enabledCategories).map((c) => mean(targetsOf(c.id))));
}

/** Gerundete Minuten, mindestens 1. */
export function minutesFor(totalMs: number): number {
  return Math.max(1, Math.round((Number.isFinite(totalMs) ? totalMs : 0) / 60000));
}

export interface HeroPlan {
  /** Ziel der CTA „Jetzt üben“ */
  href: string;
  /** Methode + 5 Aufgaben, Fehler-Wiederholung oder normale Runde */
  kind: 'method' | 'review' | 'round';
  /** Geplante Aufgaben */
  tasks: number;
  /** „ca. N min“: Summe der Zielzeiten (+ Methoden-Pauschale) */
  minutes: number;
}

/**
 * Ziel und Umfang der Empfehlung (Logik wie bisher): Review → #/train/review, Subtyp → Methode + 5 Aufgaben,
 * sonst eine Runde im Modus der Empfehlung mit `sessionLength` Aufgaben.
 */
export function heroPlan(rec: Recommendation, o: {
  sessionLength: number;
  /** Fällige Wiederholungen (Subtypen) – bestimmen die typische Zielzeit der Review-Runde */
  reviewSubtypes?: readonly SubtypeId[];
  enabledCategories?: CategoryId[] | null;
}): HeroPlan {
  const cats = o.enabledCategories ?? null;
  const length = o.sessionLength > 0 ? Math.floor(o.sessionLength) : 10;
  if (rec.kind === 'review') {
    const active = new Set<string>(activeCategories(cats).map((c) => c.id));
    const due = (o.reviewSubtypes ?? []).flatMap((id) => {
      const s = SUBTYPES[id];
      return s && active.has(s.category) ? [s.targetMs] : [];
    });
    const per = due.length ? mean(due) : typicalTargetMs('all', cats);
    return { href: '#/train/review', kind: 'review', tasks: length, minutes: minutesFor(per * length) };
  }
  const sub = rec.subtype ? SUBTYPES[rec.subtype] : undefined;
  if (sub) {
    return {
      href: `#/train/${sub.id}?n=${METHOD_TASKS}&intro=1`, kind: 'method', tasks: METHOD_TASKS,
      minutes: minutesFor(METHOD_MS + sub.targetMs * METHOD_TASKS),
    };
  }
  return {
    href: `#/train/${rec.mode}`, kind: 'round', tasks: length,
    minutes: minutesFor(typicalTargetMs(rec.mode, cats) * length),
  };
}
