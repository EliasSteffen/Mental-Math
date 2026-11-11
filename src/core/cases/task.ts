// Case-Schritt als Task-Objekt, damit evaluate(), createAnswer() und diagnose() unverändert gelten.
import type { Task } from '../../types.ts';
import type { CaseStep } from './types.ts';

export function stepTask(step: CaseStep, templateId: string, index: number): Task {
  const base = {
    id: `case-${templateId}-${index}`,
    category: 'biz' as const,
    subtype: `case.${templateId}`,
    prompt: step.prompt,
    params: {},
    targetMs: step.targetMs,
    weight: 1,
    level: 2 as const,
  };
  if (step.kind === 'choice') {
    return { ...base, kind: 'choice', choices: step.choices, expected: step.correctIndex, unit: '', hint: '', tolerance: { abs: 0, rel: 0 } };
  }
  return { ...base, expected: step.expected, unit: step.unit, hint: step.hint ?? '', tolerance: step.tol };
}
