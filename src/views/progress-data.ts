// Fortschritt: reine Datenhelfer für die View (DOM-frei, testbar). Datum lokal wie in core/progress.ts.
import type { Activity, Attempt, CategoryId, DailyResult, Weakness } from '../types.ts';
import { dayKey } from '../core/progress.ts';
import { weaknesses } from '../core/scoring.ts';
import { fmt } from '../core/numbers.ts';
import { activeCategories } from '../core/catalog.ts';

// Lokaler Tag um 12 Uhr (DST-sicher), n Tage verschoben
const dayAt = (ts: number, offset = 0): Date => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12);
};

/* ---------- Woche und Zeiträume ---------- */

export interface WeekDay {
  /** Datumsschlüssel YYYY-MM-DD */
  date: string;
  /** Mittag des Tages (für Wochentagsnamen) */
  ts: number;
  /** aktive Minuten, gerundet */
  min: number;
  today: boolean;
  future: boolean;
}

/** Montag bis Sonntag der aktuellen Woche mit aktiven Minuten; Tage nach heute sind `future`. */
export function weekDays(activity: Activity | null | undefined, now: number = Date.now()): WeekDay[] {
  const act = activity || {};
  const mondayOffset = -((dayAt(now).getDay() + 6) % 7);
  const todayKey = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = dayAt(now, mondayOffset + i);
    const date = dayKey(d.getTime());
    return { date, ts: d.getTime(), min: Math.round((act[date] || 0) / 60000), today: date === todayKey, future: date > todayKey };
  });
}

/** Skalen-Obergrenze der Wochenbalken: Ziel × 4/3 (Ziellinie bei 75 %), mindestens der größte Tageswert. */
export function weekScaleMax(days: readonly WeekDay[], goalMin: number): number {
  const goal = Math.max(1, goalMin || 0);
  return Math.max(Math.round((goal * 4) / 3), ...days.map((d) => d.min), 1);
}

/** Aktive Minuten der letzten `days` Tage (heute eingeschlossen). */
export function minutesLastDays(activity: Activity | null | undefined, now: number = Date.now(), days = 7): number {
  const act = activity || {};
  let ms = 0;
  for (let i = 0; i < days; i++) ms += act[dayKey(dayAt(now, -i).getTime())] || 0;
  return Math.round(ms / 60000);
}

/** Aufgaben der letzten `days` Tage (heute eingeschlossen, ab Mitternacht des ersten Tages). */
export function attemptsLastDays(attempts: readonly Attempt[] | null | undefined, now: number = Date.now(), days = 7): Attempt[] {
  const first = dayAt(now, -(days - 1));
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
  return (attempts || []).filter((a) => a.ts >= start);
}

/** Anteil richtiger Antworten (0–1); null ohne Aufgaben. */
export function accuracyOf(attempts: readonly Attempt[] | null | undefined): number | null {
  const list = attempts || [];
  return list.length ? list.filter((a) => a.correct).length / list.length : null;
}

/* ---------- Fokus (schwächster Bereich) ---------- */

export interface Focus {
  weakness: Weakness;
  /** Fehler unter den letzten 25 Versuchen des Subtyps (wie weaknesses) */
  errors: number;
  /** davon Nullen-Fehler */
  zeros: number;
  /** Ø Zeit (gemessene Versuche) und Ziel in ms; avgMs = 0 ohne Zeitmessung */
  avgMs: number;
  targetMs: number;
}

export type FocusState =
  | { kind: 'focus'; focus: Focus }
  /** Noch kein Subtyp mit ≥ 3 Versuchen in den aktiven Kategorien */
  | { kind: 'few' }
  /** Genug geübt, aber kein Subtyp unter 85 */
  | { kind: 'none' };

/** Fokus dieser Woche: schwächster Subtyp aus weaknesses() mit Fehlerzahlen für den Text der Hero-Karte. */
export function focusOf(
  attempts: readonly Attempt[] | null | undefined,
  enabledCategories: CategoryId[] | null = null,
): FocusState {
  const list = [...(attempts || [])];
  const w = weaknesses(list, 1, { enabledCategories })[0];
  if (!w) {
    const active = new Set<string>(activeCategories(enabledCategories).map((c) => c.id));
    const counts = new Map<string, number>();
    for (const a of list) if (active.has(a.category)) counts.set(a.subtype, (counts.get(a.subtype) ?? 0) + 1);
    const enough = [...counts.values()].some((n) => n >= 3);
    return { kind: enough ? 'none' : 'few' };
  }
  const recent = list.filter((a) => a.subtype === w.subtype).slice(-25);
  const errs = recent.filter((a) => !a.correct);
  return {
    kind: 'focus',
    focus: {
      weakness: w,
      errors: errs.length,
      zeros: errs.filter((a) => a.errorType === 'nullen').length,
      avgMs: w.avgTimeMs || 0,
      targetMs: w.avgTargetMs || w.targetMs,
    },
  };
}

