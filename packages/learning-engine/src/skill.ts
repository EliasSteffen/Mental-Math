// Skill: Genauigkeit und Tempo der letzten Antworten → Score 0..100; daraus die adaptive Stufe.
import type { Level, Observation, SkillStats } from './types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from './config.ts';

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Anrechnung einer Antwort: 1 richtig, assistedCredit richtig mit Hilfe, 0 falsch. */
export function credit(o: Pick<Observation, 'correct' | 'assisted'>, cfg: EngineConfig = DEFAULT_CONFIG): number {
  return o.correct ? (o.assisted ? cfg.assistedCredit : 1) : 0;
}

/** Tempo einer richtigen, gemessenen Antwort: Zielzeit/Zeit, höchstens 1 (schneller als das Ziel bringt nichts extra). */
export function paceOf(o: Pick<Observation, 'timeMs' | 'targetMs'>): number {
  return Math.min(1, o.targetMs / o.timeMs);
}

/** Lernstand aus den letzten `window` Antworten (Reihenfolge = zeitlich, älteste zuerst). */
export function skillStats(
  observations: readonly Observation[],
  cfg: EngineConfig = DEFAULT_CONFIG,
  window: number = cfg.window,
): SkillStats {
  const list = observations.slice(-window);
  const n = list.length;
  if (n === 0) return { n: 0, accuracy: 0, speed: 0, score: null, avgTimeMs: 0, avgTargetMs: 0 };
  const accuracy = list.reduce((sum, o) => sum + credit(o, cfg), 0) / n;
  const timed = list.filter((o) => !o.untimed);
  const timedRight = timed.filter((o) => o.correct);
  const speed = timedRight.length ? mean(timedRight.map(paceOf)) : 0;
  return {
    n,
    accuracy,
    speed,
    score: n < cfg.minAttempts ? null : Math.round(100 * (cfg.accuracyWeight * accuracy + cfg.speedWeight * speed)),
    avgTimeMs: mean(timed.map((o) => o.timeMs)),
    avgTargetMs: mean(timed.map((o) => o.targetMs)),
  };
}

/** Antworten nach Aufgabentyp oder Kategorie gruppieren (Reihenfolge je Gruppe bleibt; Gruppen in Reihenfolge des ersten Auftretens). */
export function groupBy(observations: readonly Observation[], key: 'subtype' | 'category'): Map<string, Observation[]> {
  const g = new Map<string, Observation[]>();
  for (const o of observations) {
    const list = g.get(o[key]);
    if (list) list.push(o);
    else g.set(o[key], [o]);
  }
  return g;
}

/** Skill je ID (Aufgabentyp oder Kategorie); IDs ohne Antworten bekommen leere Werte. */
export function statsBy(
  observations: readonly Observation[],
  key: 'subtype' | 'category',
  ids: readonly string[],
  cfg: EngineConfig = DEFAULT_CONFIG,
): Record<string, SkillStats> {
  const g = groupBy(observations, key);
  return Object.fromEntries(ids.map((id) => [id, skillStats(g.get(id) ?? [], cfg)]));
}

/** Gesamt-Skill über alle Aufgabentypen (größeres Fenster). */
export function overallStats(observations: readonly Observation[], cfg: EngineConfig = DEFAULT_CONFIG): SkillStats {
  return skillStats(observations, cfg, cfg.overallWindow);
}

/** Stufe zu einem Score: ohne Score oder darunter 1, ab level2Score 2, ab level3Score 3. */
export function levelFromScore(score: number | null, cfg: EngineConfig = DEFAULT_CONFIG): Level {
  if (score === null || score < cfg.level2Score) return 1;
  return score >= cfg.level3Score ? 3 : 2;
}

/** Adaptive Stufe eines Aufgabentyps aus dessen bisherigen Antworten. */
export function adaptiveLevel(subtype: string, observations: readonly Observation[], cfg: EngineConfig = DEFAULT_CONFIG): Level {
  return levelFromScore(skillStats(observations.filter((o) => o.subtype === subtype), cfg).score, cfg);
}
