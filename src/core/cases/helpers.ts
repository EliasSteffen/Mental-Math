// Gemeinsame Bausteine der Case-Vorlagen: Schritte, Geldbeträge, Auswahl aus Kandidaten.
import { t } from '../../i18n/index.ts';
import { fmt, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import type { CaseChoiceStep, CaseNumberStep } from './types.ts';

type Scale = 'mio' | 'tsd' | 'eur';

/** Geldbetrag als Text: „144 Mio. €“ bzw. „€144M“. */
export function money(scale: Scale, v: number): string {
  return t(`cases.money.${scale}`, { v: fmt(v) });
}

/** Text mit Platzhaltern; Zahlen werden vorher mit fmt() formatiert. */
export const ct = (key: string, params?: Record<string, string | number>): string =>
  t(`cases.${key}` as `cases.${string}`, params);

/** Lösungsweg-Zeilen: ein Text, Zeilen durch „|“ getrennt. */
export const lines = (key: string, params?: Record<string, string | number>): string[] => ct(key, params).split('|');

interface NumOpts {
  prompt: string;
  expected: number;
  unit: string;
  solution: string[];
  hint?: string;
  abs?: number;
  rel?: number;
  targetMs?: number;
}

export function numStep(o: NumOpts): CaseNumberStep {
  return {
    kind: 'number', prompt: o.prompt, expected: round(o.expected, 4), tol: { abs: o.abs ?? 0, rel: o.rel ?? 0 },
    unit: o.unit, ...(o.hint ? { hint: o.hint } : {}), targetMs: o.targetMs ?? 30000, solution: o.solution,
  };
}

export function choiceStep(o: { prompt: string; choices: string[]; correctIndex: number; why: string; targetMs?: number }): CaseChoiceStep {
  return { kind: 'choice', prompt: o.prompt, choices: o.choices, correctIndex: o.correctIndex, why: o.why, targetMs: o.targetMs ?? 30000 };
}

/** Ein Element zufällig wählen (rng deterministisch). */
export function pickOne<T>(xs: readonly T[], rng: Rng): T {
  if (xs.length === 0) throw new Error('Keine Kandidaten');
  return xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))] as T;
}

/** Höchstens `d` Nachkommastellen? */
export const hasDecimals = (x: number, d: number): boolean => Math.abs(round(x, d) - x) < 1e-9;

/**
 * Runde Schwelle (Mindestumsatz, Grenze …) in der Nähe von `value`: mindestens `minDev` darunter oder darüber,
 * ganzzahlig und „case-freundlich“ (Schritte 1, 2, 5 · 10^k). null, wenn keine passt.
 */
export function niceThreshold(value: number, rng: Rng, minDev = 0.12): number | null {
  if (!(value > 0)) return null;
  const m = 10 ** Math.floor(Math.log10(value));
  const lead = value / m;
  const step = Math.max(1, lead < 3 ? m / 5 : m / 2);
  const factors = [0.6, 0.7, 0.75, 0.8, 1.25, 1.3, 1.4, 1.6];
  // deterministisch mischen
  const order = factors.map((f) => [rng(), f] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const f of order) {
    const th = Math.round((value * f) / step) * step;
    if (th > 0 && Math.abs(th - value) / value >= minDev) return th;
  }
  return null;
}

/** Ab einem zufälligen Startpunkt den ersten Kandidaten nehmen, für den `build` ein Ergebnis liefert. */
export function pickBuilt<C, R>(cands: readonly C[], rng: Rng, build: (c: C) => R | null): R {
  const n = cands.length;
  const start = Math.min(n - 1, Math.floor(rng() * n));
  for (let i = 0; i < n; i++) {
    const r = build(cands[(start + i) % n] as C);
    if (r !== null) return r;
  }
  throw new Error('Kein passender Kandidat');
}
