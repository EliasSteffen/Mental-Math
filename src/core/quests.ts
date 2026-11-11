// Tagesquests und Wochentruhe (v10 Q): Pool, deterministische Auswahl, Fortschritt aus den Daten von heute, Wochen, Truhen. DOM-frei.
import type { Attempt, CategoryId, DailyResult, Session } from '../types.ts';
import { t } from '../i18n/index.ts';
import { CATEGORIES, SUBTYPES } from './catalog.ts';
import { mulberry32, seedFromString } from './daily.ts';
import { MAX_FREEZES } from './habit.ts';
import { pick } from './numbers.ts';
import { dayKey } from './progress.ts';

export type QuestLevel = 1 | 2 | 3;
/** XP je Schwierigkeit */
export const QUEST_XP: Readonly<Record<QuestLevel, number>> = { 1: 100, 2: 200, 3: 300 };
export type QuestLog = Record<string, { picks: string[]; done: string[] }>;

/** Quest-Vorlagen: Basis-ID (Teil vor „:“) → Schwierigkeit. Der Titel steht in i18n unter `quests.q_<Basis>`. */
export const QUEST_BASES = {
  round: 1, correct10: 1, daily: 1, chain: 1, cat: 1,
  rounds2: 2, acc90: 2, fast10: 2, case: 2, weak: 2, review: 2,
  perfect: 3, goal: 3, noassist10: 3, speed5: 3, casePerfect: 3,
} as const satisfies Record<string, QuestLevel>;
export type QuestBase = keyof typeof QUEST_BASES;

export interface QuestRef { base: QuestBase; param: string }

/** „weak:pct.change“ → { base: 'weak', param: 'pct.change' }; unbekannte Basis → null. */
export function parseQuestId(id: string): QuestRef | null {
  const i = id.indexOf(':');
  const base = i < 0 ? id : id.slice(0, i);
  if (!Object.hasOwn(QUEST_BASES, base)) return null;
  return { base: base as QuestBase, param: i < 0 ? '' : id.slice(i + 1) };
}

export function questLevel(id: string): QuestLevel {
  const ref = parseQuestId(id);
  return ref ? QUEST_BASES[ref.base] : 1;
}

export const questXp = (id: string): number => QUEST_XP[questLevel(id)];

/** Anzeigetext der Quest (Parameter: Kategorie, Aufgabentyp, Anzahl). */
export function questTitle(id: string): string {
  const ref = parseQuestId(id);
  if (!ref) return id;
  const cat = CATEGORIES.find((c) => c.id === ref.param)?.name ?? ref.param;
  const sub = SUBTYPES[ref.param]?.name ?? ref.param;
  return t(`quests.q_${ref.base}`, { cat, sub, n: ref.param });
}

/* ---------- Fortschritt ---------- */

export interface QuestData {
  attempts: readonly Attempt[];
  sessions: readonly Session[];
  dailyResults: Readonly<Record<string, DailyResult>>;
  /** Tagesziel in Runden */
  goalRounds: number;
}
export interface QuestProgress { value: number; target: number }

const modeCategory = (mode: string): string | null => (Object.hasOwn(SUBTYPES, mode) ? (SUBTYPES[mode]?.category ?? null) : mode);

