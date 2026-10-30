// Lösungswege der Rechentricks (zeigen den Trick mit den echten Zahlen)
import { fmt } from '../numbers.ts';
import type { SP, StepFn } from './helpers.ts';

export const tricksSteps: Record<string, StepFn> = {
  'tricks.x11': ({ n }: SP, task) => {
    const res = task.expected;
    if (n < 100) {
      const a = Math.floor(n / 10), b = n % 10, s = a + b;
      const steps = [
        `×11-Trick: erste und letzte Ziffer bleiben außen, die Quersumme kommt in die Mitte`,
        `${n} → ${a} | ${a}+${b} | ${b} = ${a} | ${s} | ${b}`,
      ];
      if (s > 9) steps.push(`Mitte ${s} ist zweistellig: die ${Math.floor(s / 10)} wandert als Übertrag nach links → ${a + 1} | ${s % 10} | ${b}`);
      steps.push(`${n} × 11 = ${fmt(res)}`);
      return steps;
    }
    const d = String(n).split('').map(Number) as [number, number, number];
    return [
      `×11 heißt × 10 + × 1: die Zahl um eine Stelle verschoben zu sich selbst addieren`,
      `Ziffern ${d[0]} | ${d[0]}+${d[1]} | ${d[1]}+${d[2]} | ${d[2]} = ${d[0]} | ${d[0] + d[1]} | ${d[1] + d[2]} | ${d[2]}`,
      `Alternativ: ${fmt(n * 10)} + ${fmt(n)}`,
      `Überträge von rechts nach links einrechnen → ${fmt(res)}`,
    ];
  },

  'tricks.diffsq': ({ a, b, m, d }: SP, task) => [
    `${a} und ${b} liegen symmetrisch um ${m}: ${m} − ${d} und ${m} + ${d}`,
    `3. Binomische Formel: (${m} − ${d}) × (${m} + ${d}) = ${m}² − ${d}²`,
    `${m}² = ${fmt(m * m)}, ${d}² = ${fmt(d * d)}`,
    `${fmt(m * m)} − ${fmt(d * d)} = ${fmt(task.expected)}`,
  ],

  'tricks.near100': ({ a, b }: SP, task) => {
    const da = 100 - a, db = 100 - b, h = 100 - da - db;
    return [
      `Beide Zahlen liegen knapp unter 100: Abstand ${da} (${a} = 100 − ${da}) und ${db} (${b} = 100 − ${db})`,
      `Hunderter: 100 − ${da} − ${db} = ${h} (oder kreuzweise ${a} − ${db} = ${h}) → ${fmt(h * 100)}`,
      `Dazu das Produkt der Abstände: ${da} × ${db} = ${da * db}`,
      `${fmt(h * 100)} + ${da * db} = ${fmt(task.expected)}`,
    ];
  },

  'tricks.square5': ({ n }: SP, task) => {
    const t = Math.floor(n / 10);
    return [
      `Zahl auf 5: Zehnerteil ist ${t} (${n} = ${t}5)`,
      `${t} × (${t} + 1) = ${t} × ${t + 1} = ${t * (t + 1)}`,
      `Dahinter immer 25 anhängen: ${t * (t + 1)} | 25`,
      `${n}² = ${fmt(task.expected)}`,
    ];
  },

  'tricks.pctswap': ({ p, y }: SP, task) => {
    const how = y === 50 ? `50 % ist die Hälfte: ${p} ÷ 2` : y === 25 ? `25 % ist ein Viertel: ${p} ÷ 4` : y === 20 ? `20 % ist ein Fünftel: ${p} ÷ 5` : `10 % ist ein Zehntel: ${p} ÷ 10`;
    return [
      `Tauschregel: ${p} % von ${y} = ${y} % von ${p} (beide sind ${p} × ${y} ÷ 100)`,
      `${y} % von ${p} ist leichter zu rechnen`,
      how,
      `${how.split(': ')[1]} = ${fmt(task.expected)}`,
    ];
  },

  'tricks.subround': ({ a, b }: SP, task) => {
    const k = 10 - (b % 10), r = b + k;
    return [
      `${fmt(b)} liegt knapp unter ${fmt(r)}: aufrunden um ${k}`,
      `${fmt(a)} − ${fmt(r)} = ${fmt(a - r)}`,
      `Es wurde ${k} zu viel abgezogen: ${k} wieder dazu`,
      `${fmt(a - r)} + ${k} = ${fmt(task.expected)}`,
    ];
  },
};
