// Schwächen finden: Aufgabentypen mit genug Antworten, aber Score unter der Schwelle – mit Diagnose, warum.
import type { Catalog, Deficit, DeficitReason, ErrorPatterns, Observation, SkillStats } from './types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from './config.ts';
import { groupBy, skillStats } from './skill.ts';

export interface DeficitOptions {
  /** Aufgabentyp → Kategorie und Zielzeit; Antworten zu unbekannten Typen zählen nicht. */
  catalog: Catalog;
  /** Nur Aufgabentypen dieser Kategorien (null/undefined = alle). */
  categories?: ReadonlySet<string> | null;
  /** Höchstens so viele (Standard 3; Infinity = alle). */
  limit?: number;
}

/** Diagnose: wiederholte Nullen-Fehler vor Ungenauigkeit vor Tempo. */
export function diagnose(recent: readonly Observation[], stats: SkillStats, cfg: EngineConfig = DEFAULT_CONFIG): DeficitReason {
  const zeros = recent.filter((o) => o.errorType === 'nullen').length;
  if (zeros >= cfg.zeroErrorMin) return 'nullen';
  return stats.accuracy < cfg.accuracyFloor ? 'ungenau' : 'langsam';
}

/** Schwächen, die schwächste zuerst (bei gleichem Score in Reihenfolge des ersten Auftretens). */
export function findDeficits(
  observations: readonly Observation[],
  { catalog, categories = null, limit = 3 }: DeficitOptions,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Deficit[] {
  const out: Deficit[] = [];
  for (const [subtype, list] of groupBy(observations, 'subtype')) {
    const entry = Object.prototype.hasOwnProperty.call(catalog, subtype) ? catalog[subtype] : undefined;
    if (!entry || (categories && !categories.has(entry.category))) continue;
    const stats = skillStats(list, cfg);
    if (stats.n < cfg.minAttempts || stats.score === null || stats.score >= cfg.deficitScore) continue;
    out.push({
      ...stats,
      subtype,
      category: entry.category,
      targetMs: entry.targetMs,
      reason: diagnose(list.slice(-cfg.window), stats, cfg),
    });
  }
  out.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  return out.slice(0, limit);
}

/** Fehler nach Art zählen. */
export function errorPatterns(observations: readonly Pick<Observation, 'errorType'>[]): ErrorPatterns {
  const r: ErrorPatterns = { nullen: 0, knapp: 0, falsch: 0, skip: 0 };
  for (const o of observations) if (o.errorType && o.errorType in r) r[o.errorType]++;
  return r;
}
