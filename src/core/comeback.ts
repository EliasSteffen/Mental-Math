// Comeback und Serie reparieren (v10 C, DOM-frei): wer ist zurück, was lässt sich reparieren, welche Aufgaben wärmen auf.
import type { Attempt, Level, SubtypeId } from '../types.ts';
import { CATEGORIES, SUBTYPES } from './catalog.ts';
import { LEGACY_ACTIVE_MS, roundsByDay, type HabitInfo } from './habit.ts';
import { dayKey } from './progress.ts';
import { levelFor, subtypeStats } from './scoring.ts';

export const COMEBACK_MIN_DAYS = 3; // so lange weg (letzter aktiver Tag vor heute ≤ heute − 3)
export const COMEBACK_XP = 300;
export const REPAIR_ROUNDS = 3; // Runden heute insgesamt (1 hält heute, 2 reparieren gestern)
export const REPAIR_XP = 2000; // oder so viele XP einsetzen
export const REPAIR_MIN_STREAK = 3; // nur Serien ab 3 Tagen
export const REPAIR_COOLDOWN_DAYS = 30; // höchstens eine Reparatur in 30 Tagen
export const WARMUP_TASKS = 5;
export const WARMUP_SUBTYPES = 3;

/** Ganze Kalendertage zwischen zwei Tagesschlüsseln (YYYY-MM-DD), b − a. */
export function daysBetween(a: string, b: string): number {
  const p = (k: string): number => {
    const [y = 0, m = 1, d = 1] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((p(b) - p(a)) / 86_400_000);
}

export interface ComebackState { away: number; eligible: boolean; claimedToday: boolean }

export function comebackState(o: {
  sessions: readonly { ts: number }[]; activity: Readonly<Record<string, number>>; now: number; claimedDays: readonly string[];
}): ComebackState {
  const today = dayKey(o.now);
  const rounds = roundsByDay(o.sessions);
  const days = new Set<string>();
  for (const k of Object.keys(rounds)) if ((rounds[k] ?? 0) > 0) days.add(k);
  for (const [k, ms] of Object.entries(o.activity || {})) if (ms >= LEGACY_ACTIVE_MS) days.add(k);
  let last: string | null = null;
  for (const k of days) if (k < today && (last === null || k > last)) last = k;
  const claimedToday = o.claimedDays.includes(today);
  if (last === null) return { away: 0, eligible: false, claimedToday };
  const away = daysBetween(last, today);
  return { away, eligible: away >= COMEBACK_MIN_DAYS && !claimedToday, claimedToday };
}

export interface RepairOffer { day: string; lost: number; roundsDone: number; roundsNeeded: number; xpCost: number }

export function repairOffer(o: { habit: HabitInfo; repairs: readonly string[]; now: number }): RepairOffer | null {
  const b = o.habit.broken;
  if (!b || b.lost < REPAIR_MIN_STREAK) return null;
  if (o.repairs.includes(b.day)) return null;
  const today = dayKey(o.now);
  for (const r of o.repairs) if (daysBetween(r, today) < REPAIR_COOLDOWN_DAYS) return null;
  return {
    day: b.day, lost: b.lost, roundsDone: Math.min(o.habit.todayRounds, REPAIR_ROUNDS), roundsNeeded: REPAIR_ROUNDS, xpCost: REPAIR_XP,
  };
}

export interface WarmupSlot { subtype: SubtypeId; level: Level }

/** Fallback ohne Historie: leichte, breite Grundlagen. */
const FALLBACK: readonly SubtypeId[] = ['table.mul', 'mult.2x1', 'pct.of'];

/**
 * Aufwärmrunde: Aufgaben aus den (bis zu) 3 stärksten geübten Subtypen (höchster Skill), je eine Stufe leichter
 * (mindestens Leicht), reihum. Kategorien aus `enabledCategories` (null = alle).
 */
export function warmupPlan(attempts: readonly Attempt[], enabledCategories: readonly string[] | null = null, count = WARMUP_TASKS): WarmupSlot[] {
  const list = attempts as Attempt[];
  const stats = subtypeStats(list);
  const ok = (id: string): boolean => {
    const s = SUBTYPES[id];
    return !!s && s.category !== 'custom' && CATEGORIES.some((c) => c.id === s.category) && (!enabledCategories || enabledCategories.includes(s.category));
  };
  const ranked = Object.keys(stats)
    .filter((id) => ok(id) && stats[id]!.score !== null)
    .sort((a, b) => (stats[b]!.score! - stats[a]!.score!) || (stats[b]!.n - stats[a]!.n) || a.localeCompare(b))
    .slice(0, WARMUP_SUBTYPES);
  const picks: SubtypeId[] = ranked.length ? ranked : FALLBACK.filter(ok);
  if (!picks.length) picks.push(...Object.keys(SUBTYPES).filter(ok).slice(0, 1));
  return Array.from({ length: count }, (_, i) => {
    const subtype = picks[i % picks.length]!;
    const level = ranked.length ? (Math.max(1, levelFor(subtype, list, 'auto') - 1) as Level) : 1;
    return { subtype, level };
  });
}
