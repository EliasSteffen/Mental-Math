// Empfehlung für die nächste Runde: erst fällige Wiederholungen, dann die größte Schwäche, dann ein noch nie geübter
// Aufgabentyp, sonst eine gemischte Runde.
import type { Catalog, NextStep, Observation, Reviews } from './types.ts';
import { DEFAULT_CONFIG, type EngineConfig } from './config.ts';
import { findDeficits } from './deficits.ts';
import { dueReviews } from './review.ts';

export interface NextStepOptions {
  /** Katalog; seine Reihenfolge bestimmt, welcher neue Aufgabentyp zuerst kommt. */
  catalog: Catalog;
  /** Aktive Kategorien für Wiederholung und Schwächen (null/undefined = alle). */
  categories?: ReadonlySet<string> | null;
  /** Kategorien, aus denen Neues vorgeschlagen wird, in dieser Reihenfolge (z. B. ohne Drills). */
  newCategories: readonly string[];
}

export function nextStep(
  observations: readonly Observation[],
  reviews: Reviews | null | undefined,
  now: number,
  { catalog, categories = null, newCategories }: NextStepOptions,
  cfg: EngineConfig = DEFAULT_CONFIG,
): NextStep {
  const known = (subtype: string): boolean => Object.prototype.hasOwnProperty.call(catalog, subtype);
  const due = dueReviews(reviews, now).filter((r) => {
    const entry = known(r.subtype) ? catalog[r.subtype] : undefined;
    return Boolean(entry && (!categories || categories.has(entry.category)));
  });
  if (due.length) return { kind: 'review', due };

  const deficit = findDeficits(observations, { catalog, categories, limit: 1 }, cfg)[0];
  if (deficit) return { kind: 'weak', deficit };

  const seen = new Set(observations.map((o) => o.subtype));
  const entries = Object.entries(catalog);
  for (const category of newCategories) {
    const fresh = entries.find(([id, e]) => e.category === category && !seen.has(id));
    if (fresh) return { kind: 'new', subtype: fresh[0] };
  }
  return { kind: 'mixed' };
}
