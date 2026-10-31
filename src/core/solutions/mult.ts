import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import { dist10 } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const multSteps: Record<string, StepFn> = {
  'mult.2x1': ({ a, b }: SP) => {
    const o = a % 10, res = a * b;
    if (o === 0) {
      return [
        t('sol.mult.ends0', { a, a10: a / 10 }),
        `${a / 10} × ${b} = ${fmt((a / 10) * b)}`,
        `${fmt((a / 10) * b)} × 10 = ${fmt(res)}`,
      ];
    }
    const down = o <= 6;
    const base = down ? a - o : a + (10 - o), d = down ? o : 10 - o, op = down ? '+' : '−';
    return [
      t('sol.mult.split', { a, base, op, d }),
      t('sol.mult.tens', { base, b, b10: base / 10, v: fmt((base / 10) * b), w: fmt(base * b) }),
      `${d} × ${b} = ${fmt(d * b)}`,
      `${fmt(base * b)} ${op} ${fmt(d * b)} = ${fmt(res)}`,
    ];
  },

  'mult.2x2': ({ a, b }: SP) => {
    const res = a * b;
    for (const [n, m] of [[b, a], [a, b]] as Array<[number, number]>) {
      for (const A of [25, 50]) {
        if (Math.abs(n - A) > 3) continue;
        const k = n - A, q = 100 / A;
        const head = k === 0
          ? `${n} = 100 ÷ ${q}`
          : t('sol.mult.split', { a: n, base: A, op: k > 0 ? '+' : '−', d: Math.abs(k) });
        const mid = `${fmt(m)} × ${A} = ${fmt(m * 100)} ÷ ${q} = ${fmt(m * A)}`;
        if (k === 0) return [head, `${fmt(m)} × 100 = ${fmt(m * 100)}`, `${fmt(m * 100)} ÷ ${q} = ${fmt(res)}`];
        return [
          head, mid,
          `${fmt(m)} × ${Math.abs(k)} = ${fmt(m * Math.abs(k))}`,
          `${fmt(m * A)} ${k > 0 ? '+' : '−'} ${fmt(m * Math.abs(k))} = ${fmt(res)}`,
        ];
      }
    }
    const [x, y] = dist10(b) <= dist10(a) ? [b, a] : [a, b];
    const o = x % 10, down = o <= 5;
    const base = down ? x - o : x + (10 - o), d = down ? o : 10 - o, op = down ? '+' : '−';
    return [
      t('sol.mult.split', { a: x, base, op, d }),
      base === 100
        ? `${y} × 100 = ${fmt(y * 100)}`
        : `${y} × ${base} = ${y} × ${base / 10} × 10 = ${fmt((y * base) / 10)} × 10 = ${fmt(y * base)}`,
      `${y} × ${d} = ${fmt(y * d)}`,
      `${fmt(y * base)} ${op} ${fmt(y * d)} = ${fmt(res)}`,
    ];
  },

  'mult.easy': ({ a, f }: SP) => {
    const res = a * f;
    if (f === 5) return [t('sol.mult.e5'), `${fmt(a)} × 10 = ${fmt(a * 10)}`, `${fmt(a * 10)} ÷ 2 = ${fmt(res)}`];
    if (f === 50) return [t('sol.mult.e50'), `${fmt(a)} × 100 = ${fmt(a * 100)}`, `${fmt(a * 100)} ÷ 2 = ${fmt(res)}`];
    return [
      t('sol.mult.e25'),
      `${fmt(a)} × 100 = ${fmt(a * 100)}`,
      `${fmt(a * 100)} ÷ 2 = ${fmt(a * 50)}`,
      `${fmt(a * 50)} ÷ 2 = ${fmt(res)}`,
    ];
  },

  'mult.square': ({ a }: SP) => {
    const o = a % 10, N = o <= 5 ? a - o : a + (10 - o), d = Math.abs(a - N);
    const lo = a - d, hi = a + d, other = a < N ? lo : hi;
    const prod = lo * hi, res = a * a;
    return [
      t('sol.mult.sqNear', { a, d, N, lo, hi }),
      N === 100
        ? `${other} × 100 = ${fmt(prod)}`
        : `${other} × ${N} = ${other} × ${N / 10} × 10 = ${fmt(other * (N / 10))} × 10 = ${fmt(prod)}`,
      `${d}² = ${d * d}`,
      `${fmt(prod)} + ${d * d} = ${fmt(res)}`,
    ];
  },

};
