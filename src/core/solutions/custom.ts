// Lösungswege fürs Eigene Training (Zerlegen)
import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';
import { strip } from './helpers.ts';

/** 234 → [200, 30, 4] */
function places(x: number): number[] {
  const out: number[] = [];
  let f = 1;
  for (let r = x; r > 0; r = Math.floor(r / 10), f *= 10) {
    const dgt = r % 10;
    if (dgt) out.unshift(dgt * f);
  }
  return out;
}

export const customSteps: Record<string, StepFn> = {
  'custom.mul': ({ a, b }: SP, task) => {
    const res = task.expected;
    const x = Math.max(a, b), y = Math.min(a, b);
    if (x < 10) {
      return [
        t('sol.cu.table', { a, b }),
        t('sol.cu.prop', { a, b, c: 10 - b, x: a * 10, y: a * (10 - b) }),
        `${a} × ${b} = ${fmt(res)}`,
      ];
    }
    const parts = places(x);
    if (parts.length === 1) {
      const { m, z } = strip(x);
      return [
        t('sol.cu.noZeros', { x: fmt(x), y }),
        `${m} × ${y} = ${fmt(m * y)}`,
        t(z === 1 ? 'sol.cu.zeros1' : 'sol.cu.zerosN', { z, res: fmt(res) }),
      ];
    }
    return [
      t('sol.cu.split', { x: fmt(x), parts: parts.map((p) => fmt(p)).join(' + ') }),
      t('sol.cu.parts', { list: parts.map((p) => `${fmt(p)} × ${y} = ${fmt(p * y)}`).join(', ') }),
      t('sol.cu.add', { list: parts.map((p) => fmt(p * y)).join(' + ') }),
      `${fmt(a)} × ${fmt(b)} = ${fmt(res)}`,
    ];
  },

  'custom.square': ({ n }: SP, task) => {
    const res = task.expected;
    if (n < 10) {
      return [
        `${n}² = ${n} × ${n}`,
        t('sol.cu.prop', { a: n, b: n, c: 10 - n, x: n * 10, y: n * (10 - n) }),
        `${n}² = ${fmt(res)}`,
      ];
    }
    if (n % 10 === 0) {
      return [
        t('sol.cu.sq10', { n, m: n / 10 }),
        `${n / 10}² = ${fmt((n / 10) ** 2)}`,
        `${fmt((n / 10) ** 2)} × 100 = ${fmt(res)}`,
      ];
    }
    const down = n % 10 <= 5, k = down ? n % 10 : 10 - (n % 10), r = down ? n - k : n + k, o = down ? n + k : n - k;
    return [
      t(down ? 'sol.cu.nearAbove' : 'sol.cu.nearBelow', { n, k, r }),
      `${n}² = ${r} × ${o} + ${k}²`,
      `${r} × ${o} = ${fmt(r * o)}, ${k}² = ${k * k}`,
      `${fmt(r * o)} + ${k * k} = ${fmt(res)}`,
    ];
  },
};
