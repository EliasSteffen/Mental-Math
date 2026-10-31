// Lösungswege fürs Kopfrechnen: solutionSteps(task) → string[] (3–6 kurze Schritte in der UI-Sprache, Texte im Namespace 'sol')
import type { Task } from '../../types.ts';
import type { SP, StepFn } from './helpers.ts';
import { tableSteps } from './table.ts';
import { multSteps } from './mult.ts';
import { divSteps } from './div.ts';
import { bigSteps } from './big.ts';
import { pctSteps } from './pct.ts';
import { fracSteps } from './frac.ts';
import { growthSteps } from './growth.ts';
import { bizSteps } from './biz.ts';
import { estSteps } from './est.ts';
import { unitsSteps } from './units.ts';
import { magSteps } from './mag.ts';
import { tricksSteps } from './tricks.ts';
import { exhibitSteps } from './exhibit.ts';
import { customSteps } from './custom.ts';

const S: Record<string, StepFn> = {
  ...tableSteps, ...multSteps, ...divSteps, ...bigSteps, ...pctSteps, ...fracSteps, ...growthSteps, ...bizSteps, ...estSteps, ...unitsSteps, ...magSteps, ...tricksSteps, ...exhibitSteps, ...customSteps,
};

export function solutionSteps(task: Task | null | undefined): string[] {
  try {
    const fn = task ? S[task.subtype] : undefined;
    const p: unknown = task?.params;
    if (!task || !fn || !p || typeof p !== 'object' || !Object.keys(p).length) return [];
    const out: unknown = fn(p as SP, task);
    return Array.isArray(out) ? out.filter((x): x is string => typeof x === 'string' && x !== '') : [];
  } catch {
    return [];
  }
}
