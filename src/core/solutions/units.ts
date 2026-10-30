import type { Task } from '../../types.ts';
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
      return [
        'Dimensionslos heißt: alle Einheiten kürzen sich weg',
        `Erst zusammenfassen: [${p.ua}] ${p.o1} [${p.ub}] = [${uStr(comb)}]`,
        p.o2 === '÷'
          ? `Teilen durch ? soll alles kürzen: [${uStr(comb)}] ÷ ? = 1 → ? hat dieselbe Einheit wie das Ergebnis`
          : `Mal ? soll alles kürzen: [${uStr(comb)}] × ? = 1 → ? ist der Kehrwert der Einheit`,
        `Das Fragezeichen hat die Einheit ${ans}`,
      ];
    }
    return [
      'Dimensionslos heißt: alle Einheiten kürzen sich weg',
      `Gegeben: [${p.ua}]`,
      p.o2 === '÷'
        ? `Teilen: [${p.ua}] ÷ [${p.ua}] = 1 → durch dieselbe Einheit teilen`
        : `Malnehmen: nur der Kehrwert kürzt sich weg – [${p.ua}] × [${uStr(uInv(base))}] = 1`,
      `Das Fragezeichen hat die Einheit ${ans}`,
    ];
  },

  'units.result': (p: SP, task: Task) => {
    const ex = [p.ua, p.o1, p.ub, ...(p.o2 ? [p.o2, p.uc] : [])];
    let raw = parseU(ex[0] ?? '');
    for (let i = 1; i < ex.length; i += 2) raw = ex[i] === '×' ? uMul(raw, parseU(ex[i + 1] ?? '')) : uDiv(raw, parseU(ex[i + 1] ?? ''));
    const names = [...new Set(raw.map(([n]) => n))];
    const cancelled = names.filter((n) => raw.some(([x, e]) => x === n && e > 0) && raw.some(([x, e]) => x === n && e < 0));
    const steps = ['Einheiten rechnen wie Brüche: was oben und unten steht, kürzt sich'];
    if (ex.includes('÷')) steps.push('Teilen heißt mit dem Kehrwert malnehmen');
    steps.push(`Ausschreiben: ${ex.map((x, i) => (i % 2 ? x : `[${x}]`)).join(' ')} = ${uRaw(raw)}`);
    steps.push(cancelled.length ? `Kürzen: ${cancelled.join(', ')}` : 'Hier kürzt sich nichts – die Einheiten setzen sich zusammen');
    steps.push(`Ergebnis: ${optText(p, task)}`);
    return steps;
  },

  'units.convert': (p: SP, task: Task) => {
    const { x, y, fam } = p, F = (n: number) => fmt(n, 4), u = task.unit, res = `Ergebnis: ${F(task.expected)} ${u}`;
    switch (fam) {
      case 1: return [
        'Erst die Zeit: Monat → Jahr heißt × 12',
        `${F(x)} Tsd. € × 12 = ${F(x * 12)} Tsd. €/Jahr`,
        'Dann die Größe: 1.000 Tsd. = 1 Mio. → ÷ 1.000',
        `${F(x * 12)} ÷ 1.000 = ${F(task.expected)}`, res,
      ];
      case 2: return [
        '1 m/s = 3,6 km/h – also km/h durch 3,6 teilen',
        `Bequemer: ÷ 3,6 = × 10 ÷ 36 → ${F(x)} × 10 = ${F(x * 10)}`,
        `${F(x * 10)} ÷ 36 = ${F(task.expected)}`, res,
      ];
      case 3: return [
        '1 m/s = 3,6 km/h – also m/s mal 3,6',
        `3,6 = 4 − 0,4: ${F(x)} × 4 = ${F(x * 4)} und ${F(x)} × 0,4 = ${F(x * 0.4)}`,
        `${F(x * 4)} − ${F(x * 0.4)} = ${F(task.expected)}`, res,
      ];
      case 4: {
        const w = Math.trunc(x), r = round(x - w, 4);
        return [
          'h/Tag × Tage: „Tag“ kürzt sich, es bleibt h/Jahr',
          r > 0 ? `Zerlegen: ${F(y)} × ${F(w)} = ${F(y * w)} und ${F(y)} × ${F(r)} = ${F(y * r)}` : `${F(y)} × ${F(w)} = ${F(y * w)}`,
          r > 0 ? `${F(y * w)} + ${F(y * r)} = ${F(task.expected)}` : `Probe: ${F(task.expected)} ÷ ${F(y)} = ${F(x)}`, res,
        ];
      }
      case 5: return [
        '1 h = 60 Min. → pro Stunde ist 60-mal so viel wie pro Minute',
        `${F(x)} × 60 = ${F(x)} × 6 × 10`,
        `${F(x)} × 6 = ${F(x * 6)}, dann × 10 = ${F(task.expected)}`, res,
      ];
      case 6: return [
        'Größe: Mio. → Tsd. heißt × 1.000',
        `${F(x)} Mio. = ${F(x * 1000)} Tsd. €/Jahr`,
        'Zeit: Jahr → Monat heißt ÷ 12',
        `${F(x * 1000)} ÷ 12 = ${F(task.expected)}`, res,
      ];
      case 7: return [
        'Stück/Tag × Tage: „Tag“ kürzt sich, es bleibt Stück/Jahr',
        `${F(x)} × ${F(y)} = ${F(x * y)} Stück/Jahr`,
        'Stück → Tsd. Stück: ÷ 1.000',
        `${F(x * y)} ÷ 1.000 = ${F(task.expected)}`, res,
      ];
      case 8: return [
        'Erst Minuten pro Jahr: Min./Tag × Tage',
        `${F(x)} × ${F(y)} = ${F(x * y)} Min./Jahr`,
        'Minuten → Stunden: ÷ 60',
        `${F(x * y)} ÷ 60 = ${F(task.expected)}`, res,
      ];
      default: return [
        `Mio. ausschreiben: ${F(x)} Mio. = ${F(x * 1e6)} Stück/Jahr`,
        `Pro Tag heißt: durch ${F(y)} Tage teilen`,
        `${F(x * 1e6)} ÷ ${F(y)} = ${F(task.expected)}`, res,
      ];
    }
  },

};
