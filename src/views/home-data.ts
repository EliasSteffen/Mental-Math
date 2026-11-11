// Reine Helfer für „Heute“ (ohne DOM, testbar): Begrüßung, Datum, Median-Zeit (E9), Ziel und Dauer der Empfehlung (E10).
import { CATEGORIES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import type { Attempt, CategoryId, DifficultySetting, Level, Recommendation, SubtypeId } from '../types.ts';
import { generate } from '../core/generators/index.ts'; // v9 H
import { mulberry32, seedFromString } from '../core/daily.ts'; // v9 H

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

/* ---------- v9 H: Beispielaufgabe und Tagesziel-Punkte der Empfehlung ---------- */

export type HeroExample =
  /** Eine Aufgabe des empfohlenen Typs (Fragetext; bei Exhibits ohne Grafik) */
  | { kind: 'task'; prompt: string }
  /** Typen der Runde (Wiederholung, gemischt, Kategorie) */
  | { kind: 'names'; names: string[] };

/** Höchstzahl der Punkte; größere Ziele werden abgeschnitten. */
export const MAX_GOAL_DOTS = 8;

/** Tagesstabile Auswahl von höchstens n Einträgen (Seed aus Tag + Schlüssel). */
function dayPick<T>(xs: readonly T[], n: number, seed: string): T[] {
  const rng = mulberry32(seedFromString(seed));
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a.slice(0, n);
}

/**
 * Beispiel für die Empfehlungskarte. Subtyp → Aufgabe mit Seed `dayKey + subtype` (springt beim Rendern nicht);
 * sonst 2–3 Typnamen: fällige Wiederholungen, eine Kategorie oder ein Querschnitt der aktiven Kategorien.
 * Null, wenn nichts Sinnvolles zu zeigen ist.
 */
export function heroExample(rec: Recommendation, o: {
  dayKey: string;
  level?: Level;
  reviewSubtypes?: readonly SubtypeId[];
  enabledCategories?: CategoryId[] | null;
}): HeroExample | null {
  const sub = rec.subtype ? SUBTYPES[rec.subtype] : undefined;
  if (sub) {
    try {
      const task = generate(sub.id, mulberry32(seedFromString(o.dayKey + sub.id)), { level: o.level ?? 2 });
      return task.prompt ? { kind: 'task', prompt: task.prompt } : null;
    } catch {
      return null;
    }
  }
  const active = activeCategories(o.enabledCategories ?? null).map((c) => c.id as string);
  let pool: SubtypeId[];
  if (rec.kind === 'review') {
    pool = [...new Set(o.reviewSubtypes ?? [])].filter((id) => SUBTYPES[id] && active.includes(SUBTYPES[id].category));
  } else if (CATEGORIES.some((c) => c.id === rec.mode)) {
    pool = Object.values(SUBTYPES).filter((s) => s.category === rec.mode).map((s) => s.id);
  } else {
    pool = Object.values(SUBTYPES).filter((s) => active.includes(s.category)).map((s) => s.id);
  }
  const names = dayPick(pool, 3, `${o.dayKey}|${rec.mode}`).map((id) => SUBTYPES[id]?.name ?? '').filter(Boolean);
  return names.length >= 2 ? { kind: 'names', names } : null;
}

/** Tagesziel als Punkte: erreichte Runden gefüllt, Rest offen; Ziel auf MAX_GOAL_DOTS begrenzt. */
export function goalDots(done: number, goal: number): { filled: number; total: number } {
  const total = Math.min(MAX_GOAL_DOTS, Math.max(1, Math.round(goal) || 1));
  return { filled: Math.min(total, Math.max(0, Math.round(done) || 0)), total };
}

/* ---------- v11 H: Auswahl der Empfehlung, Kacheln und Sheet-Zeilen (rein, testbar) ---------- */

export interface PlacementState {
  /** Einstufungstest bereits gemacht (settings.placement gesetzt) */
  placement: boolean;
  difficulty: DifficultySetting;
  attempts: number;
}

/**
 * Was der Hero zeigt: neue Nutzer (noch kein Test, Schwierigkeit Auto, 0 Versuche) bekommen den Einstufungstest
 * als Empfehlung, alle anderen die normale Empfehlung.
 */
export function heroKind(s: PlacementState): 'placement' | 'recommendation' {
  return !s.placement && s.difficulty === 'auto' && s.attempts === 0 ? 'placement' : 'recommendation';
}

/** Eintrag „Einstufungstest“ oben im Sheet „Weitere Modi“: nur solange kein Test gemacht ist und er nicht Hero ist. */
export function showsPlacementRow(s: PlacementState): boolean {
  return !s.placement && heroKind(s) === 'recommendation';
}

/** Kacheln auf dem Telefon in fester Reihenfolge (drei Reihen à zwei). */
export type PhoneTile = 'daily' | 'quests' | 'case' | 'mixed' | 'categories' | 'modes';
export const PHONE_TILES: readonly PhoneTile[] = ['daily', 'quests', 'case', 'mixed', 'categories', 'modes'];

/** Zeilen im Sheet „Weitere Modi“ (Mini-Case gehört nicht hierher, sondern in eine eigene Kachel). */
export type ModeRow = 'placement' | 'chain' | 'parallel' | 'estimate' | 'custom';

export function modeRows(o: { placementRow: boolean }): ModeRow[] {
  const rest: ModeRow[] = ['chain', 'parallel', 'estimate', 'custom'];
  return o.placementRow ? ['placement', ...rest] : rest;
}