/** Fortschritt einer Quest aus den Daten des Tages `day` (lokal). value ≤ target. */
export function questProgress(id: string, day: string, d: QuestData): QuestProgress {
  const ref = parseQuestId(id);
  if (!ref) return { value: 0, target: 1 };
  const sessions = d.sessions.filter((s) => Number.isFinite(s.ts) && dayKey(s.ts) === day);
  const attempts = d.attempts.filter((a) => dayKey(a.ts) === day);
  const timed = (a: Attempt): boolean => a.correct && !a.assisted && !a.untimed && a.targetMs > 0;
  const done = (value: number, target: number): QuestProgress => ({ value: Math.min(value, target), target });
  const flag = (ok: boolean): QuestProgress => ({ value: ok ? 1 : 0, target: 1 });
  const round5 = (s: Session): boolean => s.n >= 5;
  switch (ref.base) {
    case 'round': return done(sessions.length, 1);
    case 'rounds2': return done(sessions.length, 2);
    case 'correct10': return done(attempts.filter((a) => a.correct).length, 10);
    case 'daily': return flag(d.dailyResults[day] !== undefined || sessions.some((s) => s.mode === 'daily'));
    case 'chain': return flag(sessions.some((s) => s.mode === 'chain'));
    case 'cat': return flag(sessions.some((s) => s.n > 0 && modeCategory(s.mode) === ref.param));
    case 'acc90': return flag(sessions.some((s) => round5(s) && s.correct / s.n >= 0.9));
    case 'fast10': return done(attempts.filter((a) => timed(a) && a.timeMs <= a.targetMs).length, 10);
    case 'case': return flag(sessions.some((s) => s.mode.startsWith('case:') && s.n > 0));
    case 'weak': return done(attempts.filter((a) => a.correct && a.subtype === ref.param).length, 5);
    case 'review': {
      const n = Math.max(1, Math.min(5, Number.parseInt(ref.param, 10) || 1));
      return done(attempts.filter((a) => a.isReview === true || a.mode === 'review').length, n);
    }
    case 'perfect': return flag(sessions.some((s) => round5(s) && s.correct === s.n));
    case 'goal': return done(sessions.length, Math.max(1, Math.floor(d.goalRounds) || 1));
    case 'noassist10': {
      const assisted = new Set(attempts.filter((a) => a.assisted).map((a) => a.sessionId));
      return flag(sessions.some((s) => s.n >= 10 && s.correct / s.n >= 0.9 && !assisted.has(s.id)));
    }
    case 'speed5': return done(attempts.filter((a) => timed(a) && a.timeMs <= a.targetMs / 3).length, 5);
    case 'casePerfect': return flag(sessions.some((s) => s.mode.startsWith('case:') && s.n > 0 && s.correct === s.n));
    default: return { value: 0, target: 1 };
  }
}

/* ---------- Auswahl ---------- */

export interface PickContext {
  /** Kategorien für „Runde in <Kategorie>“ (sichtbare, ohne Drills), reihum nach Tag */
  categories: readonly CategoryId[];
  /** Schwächen (Typ-IDs), stärkste zuerst; leer = Quest nicht verfügbar */
  weakSubtypes: readonly string[];
  /** Anzahl fälliger Wiederholungen; 0 = Quest nicht verfügbar */
  dueCount: number;
}

/** Tage seit 1970 (lokaler Kalendertag) – für „reihum“. */
function dayOrdinal(day: string): number {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Verfügbare Quests einer Stufe (konkrete IDs). */
export function questCandidates(level: QuestLevel, day: string, ctx: PickContext): string[] {
  const ord = dayOrdinal(day);
  if (level === 1) {
    const out = ['round', 'correct10', 'daily', 'chain'];
    const cat = ctx.categories.length ? ctx.categories[ord % ctx.categories.length] : undefined;
    if (cat) out.push(`cat:${cat}`);
    return out;
  }
  if (level === 2) {
    const out = ['rounds2', 'acc90', 'fast10', 'case'];
    const weak = ctx.weakSubtypes.length ? ctx.weakSubtypes[ord % ctx.weakSubtypes.length] : undefined;
    if (weak) out.push(`weak:${weak}`);
    if (ctx.dueCount > 0) out.push(`review:${Math.min(3, ctx.dueCount)}`);
    return out;
  }
  return ['perfect', 'goal', 'noassist10', 'speed5', 'casePerfect'];
}

/** Je eine Quest pro Stufe, deterministisch aus dem Tag (der Aufrufer hält die Auswahl über den Tag fest). */
export function pickQuests(day: string, ctx: PickContext): string[] {
  const rng = mulberry32(seedFromString(`quests:${day}`));
  return ([1, 2, 3] as const).map((level) => pick(questCandidates(level, day, ctx), rng));
}

/** Auswahl des Tages: gespeicherte (nur gültige IDs, alle drei Stufen) oder frisch gezogene. `fresh` = muss gespeichert werden. */
export function dayPicks(log: QuestLog, day: string, ctx: PickContext): { picks: string[]; fresh: boolean } {
  const stored = (log[day]?.picks ?? []).filter((id) => parseQuestId(id) !== null);
  if (stored.length === 3 && new Set(stored.map(questLevel)).size === 3) return { picks: stored, fresh: false };
  return { picks: pickQuests(day, ctx), fresh: true };
}

export const withPicks = (log: QuestLog, day: string, picks: string[]): QuestLog => ({ ...log, [day]: { picks, done: log[day]?.done ?? [] } });

export const withDone = (log: QuestLog, day: string, ids: string[]): QuestLog => {
  const cur = log[day] ?? { picks: [], done: [] };
  return { ...log, [day]: { picks: cur.picks, done: [...new Set([...cur.done, ...ids])] } };
};

/** Erledigte, noch nicht gutgeschriebene Quests des Tages (nach `withDone` nie wieder: Gutschrift genau einmal). */
export function newlyDone(log: QuestLog, day: string, picks: readonly string[], d: QuestData): string[] {
  const credited = new Set(log[day]?.done ?? []);
  return picks.filter((id) => {
    if (credited.has(id)) return false;
    const p = questProgress(id, day, d);
    return p.value >= p.target;
  });
}

/* ---------- Woche und Truhen ---------- */

const keyAt = (day: string, offset: number): string => {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + offset, 12).getTime()); // 12 Uhr: Zeitumstellung verschiebt den Tag nie
};

