import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';

export const fracSteps: Record<string, StepFn> = {
  'frac.topct': ({ n, d }: SP, task: Task) => {
    const e = fmt(task.expected), u = 100 / d;
    const calc = Number.isInteger(u) || Math.abs(u * 4 - Math.round(u * 4)) < 1e-9
      ? `100 ÷ ${d} = ${fmt(u)}`
      : (() => { const q0 = Math.floor(100 / d); return t('sol.frac.calcRest', { d, q0, dq: d * q0, r: 100 - d * q0, u: fmt(u) }); })();
    if (n === 1) {
      return [t('sol.frac.unit', { d }), calc, t('sol.frac.remember', { d, e })];
    }
    if (d - n === 1) {
      return [t('sol.frac.comp', { n, d }), `1/${d}: ${calc}`, t('sol.frac.compRes', { u: fmt(u), e })];
    }
    return [t('sol.frac.first', { d }), calc, t('sol.frac.mul', { n, u: fmt(u), e })];
  },

  'frac.of': ({ n, d, y }: SP) => {
    const u = y / d, res = u * n;
    const how = d === 4 ? t('sol.frac.how4', { y: fmt(y), h: fmt(y / 2), u: fmt(u) })
      : d === 5 ? t('sol.frac.how5', { y: fmt(y), y2: fmt(y * 2), u: fmt(u) })
        : d === 25 ? t('sol.frac.how25', { y: fmt(y), y4: fmt(y * 4), u: fmt(u) })
          : d === 8 ? t('sol.frac.how8', { y: fmt(y), a: fmt(y / 2), b: fmt(y / 4), u: fmt(u) })
            : t('sol.frac.howDiv', { y: fmt(y), d, u: fmt(u) });
    return [
      t(n === 1 ? 'sol.frac.ofFirst1' : 'sol.frac.ofFirst', { y: fmt(y), d }),
      how,
      n === 1 ? t('sol.frac.ofOne', { d, y: fmt(y), res: fmt(res) }) : t('sol.frac.ofMul', { u: fmt(u), n, res: fmt(res) }),
    ];
  },

};
