// Gewohnheit: Tagesziel in Runden, Serie (≥ 1 Runde pro Tag) und automatische Freezes (DOM-frei, nur aus der Historie berechnet).
import type { Activity, HeatCell } from '../types.ts';
import { dayKey } from './progress.ts';

export const DEFAULT_GOAL_ROUNDS = 3;
/** Je so viele Serientage am Stück gibt es einen Freeze */
export const FREEZE_EVERY_DAYS = 7;
export const MAX_FREEZES = 2;
/** Altbestand ohne Runden: ab so vielen aktiven Millisekunden zählt der Tag */
export const LEGACY_ACTIVE_MS = 5 * 60_000;
/** Rückblick der Serienberechnung in Tagen */
const MAX_DAYS = 730;

// Lokaler Tag um 12 Uhr (DST-sicher), n Tage verschoben
const keyAt = (ts: number, offset: number): string => {
  const d = new Date(ts);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12).getTime());
};

/** Runden (gespeicherte Sessions) je lokalem Tag. */
export function roundsByDay(sessions: readonly { ts: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (!Number.isFinite(s.ts)) continue;
    const k = dayKey(s.ts);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface HabitInfo {
  todayRounds: number;
  goalRounds: number;
  /** heute ≥ Ziel */
  todayDone: boolean;
  /** heute ≥ 1 Runde → Serie gesichert */
  kept: boolean;
  streak: number;
  best: number;
  freezes: number;
  /** Mit einem Freeze überbrückte Tage der laufenden Serie */
  frozenDays: string[];
  /** v10: reparierte Tage der laufenden Serie */
  repairedDays: string[];
  /**
   * v10: Die Serie ist gestern gerissen (verpasst, kein Freeze, nicht repariert) – lost = Länge davor.
   * Heute lässt sie sich reparieren (src/features/comeback.ts); null = nichts gerissen.
   */
  broken: { day: string; lost: number } | null;
}

export function habitInfo(o: {
  sessions: readonly { ts: number }[]; activity: Activity; goalRounds: number; now?: number;
  /** v10: zusätzliche Freezes (gekauft oder aus Truhen) – Zeitpunkte; zählen ab ihrem Tag, Vorrat höchstens MAX_FREEZES */
  boughtFreezes?: readonly number[];
  /** v10: reparierte Tage (YYYY-MM-DD) – gelten als überbrückt, ohne Freeze und ohne Serientag */
  repairedDays?: readonly string[];
}): HabitInfo {
  const now = o.now ?? Date.now();
  const goal = Math.max(1, Math.floor(o.goalRounds) || DEFAULT_GOAL_ROUNDS);
  const rounds = roundsByDay(o.sessions);
  const act = o.activity || {};
  // Aktiv: mindestens eine Runde, oder (Altbestand ohne Sessions) genug aktive Minuten
  const active = (k: string): boolean => (rounds[k] ?? 0) > 0 || (act[k] || 0) >= LEGACY_ACTIVE_MS;

  const todayKey = dayKey(now);
  let streak = 0;
  let best = 0;
  let freezes = 0;
  let sinceFreeze = 0;
  let frozen: string[] = [];
  const count = (): void => {
    streak += 1;
    sinceFreeze += 1;
    if (sinceFreeze >= FREEZE_EVERY_DAYS) { sinceFreeze = 0; freezes = Math.min(MAX_FREEZES, freezes + 1); }
    if (streak > best) best = streak;
  };

  // v10: zusätzliche Freezes je Tag, reparierte Tage
  const bought: Record<string, number> = {};
  for (const ts of o.boughtFreezes ?? []) if (Number.isFinite(ts)) { const k = dayKey(ts); bought[k] = (bought[k] ?? 0) + 1; }
  const repairedSet = new Set(o.repairedDays ?? []);
  const addBought = (k: string): void => { if (bought[k]) freezes = Math.min(MAX_FREEZES, freezes + bought[k]); };
  let repaired: string[] = [];
  let broken: HabitInfo['broken'] = null;

  // Ab dem ersten aktiven Tag (höchstens 730 Tage zurück) bis gestern; ein verpasster Tag wird repariert,
  // verbraucht einen Freeze oder beendet die Serie
  let started = false;
  for (let off = -MAX_DAYS; off <= -1; off++) {
    const k = keyAt(now, off);
    addBought(k);
    if (active(k)) { started = true; count(); continue; }
    if (!started) continue;
    if (repairedSet.has(k)) { repaired.push(k); continue; }
    if (freezes > 0) { freezes -= 1; frozen.push(k); continue; }
    if (off === -1 && streak > 0) broken = { day: k, lost: streak };
    streak = 0; sinceFreeze = 0; frozen = []; repaired = [];
  }
  // Heute: aktiv zählt, leer bricht nichts
  addBought(todayKey);
  const todayRounds = rounds[todayKey] ?? 0;
  const kept = active(todayKey);
  if (kept) count();
  return {
    todayRounds, goalRounds: goal, todayDone: todayRounds >= goal, kept, streak, best, freezes, frozenDays: frozen,
    repairedDays: repaired, broken,
  };
}

/** Heatmap-Stufe nach Runden/Ziel (0 = keine, 1 < ½, 2 < 1, 3 < 2, 4 ≥ 2 × Ziel). */
export function roundsLevel(rounds: number, goal: number): HeatCell['level'] {
  if (!(rounds > 0)) return 0;
  const r = rounds / Math.max(1, goal);
  return r < 0.5 ? 1 : r < 1 ? 2 : r < 2 ? 3 : 4;
}

/** Heatmap nach Runden (Wochen beginnen montags, die letzte Woche endet am Sonntag nach `now`). */
export function roundsHeatmap(
  sessions: readonly { ts: number }[], goalRounds: number, now: number = Date.now(), weeks = 16, activity: Activity = {},
): HeatCell[] {
  const rounds = roundsByDay(sessions);
  const d = new Date(now);
  const mondayOffset = -((new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getDay() + 6) % 7);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = keyAt(now, mondayOffset - (weeks - 1) * 7 + i);
    // Altbestand: Tage ohne Runden, aber mit Aktivität, zählen wie eine Runde
    const n = rounds[date] ?? ((activity[date] || 0) >= LEGACY_ACTIVE_MS ? 1 : 0);
    cells.push({ date, ms: activity[date] || 0, rounds: n, level: roundsLevel(n, goalRounds) });
  }
  return cells;
}
