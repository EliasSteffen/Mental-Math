import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';
import { R, roundSig } from './helpers.ts';
import type { SP, StepFn } from './helpers.ts';

export const bizSteps: Record<string, StepFn> = {
  'biz.payback': ({ I, s }: SP, task: Task) => {
    const dec = !Number.isInteger(s);
    const i2 = dec ? I * 2 : I, s2 = dec ? s * 2 : s;
    const q = Math.floor(i2 / s2 + 1e-9), rem = R(i2 - s2 * q);
    const res = task.expected;
    const steps = [`Payback = Investition ÷ Ersparnis pro Jahr = ${fmt(I)} ÷ ${fmt(s)}`];
    if (dec) steps.push(`Komma loswerden: beide mal 2 → ${fmt(i2)} ÷ ${fmt(s2)}`);
    steps.push(`${fmt(s2)} × ${q} = ${fmt(s2 * q)}`);
    if (rem === 0) steps.push(`Kein Rest → ${fmt(res)} Jahre`);
    else steps.push(`Rest ${fmt(rem)} ÷ ${fmt(s2)} = ${fmt(R(rem / s2))} → ${q} + ${fmt(R(rem / s2))} = ${fmt(res)} Jahre`);
    return steps;
  },

  'biz.breakeven': ({ F, p, v: vRaw }: SP, task: Task) => {
    const v = Number(vRaw);
    const db = p - v, Fk = F / 1000, j = Fk / db;
    return [
      `Deckungsbeitrag pro Stück: ${fmt(p)} − ${fmt(v)} = ${fmt(db)} €`,
      `Break-even = Fixkosten ÷ Deckungsbeitrag = ${fmt(F)} ÷ ${fmt(db)}`,
      `Tausender abtrennen: ${fmt(F)} = ${fmt(Fk)} × 1.000 → ${fmt(Fk)} ÷ ${fmt(db)} = ${fmt(j)} (Probe: ${fmt(db)} × ${fmt(j)} = ${fmt(Fk)})`,
      `${fmt(j)} × 1.000 = ${fmt(task.expected)} Stück`,
    ];
  },

  'biz.margin': ({ R: Rv, G }: SP, task: Task) => {
    const r1 = Rv / 100, m = task.expected;
    return [
      `Marge = Gewinn ÷ Umsatz = ${fmt(G)} ÷ ${fmt(Rv)}`,
      `1 % vom Umsatz: ${fmt(Rv)} ÷ 100 = ${fmt(r1)} Mio. €`,
      `Wie viele 1 %-Stücke stecken im Gewinn? ${fmt(G)} ÷ ${fmt(r1)} = ${fmt(m)}`,
      `Probe: ${fmt(m)} × ${fmt(r1)} = ${fmt(G)} → Marge ${fmt(m)} %`,
    ];
  },

  'biz.roi': ({ C, B }: SP, task: Task) => {
    const g = R(B - C), c10 = R(C / 10), k = R(g / c10);
    return [
      `ROI = (Nutzen − Kosten) ÷ Kosten`,
      `Gewinn: ${fmt(B)} − ${fmt(C)} = ${fmt(g)} Mio. €`,
      `10 % von ${fmt(C)} = ${fmt(c10)} Mio. €`,
      `${fmt(g)} ÷ ${fmt(c10)} = ${fmt(k)} ${k === 1 ? 'Zehnerschritt' : 'Zehnerschritte'} → ${fmt(k)} × 10 % = ${fmt(task.expected)} %`,
    ];
  },

  'biz.tco': ({ O, A, n }: SP, task: Task) => {
    const whole = Math.floor(A), frac = R(A - whole), X = n * A;
    return [
      `TCO = Einmalkosten + Jahre × laufende Kosten`,
      frac === 0
        ? `Laufende Kosten: ${n} × ${fmt(A)} = ${fmt(X)} Mio. €`
        : `Laufende Kosten: ${n} × ${fmt(A)} = ${n} × ${whole} + ${n} × ${fmt(frac)} = ${fmt(n * whole)} + ${fmt(n * frac)} = ${fmt(X)} Mio. €`,
      `Plus Einmalkosten: ${fmt(O)} + ${fmt(X)} = ${fmt(task.expected)} Mio. €`,
    ];
  },

  'biz.fte': ({ V, t, s, H }: SP, task: Task) => {
    const M = R(V * t), Sx = R((M * s) / 100), hrs = (Sx * 1e6) / 60;
    const hr = roundSig(hrs, 2), x = hr / H;
    const sPhrase = s === 25 ? `25 % = Viertel: ${fmt(M)} ÷ 4 = ${fmt(Sx)}`
      : s === 50 ? `50 % = Hälfte: ${fmt(M)} ÷ 2 = ${fmt(Sx)}`
        : s === 10 ? `10 % von ${fmt(M)} = ${fmt(Sx)}`
        : `10 % von ${fmt(M)} = ${fmt(M / 10)}, also ${s} % = ${s / 10} × ${fmt(M / 10)} = ${fmt(Sx)}`;
    return [
      `Gesamtminuten: ${fmt(V)} Mio. × ${fmt(t)} min = ${fmt(M)} Mio. min`,
      `KI spart ${fmt(s)} %: ${sPhrase} Mio. min`,
      `In Stunden (÷ 60): ${fmt(Sx)} Mio. min ÷ 60 ≈ ${fmt(round(hrs, 0))} h${hr !== round(hrs, 0) ? `, gerundet ${fmt(hr)} h` : ''}`,
      `Durch ${fmt(H)} h pro FTE: ${fmt(hr)} ÷ ${fmt(H)} ≈ ${fmt(round(x, 1))} FTE`,
      `Exakt: ${fmt(task.expected)} FTE`,
    ];
  },

  'biz.sla': ({ a }: SP, task: Task) => {
    const u = R(100 - a), h = R(u * 88), min = a === 99.99;
    const steps = [
      `Ausfallanteil: 100 % − ${fmt(a)} % = ${fmt(u)} %`,
      `1 Jahr = 365 × 24 = 8.760 h ≈ 8.800 h, also 1 % ≈ 88 h`,
      `${fmt(u)} % ≈ ${fmt(u)} × 88 h = ${fmt(h)} h`,
    ];
    if (min) steps.push(`In Minuten: ${fmt(h)} h × 60 ≈ ${fmt(round(h * 60, 0))} min`);
    steps.push(`Exakt: ${fmt(task.expected)} ${min ? 'min' : 'h'}`);
    return steps;
  },

};
