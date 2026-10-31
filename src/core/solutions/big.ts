import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { fmt, round } from '../numbers.ts';
import { pc, pow10, R, strip } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const bigSteps: Record<string, StepFn> = {
  'big.mult': ({ m, u, b, ua }: SP) => {
    const { m: b0, z } = strip(b);
    const uv = u === 'Tsd.' ? 3 : 6, X = R(m * b0), full = R(m * (u === 'Tsd.' ? 1e3 : 1e6) * b);
    const e = uv + z;
    const out = ua === 'Mrd.' ? 9 : ua === 'Mio.' ? 6 : 3;
    return [
      t('sol.big.digitsMul', { a: fmt(m), b: b0, c: fmt(X) }),
      t('sol.big.zerosMul', { u: lw(u), pu: pow10(uv), b: fmt(b), b0, pz: pow10(z), pe: pow10(e) }),
      `${fmt(X)} × ${pow10(e)} = ${fmt(full)}`,
      t('sol.big.in', { ua: lw(ua), full: fmt(full), v: fmt(R(full / 10 ** out)) }),
    ];
  },

  'big.div': ({ D, d, ua }: SP, task: Task) => {
    const Ds = strip(D), ds = strip(d);
    const p = Ds.z - ds.z, ratio = R(Ds.m / ds.m), A = R(ratio * 10 ** p);
    const label = task.prompt.split(' ÷ ')[0] ?? '';
    const out = ua === 'Mio.' ? 6 : 3;
    return [
      t('sol.big.digitsDiv', { a: Ds.m, b: ds.m, c: fmt(ratio) }),
      t('sol.big.zerosDiv', { label, Dm: Ds.m, pD: pow10(Ds.z), d: fmt(d), dm: ds.m, pd: pow10(ds.z), pp: pow10(p) }),
      `${fmt(ratio)} × ${pow10(p)} = ${fmt(A)}`,
      t('sol.big.in', { ua: lw(ua), full: fmt(A), v: fmt(R(A / 10 ** out)) }),
    ];
  },

  'big.percapita': ({ T, base }: SP, task: Task) => {
    const N = T * 1000, e = task.expected;
    const head = [
      t('sol.big.pcUnits', { a: pow10(9), b: pow10(6), c: pow10(3) }),
      t('sol.big.pcConv', { T: fmt(T), N: fmt(N), base }),
    ];
    if (base === 450) {
      const v = (T * 20) / 9;
      return [
        ...head,
        `${fmt(N)} ÷ 450 = ${fmt(T)} × ${fmt(1000)} ÷ 450 = ${fmt(T)} × 20 ÷ 9`,
        t('sol.big.pc450', { t: fmt(T), t20: fmt(T * 20), v: fmt(round(v, 1)) }),
        t('sol.big.pcExact', { e: fmt(e) }),
      ];
    }
    // [gerundeter Nenner, Korrekturfaktor, Korrektur in %, Begründung]
    const row = ({ 84: [80, -0.05, 5, 'sol.big.why84'], 41: [40, -0.025, 2.5, 'sol.big.why41'], 46: [50, 0.09, 9, 'sol.big.why46'] } as Record<number, [number, number, number, `sol.${string}`]>)[base];
    const [rb, factor, pcNum, why] = row ?? [1, 0, 0, 'sol.big.why84'];
    const v = N / rb, w = round(v * (1 + factor), 1), c = round(Math.abs(v * factor), 1);
    return [
      ...head,
      t('sol.big.pcRound', { base, rb, N: fmt(N), v: fmt(v) }),
      t('sol.big.pcCorr', { base, why: t(why), pc: pc(pcNum), v: fmt(v), c: fmt(c), op: factor < 0 ? '−' : '+', w: fmt(w) }),
      t('sol.big.pcExact', { e: fmt(e) }),
    ];
  },

};
