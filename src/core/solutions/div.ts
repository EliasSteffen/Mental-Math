import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { R } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const divSteps: Record<string, StepFn> = {
  'div.exact': ({ n, d }: SP) => {
    const q = n / d;
    let q1 = Math.floor(q / 10) * 10;
    if (q1 === q) q1 -= 10;
    const q2 = q - q1;
    return [
      `${fmt(n)} zerlegen: ${fmt(n)} = ${fmt(d * q1)} + ${fmt(d * q2)}`,
      `${fmt(d * q1)} ÷ ${d} = ${fmt(q1)}`,
      `${fmt(d * q2)} ÷ ${d} = ${fmt(q2)}`,
      `${fmt(q1)} + ${fmt(q2)} = ${fmt(q)}`,
    ];
  },

  'div.decimal': ({ n, d }: SP) => {
    const k = ({ 0.2: 5, 0.25: 4, 0.4: 5, 0.5: 2, 0.8: 5, 1.5: 2, 2.5: 2 } as Record<number, number>)[d] ?? 1;
    const D = R(d * k), N = R(n * k), q = n / d;
    const how = k === 2 ? `${fmt(n)} verdoppeln = ${fmt(N)}`
      : k === 4 ? `${fmt(n)} zweimal verdoppeln: ${fmt(2 * n)}, ${fmt(N)}`
        : `${fmt(n)} × 5 = ${fmt(R(n * 10))} ÷ 2 = ${fmt(N)}`;
    return [
      `Beide Zahlen mal ${k}, damit der Teiler ganz wird: ${fmt(d)} × ${k} = ${fmt(D)}`,
      how,
      `${fmt(N)} ÷ ${fmt(D)} = ${fmt(q)}`,
      `Probe: ${fmt(q)} × ${fmt(d)} = ${fmt(n)} → ${fmt(n)} ÷ ${fmt(d)} = ${fmt(q)}`,
    ];
  },

  'div.round': ({ n, d }: SP) => {
    const q = Math.floor(n / d);
    const A = Math.floor(q / 10) * 10, dA = d * A, r1 = n - dA;
    const B = Math.floor(r1 / d), rem = r1 - d * B;
    const up = rem * 2 >= d, res = Math.round(n / d);
    return [
      `${d} × ${A} = ${fmt(dA)} (passt ${A}-mal in ${fmt(n)})`,
      `${fmt(n)} − ${fmt(dA)} = ${fmt(r1)} bleiben übrig`,
      B > 0
        ? `${d} × ${B} = ${d * B} passt noch ${B}-mal, Rest ${rem}`
        : `${fmt(r1)} ist kleiner als ${d}: noch ${rem === 0 ? '0' : 'nicht mal ein'} volles Mal, Rest ${rem}`,
      rem === 0
        ? `Kein Rest: ${A} + ${B} = ${fmt(res)}`
        : `Rest ${rem} von ${d}: ${up ? 'mindestens' : 'weniger als'} die Hälfte (${fmt(d / 2)}) → ${up ? 'aufrunden' : 'abrunden'}`,
      `${A} + ${B}${up ? ' + 1' : ''} = ${fmt(res)}`,
    ];
  },

};
