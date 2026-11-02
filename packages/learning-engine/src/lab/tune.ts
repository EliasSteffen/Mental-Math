// Tuning: Raster über Parameter, jede Kombination bewerten, die besten zuerst.
import { resolveConfig, type EngineConfig } from '../config.ts';
import { simulateDetection, type DetectionOptions } from './simulate.ts';

export interface GridResult<P> { params: P; value: number }

/** Alle Kombinationen eines Rasters ({ a: [1, 2], b: [x] } → [{a:1,b:x}, {a:2,b:x}]). */
export function cartesian<P extends object>(space: { [K in keyof P]: readonly P[K][] }): P[] {
  let out: Array<Partial<P>> = [{}];
  for (const key of Object.keys(space) as Array<keyof P>) {
    const values = space[key];
    out = out.flatMap((partial) => values.map((v) => ({ ...partial, [key]: v })));
  }
  return out as P[];
}

/** Jede Kombination bewerten; sortiert nach `value` (größer = besser, außer minimize). */
export function gridSearch<P extends object>(
  space: { [K in keyof P]: readonly P[K][] },
  objective: (params: P) => number,
  { minimize = false }: { minimize?: boolean } = {},
): GridResult<P>[] {
  const results = cartesian(space).map((params) => ({ params, value: objective(params) }));
  return results.sort((a, b) => (minimize ? a.value - b.value : b.value - a.value));
}

export type ConfigSpace = { [K in keyof EngineConfig]?: readonly EngineConfig[K][] };

/**
 * Konfiguration für die Schwächen-Erkennung suchen: Ziel ist der F1-Wert (Treffer und Fehlalarme ausgewogen) an einem
 * Prüfzeitpunkt der Simulation. Ungültige Kombinationen (z. B. level2Score > level3Score) werden übersprungen.
 */
export function tuneDetection(
  space: ConfigSpace,
  { checkpoint = 15, ...sim }: DetectionOptions & { checkpoint?: number } = {},
): GridResult<Partial<EngineConfig>>[] {
  return gridSearch(space as { [K in keyof Partial<EngineConfig>]: readonly Partial<EngineConfig>[K][] }, (patch) => {
    let cfg: EngineConfig;
    try { cfg = resolveConfig(patch); } catch { return -Infinity; }
    const report = simulateDetection({ ...sim, cfg, checkpoints: [checkpoint] });
    return report.checkpoints[0]?.overall.f1 ?? 0;
  }).filter((r) => Number.isFinite(r.value));
}
