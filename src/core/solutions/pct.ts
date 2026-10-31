import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import { gcd, sg, R, pctOfSteps } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const pctSteps: Record<string, StepFn> = {
  'pct.of': ({ p, y }: SP) => pctOfSteps(p, y),

  'pct.change': ({ alt, neu }: SP, task: Task) => {
    const diff = Math.abs(neu - alt), up = neu > alt, a10 = alt / 10, steps = R(diff / a10);
    return [
      t(up ? 'sol.pct.diffUp' : 'sol.pct.diffDown', { neu: fmt(neu), alt: fmt(alt), diff: fmt(diff) }),
      t('sol.pct.base', { alt: fmt(alt) }),
      t('sol.pof.of', { p: 10, y: fmt(alt), v: fmt(a10) }),
      t('sol.pct.result', {
        diff: fmt(diff), a10: fmt(a10), s: fmt(steps), unit: t(steps === 1 ? 'sol.pct.step1' : 'sol.pct.stepN'),
        e: fmt(task.expected), down: up ? '' : t('sol.pct.down'),
      }),
    ];
  },

  'pct.reverse': ({ r, nach, discount }: SP, task: Task) => {
    const X = discount ? 100 - r : 100 + r, g = gcd(X, 100), num = X / g, den = 100 / g;
    const part = R(nach / num);
    return [
      t(discount ? 'sol.pct.revDisc' : 'sol.pct.revInc', { r: fmt(r), nach: fmt(nach), X }),
      t('sol.pct.revParts', { X, num, den, nach: fmt(nach) }),
      t('sol.pct.revPart', { nach: fmt(nach), num, part: fmt(part) }),
      t('sol.pct.revWhole', { den, part: fmt(part), e: fmt(task.expected) }),
    ];
  },

  'pct.points': ({ m1, m2 }: SP, task: Task) => {
    const d = m2 - m1, g = gcd(d, m1), n = d / g, dd = m1 / g;
    return [
      t('sol.pct.ptDiff', { m1, m2, d }),
      t('sol.pct.ptBase', { m1, d }),
      dd === 1
        ? t(n === 1 ? 'sol.pct.ptSame' : 'sol.pct.ptTimes', { d, m1, n })
        : t(g > 1 ? 'sol.pct.ptReduce' : 'sol.pct.ptNoReduce', { d, m1, n, dd }),
      dd === 1
        ? t('sol.pct.ptFinal1', { n, e: fmt(task.expected) })
        : t('sol.pct.ptFinal', { n, n100: n * 100, dd, e: fmt(task.expected) }),
    ];
  },

  'pct.chain': ({ r1, r2 }: SP, task: Task) => {
    const f = (r: number): string => fmt(R(1 + r / 100));
    const s = r1 + r2, x = R((r1 * r2) / 100);
    return [
      t('sol.pct.chainFactors', { r1: sg(r1), f1: f(r1), r2: sg(r2), f2: f(r2) }),
      t('sol.pct.chainAdd', { a: fmt(r1), op: r2 < 0 ? '−' : '+', b: fmt(Math.abs(r2)), s: fmt(s) }),
      t('sol.pct.chainCross', { a: fmt(r1), b: fmt(r2), x: sg(x) }),
      t('sol.pct.chainFinal', { s: fmt(s), op: x < 0 ? '−' : '+', x: fmt(Math.abs(x)), e: fmt(task.expected) }),
    ];
  },

};
