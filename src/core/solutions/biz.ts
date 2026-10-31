import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt, round } from '../numbers.ts';
import { R, roundSig } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const bizSteps: Record<string, StepFn> = {
  'biz.payback': ({ I, s }: SP, task: Task) => {
    const dec = !Number.isInteger(s);
    const i2 = dec ? I * 2 : I, s2 = dec ? s * 2 : s;
    const q = Math.floor(i2 / s2 + 1e-9), rem = R(i2 - s2 * q);
    const res = fmt(task.expected);
    const steps = [t('sol.biz.pbDef', { I: fmt(I), s: fmt(s) })];
    if (dec) steps.push(t('sol.biz.pbDec', { i2: fmt(i2), s2: fmt(s2) }));
    steps.push(`${fmt(s2)} × ${q} = ${fmt(s2 * q)}`);
    if (rem === 0) steps.push(t('sol.biz.pbNoRest', { e: res }));
    else steps.push(t('sol.biz.pbRest', { rem: fmt(rem), s2: fmt(s2), f: fmt(R(rem / s2)), q, e: res }));
    return steps;
  },

  'biz.breakeven': ({ F, p, v: vRaw }: SP, task: Task) => {
    const v = Number(vRaw);
    const db = p - v, Fk = F / 1000, j = Fk / db, k = fmt(1000);
    return [
      t('sol.biz.beDb', { p: fmt(p), v: fmt(v), db: fmt(db) }),
      t('sol.biz.beDef', { F: fmt(F), db: fmt(db) }),
      t('sol.biz.beK', { F: fmt(F), Fk: fmt(Fk), k, db: fmt(db), j: fmt(j) }),
      t('sol.biz.beRes', { j: fmt(j), k, e: fmt(task.expected) }),
    ];
  },

  'biz.margin': ({ R: Rv, G }: SP, task: Task) => {
    const r1 = Rv / 100, m = fmt(task.expected);
    return [
      t('sol.biz.mDef', { G: fmt(G), R: fmt(Rv) }),
      t('sol.biz.m1', { R: fmt(Rv), r1: fmt(r1) }),
      t('sol.biz.mHow', { G: fmt(G), r1: fmt(r1), m }),
      t('sol.biz.mCheck', { m, r1: fmt(r1), G: fmt(G) }),
    ];
  },

  'biz.roi': ({ C, B }: SP, task: Task) => {
    const g = R(B - C), c10 = R(C / 10), k = R(g / c10);
    return [
      t('sol.biz.roiDef'),
      t('sol.biz.roiGain', { B: fmt(B), C: fmt(C), g: fmt(g) }),
      t('sol.biz.roi10', { C: fmt(C), c10: fmt(c10) }),
      t('sol.pct.result', {
        diff: fmt(g), a10: fmt(c10), s: fmt(k), unit: t(k === 1 ? 'sol.pct.step1' : 'sol.pct.stepN'), e: fmt(task.expected), down: '',
      }),
    ];
  },

  'biz.tco': ({ O, A, n }: SP, task: Task) => {
    const whole = Math.floor(A), frac = R(A - whole), X = n * A;
    const calc = frac === 0
      ? `${n} × ${fmt(A)}`
      : `${n} × ${fmt(A)} = ${n} × ${whole} + ${n} × ${fmt(frac)} = ${fmt(n * whole)} + ${fmt(n * frac)}`;
    return [
      t('sol.biz.tcoDef'),
      t('sol.biz.tcoRun', { calc, X: fmt(X) }),
      t('sol.biz.tcoTotal', { O: fmt(O), X: fmt(X), e: fmt(task.expected) }),
    ];
  },

  'biz.fte': ({ V, t: tm, s, H }: SP, task: Task) => {
    const M = R(V * tm), Sx = R((M * s) / 100), hrs = (Sx * 1e6) / 60;
    const hr = roundSig(hrs, 2), x = hr / H;
    const phrase = s === 25 ? t('sol.biz.fte25', { M: fmt(M), S: fmt(Sx) })
      : s === 50 ? t('sol.biz.fte50', { M: fmt(M), S: fmt(Sx) })
        : s === 10 ? t('sol.pof.of', { p: 10, y: fmt(M), v: fmt(Sx) })
          : t('sol.biz.fteX', { M: fmt(M), M10: fmt(M / 10), s, k: s / 10, S: fmt(Sx) });
    const h = round(hrs, 0);
    return [
      t('sol.biz.fteMin', { V: fmt(V), t: fmt(tm), M: fmt(M) }),
      t('sol.biz.fteSave', { s: fmt(s), phrase }),
      t('sol.biz.fteHours', { S: fmt(Sx), h: fmt(h), rounded: hr !== h ? t('sol.biz.fteRounded', { hr: fmt(hr) }) : '' }),
      t('sol.biz.ftePer', { H: fmt(H), hr: fmt(hr), x: fmt(round(x, 1)) }),
      t('sol.exact', { e: `${fmt(task.expected)} FTE` }),
    ];
  },

  'biz.sla': ({ a }: SP, task: Task) => {
    const u = R(100 - a), h = R(u * 88), min = a === 99.99;
    const steps = [
      t('sol.biz.slaShare', { a: fmt(a), u: fmt(u) }),
      t('sol.biz.slaYear', { h1: fmt(8760), h2: fmt(8800) }),
      t('sol.biz.slaCalc', { u: fmt(u), h: fmt(h) }),
    ];
    if (min) steps.push(t('sol.biz.slaMin', { h: fmt(h), m: fmt(round(h * 60, 0)) }));
    steps.push(t('sol.exact', { e: `${fmt(task.expected)} ${min ? 'min' : 'h'}` }));
    return steps;
  },

};
