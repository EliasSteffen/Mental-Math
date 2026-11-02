// Bewertung, Punkte, Skill, Schwächen
import type {
  Attempt, CategoryId, DifficultySetting, ErrorPatterns, EvaluateOptions, Evaluation, Level, SkillStats, SubtypeId, Task, Weakness,
} from '../types.ts';
import { SUBTYPES, CATEGORIES, activeCategoryIds } from './catalog.ts';
import { t } from '../i18n/index.ts';
import { unitFactor } from './numbers.ts';
import {
  DEFAULT_CONFIG, adaptiveLevel, errorPatterns as countErrors, findDeficits, overallStats, skillStats, statsBy,
} from '../vendor/learning.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function timeFactor(timeMs: number, targetMs: number): number {
  return clamp(1 - (0.6 * (timeMs - targetMs)) / (2 * targetMs), 0.4, 1);
}

export function evaluate(
  task: Task,
  given: number | null | undefined,
  timeMs: number,
  { assisted = false, untimed = false, estimate = false }: EvaluateOptions = {},
): Evaluation {
  const tf = untimed ? 1 : timeFactor(timeMs, task.targetMs);
  if (given === null || given === undefined || Number.isNaN(given)) {
    return { correct: false, errorType: 'skip', points: 0, timeFactor: tf };
  }
  const { expected } = task;
  if (task.kind === 'choice') {
    if (given === expected) {
      const points = Math.round(100 * task.weight * tf);
      return { correct: true, errorType: null, points: assisted ? Math.round(points * 0.5) : points, timeFactor: tf };
    }
    return { correct: false, errorType: 'falsch', points: 0, timeFactor: tf };
  }
  const { abs = 0, rel = 0 } = task.tolerance || {};
  const F = unitFactor(task.unit);
  const candidates = [given];
  if (F > 1) candidates.push(given / F);
  if (task.unit === '%') candidates.push(given * 100);
  if (task.subtype === 'pct.change') candidates.push(Math.abs(given));
  const est = estimate && !task.subtype.startsWith('mag.') && task.subtype !== 'frac.topct';
  const tol = Math.max(abs, rel * Math.abs(expected), est ? 0.05 * Math.abs(expected) : 0) + 1e-9;
  const mult = est ? 0.7 : 1;
  const isOk = (c: number): boolean => Math.abs(c - expected) <= tol;
  const ok = candidates.some(isOk);
  if (!ok && candidates.length > 1 && expected !== 0) {
    let best = given;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = Math.abs(Math.log10(Math.abs(c / expected)));
      if (Number.isFinite(d) && d < bestD) { bestD = d; best = c; }
    }
    given = best;
  }
  const diff = Math.abs(given - expected);
  if (ok) {
    const points = Math.round(100 * task.weight * tf * mult);
    return { correct: true, errorType: null, points: assisted ? Math.round(points * 0.5) : points, timeFactor: tf };
  }
  if (expected !== 0 && given !== 0) {
    const L = Math.log10(Math.abs(given / expected));
    const k = Math.round(L);
    if (k !== 0 && Math.abs(L - k) < 0.02) {
      return { correct: false, errorType: 'nullen', points: 0, timeFactor: tf };
    }
  }
  if (expected !== 0 && diff / Math.abs(expected) <= 0.1) {
    return { correct: false, errorType: 'knapp', points: Math.round(20 * task.weight), timeFactor: tf };
  }
  return { correct: false, errorType: 'falsch', points: 0, timeFactor: tf };
}

// Lernstand-Modell (Skill, Stufe, Schwächen): packages/learning-engine. Hier nur die App-Sicht darauf – Katalog,
// aktive Kategorien und Texte (Name, Diagnose, Tipp). Bewertung einer Antwort (evaluate) bleibt App-Sache.

export function skill(attempts: Attempt[] | null | undefined, window = DEFAULT_CONFIG.window): SkillStats {
  return skillStats(attempts || [], DEFAULT_CONFIG, window);
}

// Schwierigkeit für einen Subtyp: setting 'auto' | 1 | 2 | 3
export function levelFor(subtypeId: SubtypeId, attempts: Attempt[] | null | undefined, setting: DifficultySetting | string | number = 'auto'): Level {
  const n = Number(setting);
  if (n === 1 || n === 2 || n === 3) return n;
  return adaptiveLevel(subtypeId, attempts || []);
}

export function categoryStats(attempts: Attempt[] | null | undefined): Record<string, SkillStats> {
  return statsBy(attempts || [], 'category', CATEGORIES.map((c) => c.id));
}

export function subtypeStats(attempts: Attempt[] | null | undefined): Record<string, SkillStats> {
  return statsBy(attempts || [], 'subtype', Object.keys(SUBTYPES));
}

export function overall(attempts: Attempt[] | null | undefined): SkillStats {
  return overallStats(attempts || []);
}

export function weaknesses(
  attempts: Attempt[] | null | undefined,
  limit = 3,
  { enabledCategories = null }: { enabledCategories?: CategoryId[] | null } = {},
): Weakness[] {
  const found = findDeficits(attempts || [], { catalog: SUBTYPES, categories: activeCategoryIds(enabledCategories), limit });
  return found.map((d): Weakness => {
    const s = SUBTYPES[d.subtype];
    return {
      ...d,
      category: d.category as CategoryId,
      name: s?.name ?? d.subtype,
      categoryName: CATEGORIES.find((c) => c.id === d.category)?.name ?? d.category,
      label: t(`core.label.${d.reason}`),
      tip: s?.tip ?? '',
    };
  });
}

export function errorPatterns(attempts: Attempt[] | null | undefined): ErrorPatterns {
  return countErrors(attempts || []);
}

export interface SessionSummary { n: number; correct: number; accuracy: number; points: number; avgTimeMs: number }

export function sessionSummary(attempts: Attempt[] | null | undefined): SessionSummary {
  const list = attempts || [];
  const n = list.length;
  const correct = list.filter((a) => a.correct).length;
  return {
    n,
    correct,
    accuracy: n ? correct / n : 0,
    points: list.reduce((s, a) => s + (a.points || 0), 0),
    avgTimeMs: mean(list.map((a) => a.timeMs)),
  };
}
