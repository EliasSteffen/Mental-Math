// Gemeinsame Test-Helfer (kein *.test.ts, wird nicht als Test ausgeführt)
import type { ChoiceTask, NumberTask, Task } from '../src/types.ts';

/** Minimale Zahl-Aufgabe mit überschreibbaren Feldern */
export function mkTask(o: Partial<NumberTask> = {}): NumberTask {
  return {
    id: 't', category: 'mult', subtype: 'mult.2x1', prompt: '', unit: '', hint: '', params: {},
    expected: 408, tolerance: { abs: 0, rel: 0 }, targetMs: 10000, weight: 1, level: 2,
    ...o,
  };
}

export function isChoice(t: Task): t is ChoiceTask {
  return t.kind === 'choice';
}

/** Auswahl-Aufgabe erzwingen (schlägt sonst fehl) */
export function asChoice(t: Task): ChoiceTask {
  if (t.kind !== 'choice') throw new Error(`keine Auswahl-Aufgabe: ${t.subtype}`);
  return t;
}
