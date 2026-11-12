// Raketen-Rennen (v12 R1), DOM-frei: Aufgabenstrom aus einem Seed, Wertung, Zeitleiste, Skala der Rennbahn.
// Gemeinsamer Kern für alle Spielweisen (Reihum, Geister-Rennen, Live) – Server und Worker dürfen ihn ebenfalls nutzen.
import type { CategoryId, Level, Task } from '../types.ts';
import { CATEGORIES, SUBTYPES, mixCategories } from './catalog.ts';
import { mulberry32 } from './daily.ts';
import { generate } from './generators/index.ts';
import { pick } from './numbers.ts';

export const RACE_DURATIONS = [30, 60, 90, 120] as const;
export type RaceDuration = (typeof RACE_DURATIONS)[number];
export const RACE_DEFAULT_DURATION: RaceDuration = 60;
export const RACE_DEFAULT_LEVEL: Level = 2;

export interface RaceConfig { durationS: RaceDuration; cat: CategoryId | 'all'; lvl: 1 | 2 | 3 }

/** Mehr als 150 Aufgaben schafft niemand in 120 s. */
export const RACE_MAX_TASKS = 150;
/** Countdown vor dem Start: 3 · 2 · 1 · Los (Sekunden je Schritt) */
export const RACE_COUNTDOWN_STEPS = 3;
/** Kulanz für Abgaben nach Ablauf (Server, R2/R3), ms */
export const RACE_GRACE_MS = 3000;

export const raceDurationMs = (cfg: Pick<RaceConfig, 'durationS'>): number => cfg.durationS * 1000;

/** Wählbare Kategorien: alle sichtbaren – das kleine 1×1 (Drill) gehört dazu, geht aber nicht in „Gemischt“. */
export function raceCategories(): CategoryId[] {
  return CATEGORIES.filter((c) => !c.hidden).map((c) => c.id);
}

/**
 * Aufgabenstrom: bei gleichem Seed und gleicher Konfiguration immer dieselbe Folge (wie die Daily, `mulberry32`).
 * „Gemischt“ geht reihum durch die Kategorien (ohne Drill), eine Kategorie bleibt bei sich. Zwei gleiche Aufgaben
 * hintereinander werden bis zu dreimal neu gezogen (auch das ist deterministisch).
 */
export function raceTasks(seed: number, cfg: RaceConfig, count: number = RACE_MAX_TASKS): Task[] {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const cats: string[] = cfg.cat === 'all' ? mixCategories(null).map((c) => c.id) : [cfg.cat];
  const n = Math.max(0, Math.min(RACE_MAX_TASKS, Math.floor(count)));
  const out: Task[] = [];
  for (let i = 0; i < n; i++) {
    const cat = cats[i % cats.length];
    if (!cat) break;
    const ids = Object.values(SUBTYPES).filter((x) => x.category === cat).map((x) => x.id);
    if (ids.length === 0) break;
    let task = generate(pick(ids, rng), rng, { level: cfg.lvl });
    for (let retry = 0; retry < 3 && out[i - 1]?.prompt === task.prompt; retry++) task = generate(pick(ids, rng), rng, { level: cfg.lvl });
    task.id = `race-${s}-${i}`;
    task.mode = 'race';
    out.push(task);
  }
  return out;
}

/* ---------- Zeitleiste und Wertung ---------- */

/** Eine beantwortete Aufgabe: Zeitpunkt in ms seit „Los“ und ob sie stimmte */
export interface RaceStep { ms: number; ok: boolean }
export interface RaceRun { name: string; steps: RaceStep[]; me?: boolean }

export interface RaceScore { correct: number; wrong: number; lastOkMs: number }

/** Zählt nur Antworten bis einschließlich `durationMs`; spätere zählen nicht (weder richtig noch falsch). */
export function raceScore(steps: readonly RaceStep[], durationMs: number): RaceScore {
  let correct = 0;
  let wrong = 0;
  let lastOkMs = 0;
  for (const s of steps) {
    if (!(s.ms <= durationMs)) continue;
    if (s.ok) {
      correct += 1;
      if (s.ms > lastOkMs) lastOkMs = s.ms;
    } else wrong += 1;
  }
  return { correct, wrong, lastOkMs };
}

/** `index`: Platz in der Eingabeliste (stabile Farbe/Bahn auch nach dem Sortieren) */
export type RaceRanked = RaceRun & { rank: number; correct: number; wrong: number; lastOkMs: number; index: number };

/**
 * Rang nach richtigen Antworten; Gleichstand → weniger falsche; dann frühere Zeit der letzten richtigen.
 * Wer in allen drei Werten gleichauf liegt, teilt den Rang (1, 1, 3). Die Reihenfolge bei Gleichstand bleibt die der Eingabe.
 */
export function raceRanking(runs: readonly RaceRun[], durationMs: number): RaceRanked[] {
  const scored = runs.map((r, i) => ({ r, i, sc: raceScore(r.steps, durationMs) }));
  scored.sort((a, b) => b.sc.correct - a.sc.correct || a.sc.wrong - b.sc.wrong || a.sc.lastOkMs - b.sc.lastOkMs || a.i - b.i);
  const out: RaceRanked[] = [];
  scored.forEach((x, idx) => {
    const prev = scored[idx - 1];
    const same = prev !== undefined && prev.sc.correct === x.sc.correct && prev.sc.wrong === x.sc.wrong && prev.sc.lastOkMs === x.sc.lastOkMs;
    const rank = same ? (out[idx - 1]?.rank ?? idx + 1) : idx + 1;
    out.push({ ...x.r, rank, ...x.sc, index: x.i });
  });
  return out;
}

