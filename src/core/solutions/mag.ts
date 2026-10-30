import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { p10 } from '../units.ts';
import type { SP, StepFn } from './helpers.ts';

export const magSteps: Record<string, StepFn> = {
  'mag.exponent': (p: SP, task: Task) => {
    const { a, k, e, n, u, disp } = p, F = (v: number) => fmt(v, 4);
    const goal = 'Ziel: a × 10ⁿ mit genau einer Ziffer 1–9 vor dem Komma';
    if (u) {
      const m = F(round(a * 10 ** k, 6));
      return [
        goal,
        `${u} = ${p10(e)}, also ${disp} = ${m} × ${p10(e)}`,
        `${m} = ${F(a)} × ${p10(k)} (Komma ${k === 0 ? 'ist schon richtig' : k > 0 ? `${k} Stelle(n) nach links` : `${-k} Stelle(n) nach rechts`})`,
        `Exponenten addieren: ${F(k)} + ${e} = ${F(n)}`,
        `Ergebnis: ${F(a)} × ${p10(n)} → n = ${F(n)}`,
      ];
    }
    return [
      goal,
      `Komma verschieben, bis genau eine Ziffer ≠ 0 vor dem Komma steht: ${disp} → ${F(a)}`,
      n >= 0 ? `Komma ${n} Stellen nach links geschoben → große Zahl, n positiv` : `Komma ${-n} Stellen nach rechts geschoben → kleine Zahl, n negativ`,
      `Ergebnis: ${F(a)} × ${p10(n)} → n = ${F(n)}`,
    ];
  },

  'mag.facts': (p: SP) => {
    const F = (v: number) => fmt(v, 4);
    return [
      `${p.fact} ≈ ${p.v}`,
      `Als a × 10ⁿ geschrieben: ${F(p.a)} × ${p10(p.n)}`,
      `Merkhilfe: n = Anzahl Stellen vor dem Komma − 1 (bei ${p.v}: ${F(p.n + 1)} − 1)`,
      `Ergebnis: n = ${F(p.n)}`,
    ];
  },

  'mag.product': (p: SP) => {
    const F = (v: number) => fmt(v, 4), P = (v: number) => (v < 0 ? `(${F(v)})` : F(v));
    const m = round(p.a1 * p.a2, 4), s = p.p1 + p.p2, carry = m >= 10;
    return [
      `Beide als a × 10ⁿ: ${p.d1} = ${F(p.a1)} × ${p10(p.p1)} und ${p.d2} = ${F(p.a2)} × ${p10(p.p2)}`,
      `Mantissen multiplizieren: ${F(p.a1)} × ${F(p.a2)} = ${F(m)}`,
      `Exponenten addieren: ${P(p.p1)} + ${P(p.p2)} = ${F(s)}`,
      carry ? `${F(m)} ist ≥ 10 → ${F(m)} = ${F(m / 10)} × 10 → Exponent + 1 = ${F(s + 1)}` : `${F(m)} liegt zwischen 1 und 10 → kein Übertrag`,
      `Ergebnis: ${F(carry ? m / 10 : m)} × ${p10(s + (carry ? 1 : 0))} → n = ${F(s + (carry ? 1 : 0))}`,
    ];
  },

  'mag.ratio': (p: SP) => {
    const F = (v: number) => fmt(v, 4), P = (v: number) => (v < 0 ? `(${F(v)})` : F(v));
    const m = p.a1 / p.a2, s = p.p1 - p.p2, borrow = p.a1 < p.a2, n = s - (borrow ? 1 : 0);
    return [
      `Beide als a × 10ⁿ: ${p.d1} = ${F(p.a1)} × ${p10(p.p1)} und ${p.d2} = ${F(p.a2)} × ${p10(p.p2)}`,
      `Mantissen teilen: ${F(p.a1)} ÷ ${F(p.a2)} ≈ ${fmt(m, 2)}`,
      `Exponenten subtrahieren: ${P(p.p1)} − ${P(p.p2)} = ${F(s)}`,
      borrow ? `${fmt(m, 2)} ist < 1 → ${fmt(m, 2)} = ${fmt(m * 10, 2)} × 10⁻¹ → Exponent − 1 = ${F(n)}` : `${fmt(m, 2)} liegt zwischen 1 und 10 → keine Korrektur`,
      `Ergebnis: ${fmt(borrow ? m * 10 : m, 2)} × ${p10(n)} → n = ${F(n)}`,
    ];
  },

};
