import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { pow10, R, strip } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const bigSteps: Record<string, StepFn> = {
  'big.mult': ({ m, u, b, ua }: SP) => {
    const { m: b0, z } = strip(b);
    const uv = u === 'Tsd.' ? 3 : 6, X = R(m * b0), full = R(m * (u === 'Tsd.' ? 1e3 : 1e6) * b);
    const e = uv + z;
    const out = ua === 'Mrd.' ? 9 : ua === 'Mio.' ? 6 : 3;
    return [
      `Ziffern: ${fmt(m)} × ${b0} = ${fmt(X)}`,
      `Nullen: ${u} = ${pow10(uv)}, ${fmt(b)} = ${b0} × ${pow10(z)} → ${pow10(uv)} × ${pow10(z)} = ${pow10(e)}`,
      `${fmt(X)} × ${pow10(e)} = ${fmt(full)}`,
      `In ${ua}: ${fmt(full)} = ${fmt(R(full / 10 ** out))} ${ua}`,
    ];
  },

  'big.div': ({ D, d, ua }: SP, task: Task) => {
    const Ds = strip(D), ds = strip(d);
    const p = Ds.z - ds.z, ratio = R(Ds.m / ds.m), A = R(ratio * 10 ** p);
    const label = task.prompt.split(' ÷ ')[0];
    const out = ua === 'Mio.' ? 6 : 3;
    return [
      `Ziffern: ${Ds.m} ÷ ${ds.m} = ${fmt(ratio)}`,
      `Nullen: ${label} = ${Ds.m} × ${pow10(Ds.z)}, ${fmt(d)} = ${ds.m} × ${pow10(ds.z)} → ${pow10(Ds.z)} ÷ ${pow10(ds.z)} = ${pow10(p)}`,
      `${fmt(ratio)} × ${pow10(p)} = ${fmt(A)}`,
      `In ${ua}: ${fmt(A)} = ${fmt(R(A / 10 ** out))} ${ua}`,
    ];
  },

  'big.percapita': ({ T, base }: SP, task: Task) => {
    const N = T * 1000, e = task.expected;
    const head = [
      `Einheiten kürzen: Mrd. ÷ Mio. = Tsd. (${pow10(9)} ÷ ${pow10(6)} = ${pow10(3)})`,
      `${fmt(T)} Mrd. = ${fmt(N)} Mio. → ${fmt(N)} ÷ ${base} (Ergebnis in € pro Kopf)`,
    ];
    if (base === 450) {
      const v = (T * 20) / 9;
      return [
        ...head,
        `${fmt(N)} ÷ 450 = ${fmt(T)} × 1.000 ÷ 450 = ${fmt(T)} × 20 ÷ 9`,
        `${fmt(T)} × 20 = ${fmt(T * 20)}, dann ÷ 9 ≈ ${fmt(round(v, 1))}`,
        `Exakt: ${fmt(e)} €`,
      ];
    }
    const t = ({ 84: [80, -0.05, '5 %', 'ist 5 % größer als 80 → Ergebnis rund 5 % kleiner'],
      41: [40, -0.025, '2,5 %', 'ist 2,5 % größer als 40 → Ergebnis rund 2,5 % kleiner'],
      46: [50, 0.09, '9 %', 'ist 8 % kleiner als 50 → Ergebnis rund 9 % größer'] } as Record<number, [number, number, string, string]>)[base];
    const [rb, factor, pc, why] = t ?? [1, 0, '', ''];
    const v = N / rb, w = round(v * (1 + factor), 1), c = round(Math.abs(v * factor), 1);
    return [
      ...head,
      `Glatt runden: ${base} ≈ ${rb} → ${fmt(N)} ÷ ${rb} = ${fmt(v)}`,
      `Korrektur: ${base} ${why}: ${pc} von ${fmt(v)} = ${fmt(c)} → ${fmt(v)} ${factor < 0 ? '−' : '+'} ${fmt(c)} ≈ ${fmt(w)}`,
      `Exakt: ${fmt(e)} €`,
    ];
  },

};
