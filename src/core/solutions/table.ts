import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';

const eq = (left: string, v: number): string => `${left} = ${fmt(v)}`;

export const tableSteps: Record<string, StepFn> = {
  // Größeren Faktor x über eine Rechenregel auflösen, der kleinere y bleibt stehen
  'table.mul': ({ a, b }: SP) => {
    const x = Math.max(a, b), y = Math.min(a, b), res = a * b;
    const Y = fmt(y);
    const last = eq(`${fmt(a)} × ${fmt(b)}`, res);
    if (x === 10) return [t('sol.table.r10'), t('sol.table.zero', { y: Y, v: fmt(res) }), last];
    if (x === 9) return [t('sol.table.r9'), eq(`${Y} × 10`, 10 * y), eq(`${fmt(10 * y)} − ${Y}`, res)];
    if (x >= 6) {
      const r = x - 5;
      return [
        t('sol.table.split5', { x, r }),
        eq(`${Y} × 5`, 5 * y),
        eq(`${Y} × ${r}`, r * y),
        eq(`${fmt(5 * y)} + ${fmt(r * y)}`, res),
      ];
    }
    if (x === 5) return [t('sol.table.r5'), eq(`${Y} × 10`, 10 * y), eq(`${fmt(10 * y)} ÷ 2`, res)];
    if (x === 4) return [t('sol.table.r4'), eq(`${Y} × 2`, 2 * y), eq(`${fmt(2 * y)} × 2`, res)];
    if (x === 3) return [t('sol.table.r3'), eq(`${Y} × 2`, 2 * y), eq(`${fmt(2 * y)} + ${Y}`, res)];
    return [t('sol.table.r2'), eq(`${Y} + ${Y}`, res), last];
  },

  'table.div': ({ a, b, n }: SP) => [
    t('sol.table.inverse', { a: fmt(a), n: fmt(n) }),
    eq(`${fmt(a)} × ${fmt(b)}`, n),
    eq(`${fmt(n)} ÷ ${fmt(a)}`, b),
  ],
};
