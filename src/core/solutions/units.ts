import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { fmt, round } from '../numbers.ts';
import { parseU, uMul, uDiv, uInv, uStr, uRaw } from '../units.ts';
import type { SP, StepFn } from './helpers.ts';
import { optText } from './helpers.ts';

export const unitsSteps: Record<string, StepFn> = {
  'units.dimless': (p: SP, task: Task) => {
    const ans = optText(p, task);
    const base = parseU(p.ua);
    if (p.k === 3) {
      const comb = p.o1 === '×' ? uMul(base, parseU(p.ub)) : uDiv(base, parseU(p.ub));
      const c = lw(uStr(comb));
      return [
        t('sol.units.dimless'),
        t('sol.units.combine', { a: lw(p.ua), op: p.o1, b: lw(p.ub), c }),
        t(p.o2 === '÷' ? 'sol.units.divQ' : 'sol.units.mulQ', { c }),
        t('sol.units.answer', { u: ans }),
      ];
    }
    return [
      t('sol.units.dimless'),
      t('sol.units.given', { a: lw(p.ua) }),
      p.o2 === '÷'
        ? t('sol.units.divSame', { a: lw(p.ua) })
        : t('sol.units.mulInv', { a: lw(p.ua), inv: lw(uStr(uInv(base))) }),
      t('sol.units.answer', { u: ans }),
    ];
  },

  'units.result': (p: SP, task: Task) => {
    const ex = [p.ua, p.o1, p.ub, ...(p.o2 ? [p.o2, p.uc] : [])];
    let raw = parseU(ex[0] ?? '');
    for (let i = 1; i < ex.length; i += 2) raw = ex[i] === '×' ? uMul(raw, parseU(ex[i + 1] ?? '')) : uDiv(raw, parseU(ex[i + 1] ?? ''));
    const names = [...new Set(raw.map(([n]) => n))];
    const cancelled = names.filter((n) => raw.some(([x, e]) => x === n && e > 0) && raw.some(([x, e]) => x === n && e < 0));
    const steps = [t('sol.units.frac')];
    if (ex.includes('÷')) steps.push(t('sol.units.recip'));
    steps.push(t('sol.units.write', { expr: ex.map((x, i) => (i % 2 ? x : `[${lw(x ?? '')}]`)).join(' '), raw: lw(uRaw(raw)) }));
    steps.push(cancelled.length ? t('sol.units.cancel', { list: cancelled.map(lw).join(', ') }) : t('sol.units.noCancel'));
    steps.push(t('sol.result', { r: optText(p, task) }));
    return steps;
  },

  'units.convert': (p: SP, task: Task) => {
    const { x, y, fam } = p, F = (n: number): string => fmt(n, 4), e = F(task.expected), k = fmt(1000);
    const res = t('sol.result', { r: `${e} ${task.unit}` });
    switch (fam) {
      case 1: return [
        t('sol.uc.1a'),
        t('sol.uc.1b', { x: F(x), y: F(x * 12) }),
        t('sol.uc.1c', { k }),
        `${F(x * 12)} ÷ ${k} = ${e}`, res,
      ];
      case 2: return [
        t('sol.uc.2a'),
        t('sol.uc.2b', { x: F(x), x10: F(x * 10) }),
        `${F(x * 10)} ÷ 36 = ${e}`, res,
      ];
      case 3: return [
        t('sol.uc.3a'),
        t('sol.uc.3b', { x: F(x), a: F(x * 4), b: F(x * 0.4) }),
        `${F(x * 4)} − ${F(x * 0.4)} = ${e}`, res,
      ];
      case 4: {
        const w = Math.trunc(x), r = round(x - w, 4);
        return [
          t('sol.uc.4a'),
          r > 0 ? t('sol.uc.split', { y: F(y), w: F(w), a: F(y * w), r: F(r), b: F(y * r) }) : `${F(y)} × ${F(w)} = ${F(y * w)}`,
          r > 0 ? `${F(y * w)} + ${F(y * r)} = ${e}` : t('sol.uc.4check', { e, y: F(y), x: F(x) }), res,
        ];
      }
      case 5: return [
        t('sol.uc.5a'),
        `${F(x)} × 60 = ${F(x)} × 6 × 10`,
        t('sol.uc.5c', { x: F(x), a: F(x * 6), e }), res,
      ];
      case 6: return [
        t('sol.uc.6a', { k }),
        t('sol.uc.6b', { x: F(x), y: F(x * 1000) }),
        t('sol.uc.6c'),
        `${F(x * 1000)} ÷ 12 = ${e}`, res,
      ];
      case 7: return [
        t('sol.uc.7a'),
        t('sol.uc.7b', { x: F(x), y: F(y), v: F(x * y) }),
        t('sol.uc.7c', { k }),
        `${F(x * y)} ÷ ${k} = ${e}`, res,
      ];
      case 8: return [
        t('sol.uc.8a'),
        t('sol.uc.8b', { x: F(x), y: F(y), v: F(x * y) }),
        t('sol.uc.8c'),
        `${F(x * y)} ÷ 60 = ${e}`, res,
      ];
      default: return [
        t('sol.uc.9a', { x: F(x), v: F(x * 1e6) }),
        t('sol.uc.9b', { y: F(y) }),
        `${F(x * 1e6)} ÷ ${F(y)} = ${e}`, res,
      ];
    }
  },

};
