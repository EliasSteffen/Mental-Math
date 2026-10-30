// Gemeinsame Helfer der Generatoren
import type { ChoiceTask, Level, NumberTask, Params, Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { SUBTYPES } from '../catalog.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';

/** Generator eines Subtyps: (rng, normalisiertes Level) → Aufgabe */
export type Gen = (rng: Rng, L: Level) => Task;

export const lv = <T>(level: Level, a: T, b: T, c: T): T => (level === 1 ? a : level === 3 ? c : b);

const randomId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

interface TaskOpts {
  prompt: string;
  params?: Params;
  unit?: string;
  hint?: string;
  expected: number;
  abs?: number;
  rel?: number;
}

export function task(id: string, o: TaskOpts): NumberTask {
  const s = SUBTYPES[id];
  if (!s) throw new Error(`Unbekannter Aufgabentyp: ${id}`);
  return {
    id: randomId(),
    category: s.category,
    subtype: id,
    prompt: o.prompt,
    params: o.params || {},
    unit: o.unit || '',
    hint: o.hint || '',
    expected: round(o.expected, 4),
    tolerance: { abs: o.abs || 0, rel: o.rel || 0 },
    targetMs: s.targetMs,
    weight: s.weight,
    level: 2,
  };
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

interface ChoiceOpts {
  prompt: string;
  correct: string;
  distractors: string[];
  params?: Params;
  hint?: string;
}

// Auswahl-Aufgabe: richtige Option + 3 Distraktoren, gemischt; expected = Index der richtigen Option
export function choiceTask(id: string, rng: Rng, { prompt, correct, distractors, params = {}, hint = '' }: ChoiceOpts): ChoiceTask {
  const wrong: string[] = [];
  for (const d of distractors) if (d !== correct && !wrong.includes(d)) wrong.push(d);
  const choices = shuffle([correct, ...wrong.slice(0, 3)], rng);
  const c = Object.fromEntries(choices.map((x, i) => ['c' + i, x]));
  const base = task(id, { prompt, hint, expected: choices.indexOf(correct), params: { ...params, ...c } });
  return { ...base, kind: 'choice', choices };
}

export const isInt = (x: number): boolean => Math.abs(x - Math.round(x)) < 1e-9;
export const decHint = (x: number): string => (isInt(x) ? '' : t('core.hint.places.one'));

// Hinweis mit der tatsächlichen Stellenzahl (z. B. 0,78 → „auf 2 Nachkommastellen“)
export function placesHint(x: number): string {
  const s = String(round(x, 4));
  const d = s.includes('.') ? (s.split('.')[1] ?? '').length : 0;
  return d === 0 ? '' : d === 1 ? t('core.hint.places.one') : t('core.hint.places.many', { n: d });
}
export const pctHint = (): string => t('core.hint.tol3');

export const UNIT_VALUE: Record<string, number> = { 'Tsd.': 1e3, 'Mio.': 1e6, 'Mrd.': 1e9 };

// Große Zahl als Mantisse + Einheit (ab 1 Mio.), sonst ausgeschrieben
export function bigStr(v: number): string {
  if (v >= 1e9) return fmt(v / 1e9) + ' ' + lw('Mrd.');
  if (v >= 1e6) return fmt(v / 1e6) + ' ' + lw('Mio.');
  return fmt(v);
}
