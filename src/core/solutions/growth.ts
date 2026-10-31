import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt, round } from '../numbers.ts';
import { pc, R } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const growthSteps: Record<string, StepFn> = {
  'growth.compound': ({ r, n }: SP, task: Task) => {
    const c2 = (n * (n - 1)) / 2, c3 = (n * (n - 1) * (n - 2)) / 6;
    const q = R((r * r) / 100), t2 = R(c2 * q), t3 = R((c3 * r ** 3) / 1e4);
    const base = n * r, withT3 = n >= 3 && t3 >= 0.05;
    const total = base + t2 + (withT3 ? t3 : 0);
    const out = [
      t('sol.gr.base', { n, r: fmt(r), b: fmt(base) }),
      t('sol.gr.add1', { c2, r: fmt(r), q: fmt(q), t2: fmt(t2) }),
    ];
    if (withT3) out.push(t('sol.gr.add2', { c3, r: fmt(r), r3: fmt(R(r ** 3 / 1e4)), t3: fmt(t3) }));
    out.push(t('sol.gr.sum', { sum: `${fmt(base)} + ${fmt(t2)}${withT3 ? ` + ${fmt(t3)}` : ''}`, total: fmt(round(total, 1)) }));
    out.push(t('sol.exact', { e: pc(task.expected) }));
    return out;
  },

  'growth.rule72': ({ r }: SP, task: Task) => [
    t('sol.gr.r72'),
    `72 ÷ ${r}: ${r} × ${fmt(72 / r)} = 72`,
    t('sol.gr.r72check', { x: fmt(72 / r), r }),
    t('sol.gr.exactYears', { e: fmt(task.expected) }),
  ],

  'growth.cagr': ({ r, n, S: Sv, E }: SP, task: Task) => {
    const F = R(E / Sv), g = 1 + r / 100, avg = R(((F - 1) / n) * 100);
    const seq = [];
    let cur = 1;
    for (let i = 1; i <= n; i++) {
      const nx = R(cur * g);
      seq.push(`${fmt(cur, 6)} × ${fmt(g, 4)} = ${fmt(nx, 6)}`);
      cur = nx;
    }
    return [
      t('sol.gr.factor', { E: fmt(E), S: fmt(Sv), F: fmt(F, 6), n }),
      t('sol.gr.bound', { f1: fmt(F - 1, 6), n, avg: fmt(avg) }),
      t('sol.gr.try', { r: fmt(r), g: fmt(g, 4), seq: seq.join('; ') }),
      t('sol.gr.hit', { F: fmt(F, 6), e: fmt(task.expected) }),
    ];
  },

};
