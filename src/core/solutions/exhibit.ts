import { t } from '../../i18n/index.ts';
import { fmt, round } from '../numbers.ts';
import { gcd, pc } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

const list = (s: string): string[] => (s ? s.split('|') : []);
const nums = (s: string): number[] => list(s).map(Number);
const pct = (x: number): string => pc(round(x, 1));

export const exhibitSteps: Record<string, StepFn> = {
  'exhibit.share': ({ lab, s1, k }: SP) => {
    const vals = nums(s1), seg = list(lab)[k] ?? '', v = vals[k] ?? 0;
    const total = vals.reduce((a, b) => a + b, 0), share = (v / total) * 100;
    const g = gcd(v, total);
    return [
      t('sol.ex.total', { sum: vals.map(fmt).join(' + '), total: fmt(total) }),
      t('sol.ex.share', { seg, v: fmt(v), total: fmt(total) }),
      g > 1 ? t('sol.ex.reduce', { a: fmt(v), b: fmt(total), c: fmt(v / g), d: fmt(total / g) }) : null,
      `${Number.isInteger(round(share, 4)) ? '=' : '≈'} ${pct(share)}`,
    ].filter((x): x is string => x !== null);
  },

  'exhibit.growth': ({ lab, s1, k, k2 }: SP) => {
    const years = list(lab), vals = nums(s1);
    const a = vals[k] ?? 0, b = vals[k2] ?? 0, d = b - a, gr = (d / a) * 100;
    return [
      t('sol.ex.read', { y1: years[k] ?? '', a: fmt(a), y2: years[k2] ?? '', b: fmt(b) }),
      t('sol.ex.diff', { a: fmt(a), b: fmt(b), d: fmt(d) }),
      t('sol.ex.rel', { d: fmt(d), a: fmt(a) }),
      `${Number.isInteger(round(gr, 4)) ? '=' : '≈'} ${pct(gr)}`,
    ];
  },

  'exhibit.mix': ({ s1, s2 }: SP) => {
    const shares = nums(s1), prices = nums(s2);
    const parts = shares.map((s, i) => round((s * (prices[i] ?? 0)) / 100, 4));
    const avg = parts.reduce((x, y) => x + y, 0);
    return [
      t('sol.ex.wavg'),
      ...shares.map((s, i) => `${fmt(s / 100)} × ${fmt(prices[i] ?? 0)} = ${fmt(parts[i] ?? 0)}`),
      `${parts.map(fmt).join(' + ')} = ${fmt(round(avg, 2))} €`,
    ];
  },

  'exhibit.rel': ({ lab, s1, s2, k }: SP) => {
    const names = list(lab), base = nums(s1), end = nums(s2);
    const abs = end.map((e, i) => e - (base[i] ?? 0));
    const rel = abs.map((d, i) => (d / (base[i] ?? 1)) * 100);
    const top = abs.reduce((best, x, i) => (x > (abs[best] ?? -Infinity) ? i : best), 0);
    return [
      t('sol.ex.relRule'),
      ...names.map((name, i) => `${name}: ${fmt(abs[i] ?? 0)} ÷ ${fmt(base[i] ?? 0)} ≈ ${pct(rel[i] ?? 0)}`),
      t('sol.ex.relMax', { seg: names[k] ?? '', g: pct(rel[k] ?? 0), segA: names[top] ?? '' }),
    ];
  },
};
