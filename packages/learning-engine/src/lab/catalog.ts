// Kataloge fürs Labor: synthetisch (unabhängig von der App) oder aus echten Daten abgeleitet.
import type { Catalog, CatalogEntry, Observation } from '../types.ts';

/** `categories` Kategorien mit je `perCategory` Aufgabentypen ('c0.t0', 'c0.t1', …), alle mit derselben Zielzeit. */
export function syntheticCatalog({ categories = 6, perCategory = 4, targetMs = 10_000 } = {}): Catalog {
  const out: Record<string, CatalogEntry> = {};
  for (let c = 0; c < categories; c++) {
    for (let s = 0; s < perCategory; s++) out[`c${c}.t${s}`] = { category: `c${c}`, targetMs };
  }
  return out;
}

/** Katalog aus vorhandenen Antworten (z. B. einem Export der App): Kategorie und häufigste Zielzeit je Aufgabentyp. */
export function catalogFromObservations(observations: readonly Observation[]): Catalog {
  const seen = new Map<string, { category: string; targets: Map<number, number> }>();
  for (const o of observations) {
    const e = seen.get(o.subtype) ?? { category: o.category, targets: new Map<number, number>() };
    e.targets.set(o.targetMs, (e.targets.get(o.targetMs) ?? 0) + 1);
    seen.set(o.subtype, e);
  }
  const out: Record<string, CatalogEntry> = {};
  for (const [id, e] of seen) {
    let targetMs = 0;
    let best = -1;
    for (const [t, n] of e.targets) if (n > best) { best = n; targetMs = t; }
    out[id] = { category: e.category, targetMs };
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ERROR_TYPES = new Set(['nullen', 'knapp', 'falsch', 'skip']);

/**
 * Antworten aus einem Export der App (`{ attempts: [...] }`) oder einer reinen Liste. Unvollständige Einträge fallen
 * weg; das Ergebnis ist zeitlich sortiert. `skipped` zählt die verworfenen.
 */
export function loadObservations(data: unknown): { observations: Observation[]; skipped: number } {
  const list: unknown[] = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.attempts) ? data.attempts : [];
  const observations: Observation[] = [];
  for (const a of list) {
    if (!isObj(a)) continue;
    const { ts, subtype, category, correct, timeMs, targetMs, errorType } = a;
    if (typeof ts !== 'number' || typeof subtype !== 'string' || typeof category !== 'string' || typeof correct !== 'boolean') continue;
    if (typeof timeMs !== 'number' || typeof targetMs !== 'number' || !(targetMs > 0)) continue;
    observations.push({
      ts, subtype, category, correct, timeMs, targetMs,
      errorType: typeof errorType === 'string' && ERROR_TYPES.has(errorType) ? (errorType as Observation['errorType']) : null,
      assisted: a.assisted === true,
      untimed: a.untimed === true,
      isReview: a.isReview === true,
      ...(a.level === 1 || a.level === 2 || a.level === 3 ? { level: a.level } : {}),
    });
  }
  observations.sort((x, y) => x.ts - y.ts);
  return { observations, skipped: list.length - observations.length };
}
