import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { gcd, sg, R, pctOfSteps } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const pctSteps: Record<string, StepFn> = {
  'pct.of': ({ p, y }: SP) => pctOfSteps(p, y),

  'pct.change': ({ alt, neu }: SP, task: Task) => {
    const diff = Math.abs(neu - alt), up = neu > alt, a10 = alt / 10, steps = R(diff / a10);
    return [
      `Änderung: ${fmt(neu)} − ${fmt(alt)} = ${up ? '+' : '−'}${fmt(diff)} Mio. € (${up ? 'gestiegen' : 'gesunken'})`,
      `Bezug ist immer der alte Wert ${fmt(alt)} (nicht der neue)`,
      `10 % von ${fmt(alt)} = ${fmt(a10)}`,
      `${fmt(diff)} ÷ ${fmt(a10)} = ${fmt(steps)} ${steps === 1 ? 'Zehnerschritt' : 'Zehnerschritte'} → ${fmt(steps)} × 10 % = ${fmt(task.expected)} %${up ? '' : ' (Rückgang)'}`,
    ];
  },

  'pct.reverse': ({ r, nach, discount }: SP, task: Task) => {
    const X = discount ? 100 - r : 100 + r, g = gcd(X, 100), num = X / g, den = 100 / g;
    const part = R(nach / num);
    return [
      `${discount ? `Nach ${fmt(r)} % Rabatt` : `Nach ${fmt(r)} % Aufschlag`} sind ${fmt(nach)} € genau ${X} % vom Ursprungspreis (${discount ? `nicht ${fmt(r)} % wieder draufrechnen!` : `nicht ${fmt(r)} % einfach abziehen!`})`,
      `${X} % = ${num}/${den}: ${fmt(nach)} € entsprechen ${num} gleichen Teilen, der Ursprungspreis hat ${den} Teile`,
      `1 Teil = ${fmt(nach)} ÷ ${num} = ${fmt(part)} €`,
      `Ursprungspreis = alle ${den} Teile = ${den} × ${fmt(part)} = ${fmt(task.expected)} €`,
    ];
  },

  'pct.points': ({ m1, m2 }: SP, task: Task) => {
    const d = m2 - m1, g = gcd(d, m1), n = d / g, dd = m1 / g;
    return [
      `Differenz: ${m2} % − ${m1} % = ${d} Prozentpunkte (das ist noch kein Prozent-Anstieg)`,
      `Bezug ist der alte Wert ${m1} %: ${d} ÷ ${m1}`,
      dd === 1 ? `${d}/${m1} = ${n}: der Zuwachs ist genau ${n === 1 ? 'so groß wie' : `${n}-mal so groß wie`} der alte Wert` : g > 1 ? `Kürzen: ${d}/${m1} = ${n}/${dd}` : `${d}/${m1} lässt sich nicht kürzen`,
      dd === 1 ? `${n} × 100 % = ${fmt(task.expected)} %` : `In Prozent: ${n} × 100 = ${n * 100}, ${n * 100} ÷ ${dd} = ${fmt(task.expected)} %`,
    ];
  },

  'pct.chain': ({ r1, r2 }: SP, task: Task) => {
    const f = (r: number) => fmt(R(1 + r / 100));
    const s = r1 + r2, t = R((r1 * r2) / 100);
    return [
      `Faktoren: ${sg(r1)} % → ${f(r1)}, ${sg(r2)} % → ${f(r2)} (nie einfach die Prozente addieren)`,
      `Prozente addieren: ${fmt(r1)} ${r2 < 0 ? '−' : '+'} ${fmt(Math.abs(r2))} = ${fmt(s)} %`,
      `Wechselwirkung: ${fmt(r1)} % × ${fmt(r2)} % = (${fmt(r1)} × ${fmt(r2)}) ÷ 100 = ${sg(t)} %`,
      `${fmt(s)} ${t < 0 ? '−' : '+'} ${fmt(Math.abs(t))} = ${fmt(task.expected)} %`,
    ];
  },

};