/** Montag der Woche, in der `day` liegt (Woche = Montag–Sonntag, lokal). */
export function weekStart(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const dow = new Date(y, m - 1, d, 12).getDay(); // 0 = Sonntag
  return keyAt(day, -((dow + 6) % 7));
}

export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => keyAt(monday, i));

/** Sterne der Woche = gutgeschriebene Quests der sieben Tage (höchstens 21). */
export function weekStars(log: QuestLog, monday: string): number {
  return weekDays(monday).reduce((s, d) => s + Math.min(3, log[d]?.done.length ?? 0), 0);
}

export const CHEST_STARS = [5, 10, 15] as const;
export const MAX_STARS = 21;
export type ChestTier = 1 | 2 | 3;

/** Nächste bereite Truhe (Stufe 1–3), wenn die Sterne reichen und sie noch nicht geöffnet ist; sonst 0. Geöffnet wird der Reihe nach. */
export function readyChest(stars: number, opened: number): 0 | ChestTier {
  const next = opened + 1;
  if (next > 3) return 0;
  return stars >= (CHEST_STARS[next - 1] ?? Infinity) ? (next as ChestTier) : 0;
}

/** XP-Spannen je Stufe (vor dem Öffnen sichtbar). */
export const CHEST_XP: Readonly<Record<ChestTier, readonly [number, number]>> = { 1: [300, 600], 2: [800, 1200], 3: [1500, 2500] };
const CHEST_STEP = 10;

export interface ChestContents { tier: ChestTier; xp: number; freeze: boolean; frame: boolean }

/**
 * Inhalt einer Truhe: deterministisch je Woche und Stufe (leicht variabel in der Spanne). Silber enthält einen Freeze
 * (Vorrat voll: +500 XP), Gold den Rahmen „Truhe“ (schon vorhanden: +1.000 XP).
 */
export function chestContents(week: string, tier: ChestTier, o: { freezes: number; hasFrame: boolean }): ChestContents {
  const rng = mulberry32(seedFromString(`chest:${week}:${tier}`));
  const [lo, hi] = CHEST_XP[tier];
  let xp = lo + Math.floor(rng() * ((hi - lo) / CHEST_STEP + 1)) * CHEST_STEP;
  let freeze = false;
  let frame = false;
  if (tier === 2) {
    if (o.freezes < MAX_FREEZES) freeze = true;
    else xp += 500;
  }
  if (tier === 3) {
    if (!o.hasFrame) frame = true;
    else xp += 1000;
  }
  return { tier, xp, freeze, frame };
}

/** Millisekunden bis zum nächsten lokalen Mitternacht (Quests wechseln um 0 Uhr). */
export function msUntilNextDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}
