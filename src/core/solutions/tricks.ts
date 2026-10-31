// Lösungswege der Rechentricks (zeigen den Trick mit den echten Zahlen)
import { t } from '../../i18n/index.ts';
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';

export const tricksSteps: Record<string, StepFn> = {
  'tricks.x11': ({ n }: SP, task) => {
    const res = task.expected;
    if (n < 100) {
      const a = Math.floor(n / 10), b = n % 10, s = a + b;
      const steps = [t('sol.tr.x11'), `${n} → ${a} | ${a}+${b} | ${b} = ${a} | ${s} | ${b}`];
      if (s > 9) steps.push(t('sol.tr.x11carry', { s, c: Math.floor(s / 10), a1: a + 1, s1: s % 10, b }));
      steps.push(`${n} × 11 = ${fmt(res)}`);
      return steps;
    }
    const d = String(n).split('').map(Number) as [number, number, number];
    return [
      t('sol.tr.x11long'),
      t('sol.tr.x11digits', { expr: `${d[0]} | ${d[0]}+${d[1]} | ${d[1]}+${d[2]} | ${d[2]} = ${d[0]} | ${d[0] + d[1]} | ${d[1] + d[2]} | ${d[2]}` }),
      t('sol.tr.x11alt', { a: fmt(n * 10), b: fmt(n) }),
      t('sol.tr.x11carries', { res: fmt(res) }),
    ];
  },

  'tricks.diffsq': ({ a, b, m, d }: SP, task) => [
    t('sol.tr.dsSym', { a, b, m, d }),
    t('sol.tr.dsFormula', { m, d }),
    `${m}² = ${fmt(m * m)}, ${d}² = ${fmt(d * d)}`,
    `${fmt(m * m)} − ${fmt(d * d)} = ${fmt(task.expected)}`,
  ],

  'tricks.near100': ({ a, b }: SP, task) => {
    const da = 100 - a, db = 100 - b, h = 100 - da - db;
    return [
      t('sol.tr.nDist', { a, b, da, db }),
      t('sol.tr.nHund', { da, db, h, a, h100: fmt(h * 100) }),
      t('sol.tr.nProd', { da, db, p: da * db }),
      `${fmt(h * 100)} + ${da * db} = ${fmt(task.expected)}`,
    ];
  },

  'tricks.square5': ({ n }: SP, task) => {
    const tens = Math.floor(n / 10);
    return [
      t('sol.tr.s5', { t: tens, n }),
      `${tens} × (${tens} + 1) = ${tens} × ${tens + 1} = ${tens * (tens + 1)}`,
      t('sol.tr.s5app', { p: tens * (tens + 1) }),
      `${n}² = ${fmt(task.expected)}`,
    ];
  },

  'tricks.pctswap': ({ p, y }: SP, task) => {
    const div = y === 50 ? 2 : y === 25 ? 4 : y === 20 ? 5 : 10;
    return [
      t('sol.tr.psRule', { p, y }),
      t('sol.tr.psEasier', { p, y }),
      t(`sol.tr.ps${div === 2 ? 50 : div === 4 ? 25 : div === 5 ? 20 : 10}`, { p }),
      `${p} ÷ ${div} = ${fmt(task.expected)}`,
    ];
  },

  'tricks.subround': ({ a, b }: SP, task) => {
    const k = 10 - (b % 10), r = b + k;
    return [
      t('sol.tr.srUp', { b: fmt(b), r: fmt(r), k }),
      `${fmt(a)} − ${fmt(r)} = ${fmt(a - r)}`,
      t('sol.tr.srBack', { k }),
      `${fmt(a - r)} + ${k} = ${fmt(task.expected)}`,
    ];
  },
};
