// Geführter Lernmodus: guidedSteps(task) → strukturierte Schritte (Erklärung, Rechnung, Zwischenergebnis, Grafik).
// Nur für ausgewählte Aufgabentypen; alle anderen nutzen weiter die Text-Schritte aus solutionSteps() (Fallback).
import type { Task } from '../../types.ts';
import { unitFactor } from '../numbers.ts';
import type { SP } from './helpers.ts';
import type { GuidedFn, GuidedStep } from './guided-types.ts';
import { guidedTricks } from './guided-tricks.ts';
import { guidedCalc } from './guided-calc.ts';

export type { ExprPart, GuidedStep, Visual } from './guided-types.ts';
export { exprText } from './guided-types.ts';

const G: Record<string, GuidedFn> = { ...guidedTricks, ...guidedCalc };

/** Aufgabentypen mit geführtem Lernmodus. */
export const GUIDED_SUBTYPES: readonly string[] = Object.keys(G);

export function hasGuided(subtypeId: string): boolean {
  return Object.hasOwn(G, subtypeId);
}

/** Strukturierte Schritte; [] ohne geführten Modus, ohne params oder bei einem Fehler. */
export function guidedSteps(task: Task | null | undefined): GuidedStep[] {
  try {
    const fn = task && Object.hasOwn(G, task.subtype) ? G[task.subtype] : undefined;
    const p: unknown = task?.params;
    if (!task || !fn || !p || typeof p !== 'object' || !Object.keys(p).length) return [];
    const out = fn(p as SP, task);
    return Array.isArray(out) ? out.filter((s) => s && typeof s.text === 'string' && s.text !== '') : [];
  } catch {
    return [];
  }
}

/** Stimmt die Eingabe für einen Schritt? Toleranz des Schritts; „120 Mio.“ zählt bei Einheit Mio. wie „120“. */
export function stepCorrect(step: GuidedStep, given: number | null | undefined): boolean {
  if (step.expected === undefined || given === null || given === undefined || !Number.isFinite(given)) return false;
  const tol = (step.tolerance ?? 0) + 1e-9;
  const f = unitFactor(step.unit ?? '');
  const candidates = f > 1 ? [given, given / f] : [given];
  return candidates.some((c) => Math.abs(c - (step.expected as number)) <= tol);
}