/** Richtige Antworten bis zum Zeitpunkt `t` (ms, einschließlich) – Höhe der Rakete für Geister, Live und Wiederholung. */
export function altitudeAt(steps: readonly RaceStep[], t: number): number {
  let n = 0;
  for (const s of steps) if (s.ok && s.ms <= t) n += 1;
  return n;
}

/* ---------- Gegner-Quelle (R2/R3) ---------- */

/**
 * Woher die Gegner-Raketen kommen. R1: Wiederholung bei „Reihum“ (Zeitleisten) und ein Rennen ganz ohne Gegner.
 * R2 liefert Geister aus gespeicherten Zeitleisten, R3 die Live-Positionen aus dem Raum.
 * `altitudes(tMs)` hat dieselbe Länge und Reihenfolge wie `names()` und darf bei jedem Bild aufgerufen werden.
 */
export interface RaceOpponents { names(): string[]; altitudes(tMs: number): number[] }

/** Gegner aus fertigen Zeitleisten (Geister, Wiederholung). */
export function opponentsFromRuns(runs: readonly RaceRun[]): RaceOpponents {
  return {
    names: () => runs.map((r) => r.name),
    altitudes: (tMs) => runs.map((r) => altitudeAt(r.steps, tMs)),
  };
}

/** Kein Gegner – nur die eigene Rakete. */
export const NO_OPPONENTS: RaceOpponents = { names: () => [], altitudes: () => [] };

/* ---------- Rennbahn ---------- */

export const RACE_MAX_LANES = 8;

/** Meilensteine als dezente Linien: bei 10 „Mond“, 20 „Mars“, 30 „Jupiter“ */
export const RACE_MILESTONES: ReadonlyArray<{ id: 'moon' | 'mars' | 'jupiter'; at: number }> = [
  { id: 'moon', at: 10 }, { id: 'mars', at: 20 }, { id: 'jupiter', at: 30 },
];

/** Höhe der Skala: wächst in Stufen mit dem Führenden (kein ständiges Neu-Skalieren), mindestens 12. */
export function trackMax(leaderAltitude: number): number {
  return Math.max(12, Math.ceil((Math.max(0, leaderAltitude) + 2) / 6) * 6);
}

/**
 * Bei mehr als `max` Teilnehmern: die eigene Rakete plus die `max - 1` nächsten (nach Höhe), in Ursprungsreihenfolge.
 * `me` = Index der eigenen Rakete (oder -1); ohne eigene Rakete die `max` Führenden.
 */
export function visibleLanes(altitudes: readonly number[], me: number, max: number = RACE_MAX_LANES): number[] {
  const all = altitudes.map((_, i) => i);
  if (altitudes.length <= max) return all;
  if (me < 0 || me >= altitudes.length) {
    return all.sort((a, b) => (altitudes[b] ?? 0) - (altitudes[a] ?? 0) || a - b).slice(0, max).sort((a, b) => a - b);
  }
  const mine = altitudes[me] ?? 0;
  const others = all.filter((i) => i !== me)
    .sort((a, b) => Math.abs((altitudes[a] ?? 0) - mine) - Math.abs((altitudes[b] ?? 0) - mine) || a - b)
    .slice(0, max - 1);
  return [me, ...others].sort((a, b) => a - b);
}

/** Zeitraffer der Wiederholung: 6-fach, mindestens 6 s (60 s → 10 s). */
export const REPLAY_SPEEDUP = 6;
export const replayMs = (durationMs: number): number => Math.max(6000, Math.round(durationMs / REPLAY_SPEEDUP));

/* ---------- Konfiguration als Text (Links, Server) ---------- */

/** „60.mult.2“ – Dauer in Sekunden, Kategorie oder „all“, Stufe. */
export function encodeRaceConfig(cfg: RaceConfig): string {
  return `${cfg.durationS}.${cfg.cat}.${cfg.lvl}`;
}

/** Strenge Prüfung: nur genau dieses Format, bekannte Dauer, sichtbare Kategorie oder „all“, Stufe 1–3; sonst null. */
export function decodeRaceConfig(raw: unknown): RaceConfig | null {
  if (typeof raw !== 'string' || raw.length > 24) return null;
  const m = /^([1-9]\d{1,2})\.([a-z]{2,12}|all)\.([123])$/.exec(raw);
  if (!m) return null;
  const durationS = Number(m[1]);
  const cat = m[2] ?? '';
  const lvl = Number(m[3]);
  if (!(RACE_DURATIONS as readonly number[]).includes(durationS)) return null;
  if (cat !== 'all' && !raceCategories().includes(cat as CategoryId)) return null;
  if (lvl !== 1 && lvl !== 2 && lvl !== 3) return null;
  return { durationS: durationS as RaceDuration, cat: cat as CategoryId | 'all', lvl };
}

/** Neuer Seed (32 Bit) für eine Revanche bzw. ein neues Rennen. */
export function newRaceSeed(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] ?? 1;
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** Spielernamen für Reihum: Steuerzeichen raus, gekürzt, leer → Platzhalter „Spieler N“ macht die View. */
export const RACE_NAME_MAX = 16;
const NAME_BAD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
export function cleanRaceName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return Array.from(raw.replace(NAME_BAD, ' ').replace(/\s+/g, ' ').trim()).slice(0, RACE_NAME_MAX).join('');
}
