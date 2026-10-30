import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';

export const fracSteps: Record<string, StepFn> = {
  'frac.topct': ({ n, d }: SP, task: Task) => {
    const e = task.expected, u = 100 / d;
    const calc = Number.isInteger(u) || Math.abs(u * 4 - Math.round(u * 4)) < 1e-9
      ? `100 ÷ ${d} = ${fmt(u)}`
      : (() => { const q0 = Math.floor(100 / d); return `100 ÷ ${d}: ${d} × ${q0} = ${d * q0}, Rest ${100 - d * q0} → ≈ ${fmt(u)}`; })();
    if (n === 1) {
      return [`1/${d} heißt: 100 % geteilt durch ${d}`, calc, `Merken: 1/${d} ≈ ${fmt(e)} %`];
    }
    if (d - n === 1) {
      return [`${n}/${d} = 1 − 1/${d} (das Gegenstück zu einem Stammbruch)`, `1/${d}: ${calc}`, `100 − ${fmt(u)} = ${fmt(e)} %`];
    }
    return [`Erst der Stammbruch: 1/${d} von 100 %`, calc, `${n} × ${fmt(u)} = ${fmt(e)} %`];
  },

  'frac.of': ({ n, d, y }: SP) => {
    const u = y / d, res = u * n;
    const how = { 4: `${fmt(y)} halbieren: ${fmt(y / 2)}, nochmal halbieren: ${fmt(u)}`,
      5: `${fmt(y)} × 2 = ${fmt(y * 2)}, dann ÷ 10 = ${fmt(u)}`,
      25: `${fmt(y)} × 4 = ${fmt(y * 4)}, dann ÷ 100 = ${fmt(u)}`,
      8: `${fmt(y)} dreimal halbieren: ${fmt(y / 2)}, ${fmt(y / 4)}, ${fmt(u)}` }[d]
      || `${fmt(y)} ÷ ${d} = ${fmt(u)} (Probe: ${fmt(u)} × ${d} = ${fmt(y)})`;
    return [
      `Erst durch den Nenner: ${fmt(y)} ÷ ${d} ergibt ein Stück (${n === 1 ? 'das ist schon die Antwort' : `1/${d}`})`,
      how,
      n === 1 ? `Zähler ist 1 → 1/${d} von ${fmt(y)} = ${fmt(res)}` : `Dann mal Zähler: ${fmt(u)} × ${n} = ${fmt(res)}`,
    ];
  },

};
