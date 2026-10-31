import type { Task } from '../../types.ts';
import { getLang, t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { fmt, round } from '../numbers.ts';
import { p10 } from '../units.ts';
import { FACTS } from '../generators/mag.ts';
import type { SP, StepFn } from './helpers.ts';

// Gespeicherte Anzeige-Werte sind deutsch formatiert („8,2 Mrd.“) → für andere Sprachen Zahlen und Einheiten umsetzen
const localVal = (v: string): string => (getLang() === 'de' ? v : lw(v.replace(/\d[\d.,]*/g, (m) => {
  const num = parseFloat(m.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(num) ? fmt(num) : m;
})));

export const magSteps: Record<string, StepFn> = {
  'mag.exponent': (p: SP) => {
    const { a, k, e, n, u, disp } = p, F = (v: number): string => fmt(v, 4);
    const result = t('sol.result', { r: `${F(a)} × ${p10(n)} → n = ${F(n)}` });
    if (u) {
      const m = F(round(a * 10 ** k, 6));
      return [
        t('sol.mag.goal'),
        t('sol.mag.unit', { u: lw(u), pe: p10(e), disp, m }),
        t(k === 0 ? 'sol.mag.shift0' : k > 0 ? 'sol.mag.shiftL' : 'sol.mag.shiftR', { m, a: F(a), pk: p10(k), k: Math.abs(k) }),
        t('sol.mag.addE', { a: F(k), b: e, c: F(n) }),
        result,
      ];
    }
    return [
      t('sol.mag.goal'),
      t('sol.mag.move', { disp, a: F(a) }),
      t(n >= 0 ? 'sol.mag.movedL' : 'sol.mag.movedR', { n: Math.abs(n) }),
      result,
    ];
  },

  'mag.facts': (p: SP) => {
    const F = (v: number): string => fmt(v, 4);
    const idx = FACTS.findIndex((f) => f[0] === p.fact);
    const label = idx >= 0 ? t(`core.fact.${idx}`) : p.fact;
    const v = localVal(String(p.v));
    return [
      `${label} ≈ ${v}`,
      t('sol.mag.asPow', { a: F(p.a), pn: p10(p.n) }),
      t('sol.mag.hint', { v, d: F(p.n + 1) }),
      t('sol.result', { r: `n = ${F(p.n)}` }),
    ];
  },

  'mag.product': (p: SP) => {
    const F = (v: number): string => fmt(v, 4), P = (v: number): string => (v < 0 ? `(${F(v)})` : F(v));
    const m = round(p.a1 * p.a2, 4), s = p.p1 + p.p2, carry = m >= 10;
    return [
      t('sol.mag.both', { d1: p.d1, a1: F(p.a1), p1: p10(p.p1), d2: p.d2, a2: F(p.a2), p2: p10(p.p2) }),
      t('sol.mag.mulM', { a1: F(p.a1), a2: F(p.a2), m: F(m) }),
      t('sol.mag.addE', { a: P(p.p1), b: P(p.p2), c: F(s) }),
      carry ? t('sol.mag.carry', { m: F(m), m10: F(m / 10), s1: F(s + 1) }) : t('sol.mag.noCarry', { m: F(m) }),
      t('sol.result', { r: `${F(carry ? m / 10 : m)} × ${p10(s + (carry ? 1 : 0))} → n = ${F(s + (carry ? 1 : 0))}` }),
    ];
  },

  'mag.ratio': (p: SP) => {
    const F = (v: number): string => fmt(v, 4), P = (v: number): string => (v < 0 ? `(${F(v)})` : F(v));
    const m = p.a1 / p.a2, s = p.p1 - p.p2, borrow = p.a1 < p.a2, n = s - (borrow ? 1 : 0);
    return [
      t('sol.mag.both', { d1: p.d1, a1: F(p.a1), p1: p10(p.p1), d2: p.d2, a2: F(p.a2), p2: p10(p.p2) }),
      t('sol.mag.divM', { a1: F(p.a1), a2: F(p.a2), m: fmt(m, 2) }),
      t('sol.mag.subE', { a: P(p.p1), b: P(p.p2), c: F(s) }),
      borrow ? t('sol.mag.borrow', { m: fmt(m, 2), m10: fmt(m * 10, 2), n: F(n) }) : t('sol.mag.noBorrow', { m: fmt(m, 2) }),
      t('sol.result', { r: `${fmt(borrow ? m * 10 : m, 2)} × ${p10(n)} → n = ${F(n)}` }),
    ];
  },

};