/* ---------- Fehler ---------- */

export interface PatternCounts {
  /** Nullen-Fehler (errorType nullen) */
  nullen: number;
  /** richtig, aber langsamer als die Zielzeit (nur gemessene Versuche) */
  slow: number;
  /** knapp daneben (errorType knapp) */
  knapp: number;
  falsch: number;
  skip: number;
}

/** Fehlermuster der letzten `window` Aufgaben: errorType plus „zu langsam“ (richtig, Zeit > Ziel). */
export function patternCounts(attempts: readonly Attempt[] | null | undefined, window = 50): { n: number; counts: PatternCounts } {
  const list = (attempts || []).slice(-window);
  const counts: PatternCounts = { nullen: 0, slow: 0, knapp: 0, falsch: 0, skip: 0 };
  for (const a of list) {
    if (a.correct) {
      if (!a.untimed && a.targetMs > 0 && a.timeMs > a.targetMs) counts.slow++;
    } else if (a.errorType && a.errorType in counts) {
      counts[a.errorType]++;
    }
  }
  return { n: list.length, counts };
}

/** Die letzten `limit` Fehler, neueste zuerst. */
export function recentErrors(attempts: readonly Attempt[] | null | undefined, limit = 5): Attempt[] {
  return (attempts || []).filter((a) => !a.correct).slice(-limit).reverse();
}

/** 'today' | 'yesterday' relativ zu now, sonst null (Aufrufer formatiert das Datum). */
export function relativeDay(ts: number, now: number = Date.now()): 'today' | 'yesterday' | null {
  const k = dayKey(ts);
  if (k === dayKey(now)) return 'today';
  if (k === dayKey(dayAt(now, -1).getTime())) return 'yesterday';
  return null;
}

/* ---------- Verlauf ---------- */

/** Erster und letzter Zahlenwert einer Reihe (null-Lücken übersprungen); null bei weniger als 2 Werten. */
export function firstLast(values: ReadonlyArray<number | null | undefined>): { first: number; last: number } | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const first = nums[0];
  const last = nums[nums.length - 1];
  return nums.length >= 2 && first !== undefined && last !== undefined ? { first, last } : null;
}

/**
 * Gleitender Mittelwert über die letzten `window` Tage (null-Tage zählen nicht mit). Glättet die Tageswerte zur
 * ruhigen Lernkurve; Tage ohne Wert im Fenster bleiben null.
 */
export function rollingMean(values: ReadonlyArray<number | null | undefined>, window = 7): Array<number | null> {
  return values.map((_, i) => {
    const nums = values.slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  });
}

/** Richtung einer Reihe: Änderung unter 5 % (bezogen auf den ersten Wert) gilt als gleichbleibend. */
export function trendOf(first: number, last: number): 'up' | 'down' | 'flat' {
  const base = Math.max(Math.abs(first), 1e-9);
  const rel = (last - first) / base;
  return rel > 0.05 ? 'up' : rel < -0.05 ? 'down' : 'flat';
}

export interface DailyDay { date: string; ts: number; result: DailyResult | null }

/** Daily-Ergebnisse der letzten `days` Tage, neueste zuerst. */
export function dailyHistory(results: Record<string, DailyResult> | null | undefined, now: number = Date.now(), days = 7): DailyDay[] {
  const res = results || {};
  return Array.from({ length: days }, (_, i) => {
    const d = dayAt(now, -i);
    const date = dayKey(d.getTime());
    return { date, ts: d.getTime(), result: res[date] ?? null };
  });
}

/* ---------- Formatierung ---------- */

/** Sekunden ruhig gerundet: ab 10 s ganzzahlig („19 s“), darunter eine Nachkommastelle („4,5 s“). */
export function fmtSec(ms: number): string {
  const s = Math.max(0, ms || 0) / 1000;
  return `${fmt(s, s >= 10 ? 0 : 1)} s`;
}
