import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import { R } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const divSteps: Record<string, StepFn> = {
  'div.exact': ({ n, d }: SP) => {
    const q = n / d;
    let q1 = Math.floor(q / 10) * 10;
    if (q1 === q) q1 -= 10;
    const q2 = q - q1;
    return [
      t('sol.div.split', { n: fmt(n), a: fmt(d * q1), b: fmt(d * q2) }),
      `${fmt(d * q1)} ÷ ${d} = ${fmt(q1)}`,
      `${fmt(d * q2)} ÷ ${d} = ${fmt(q2)}`,
      `${fmt(q1)} + ${fmt(q2)} = ${fmt(q)}`,
    ];
  },

  'div.decimal': ({ n, d }: SP) => {
    const k = ({ 0.2: 5, 0.25: 4, 0.4: 5, 0.5: 2, 0.8: 5, 1.5: 2, 2.5: 2 } as Record<number, number>)[d] ?? 1;
    const D = R(d * k), N = R(n * k), q = n / d;
    const how = k === 2 ? t('sol.div.double', { n: fmt(n), N: fmt(N) })
      : k === 4 ? t('sol.div.double2', { n: fmt(n), n2: fmt(2 * n), N: fmt(N) })
        : `${fmt(n)} × 5 = ${fmt(R(n * 10))} ÷ 2 = ${fmt(N)}`;
    return [
      t('sol.div.scale', { k, d: fmt(d), D: fmt(D) }),
      how,
      `${fmt(N)} ÷ ${fmt(D)} = ${fmt(q)}`,
      t('sol.div.check', { q: fmt(q), d: fmt(d), n: fmt(n) }),
    ];
  },

  'div.round': ({ n, d }: SP) => {
    const q = Math.floor(n / d);
    const A = Math.floor(q / 10) * 10, dA = d * A, r1 = n - dA;
    const B = Math.floor(r1 / d), rem = r1 - d * B;
    const up = rem * 2 >= d, res = Math.round(n / d);
    return [
      t('sol.div.fits', { d, A, dA: fmt(dA), n: fmt(n) }),
      t('sol.div.left', { n: fmt(n), dA: fmt(dA), r1: fmt(r1) }),
      B > 0
        ? t('sol.div.more', { d, B, dB: d * B, rem })
        : t(rem === 0 ? 'sol.div.less0' : 'sol.div.less', { r1: fmt(r1), d, rem }),
      rem === 0
        ? t('sol.div.exact', { A, B, res: fmt(res) })
        : t(up ? 'sol.div.up' : 'sol.div.down', { rem, d, half: fmt(d / 2) }),
      `${A} + ${B}${up ? ' + 1' : ''} = ${fmt(res)}`,
    ];
  },

};
