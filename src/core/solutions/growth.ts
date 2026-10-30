import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { R } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const growthSteps: Record<string, StepFn> = {
  'growth.compound': ({ r, n }: SP, task: Task) => {
    const c2 = (n * (n - 1)) / 2, c3 = (n * (n - 1) * (n - 2)) / 6;
    const q = R((r * r) / 100), t2 = R(c2 * q), t3 = R((c3 * r ** 3) / 1e4);
    const base = n * r, withT3 = n >= 3 && t3 >= 0.05;
    const total = base + t2 + (withT3 ? t3 : 0);
    const out = [
      `Grobwert ohne Zinseszins: ${n} × ${fmt(r)} % = ${fmt(base)} %`,
      `Zuschlag 1: ${c2} Jahres-Paare, jedes bringt ${fmt(r)} % × ${fmt(r)} % = ${fmt(q)} % → ${c2} × ${fmt(q)} = ${fmt(t2)} %`,
    ];
    if (withT3) out.push(`Zuschlag 2: ${c3} × (${fmt(r)} %)³ = ${c3} × ${fmt(R(r ** 3 / 1e4))} = ${fmt(t3)} %`);
    out.push(`Zusammen: ${fmt(base)} + ${fmt(t2)}${withT3 ? ` + ${fmt(t3)}` : ''} ≈ ${fmt(round(total, 1))} %`);
    out.push(`Exakt: ${fmt(task.expected)} %`);
    return out;
  },

  'growth.rule72': ({ r }: SP, task: Task) => [
    `72er-Regel: Verdopplungszeit ≈ 72 ÷ Wachstumsrate in %`,
    `72 ÷ ${r}: ${r} × ${fmt(72 / r)} = 72`,
    `Probe: ${fmt(72 / r)} Jahre × ${r} % ≈ 72 % Gesamtwachstum, also etwa verdoppelt`,
    `Exakt: ${fmt(task.expected)} Jahre`,
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
      `Gesamtfaktor: ${fmt(E)} ÷ ${fmt(Sv)} = ${fmt(F, 6)} (in ${n} Jahren)`,
      `Grobe Schranke: (${fmt(F - 1, 6)} ÷ ${n}) ≈ ${fmt(avg)} % pro Jahr – die echte Rate ist wegen Zinseszins etwas kleiner`,
      `Glatte Rate probieren (${fmt(r)} % → Faktor ${fmt(g, 4)}): ${seq.join('; ')}`,
      `Das trifft ${fmt(F, 6)} → ${fmt(task.expected)} % pro Jahr`,
    ];
  },

};
