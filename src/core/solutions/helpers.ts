// Gemeinsame Helfer der Lösungswege
import type { Task } from '../../types.ts';
import { fmt, round } from '../numbers.ts';

/** Alle möglichen Aufgabenparameter (je Subtyp nur ein Teil gesetzt); wird in solutionSteps() aus task.params gecastet. */
export interface SP {
  a: number; b: number; f: number; n: number; d: number; m: number; u: string; ua: string; ub: string; uc: string;
  o1: string; o2: string; k: number; D: number; p: number; y: number; alt: number; neu: number; r: number;
  nach: number; discount: number; m1: number; m2: number; r1: number; r2: number; T: number; base: number;
  I: number; s: number; F: number; v: number | string; R: number; G: number; C: number; B: number; O: number;
  A: number; t: number; V: number; H: number; S: number; E: number; fam: number; x: number; e: number;
  disp: string; fact: string; a1: number; a2: number; p1: number; p2: number; d1: string; d2: string;
}
export type StepFn = (p: SP, task: Task) => string[];

export const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n: number | string): string => String(n).split('').map((c) => SUP[+c] ?? c).join('');
export const pow10 = (n: number): string => `10${sup(n)}`;
export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
export const sg = (n: number): string => (n > 0 ? '+' : '') + fmt(n);
export const R = (n: number): number => round(n, 6);

// 1.200 → { m: 12, z: 2 }
export function strip(n: number): { m: number; z: number } {
  let m = Math.round(n), z = 0;
  while (m !== 0 && m % 10 === 0) { m /= 10; z++; }
  return { m, z };
}
export const sig = (n: number): number => String(strip(n).m).length;
export function roundSig(n: number, s: number): number {
  const p = 10 ** (Math.floor(Math.log10(n)) - s + 1);
  return Math.round(n / p) * p;
}
export const near10 = (n: number): number => Math.round(n / 10) * 10;
export const near5 = (n: number): number => Math.round(n / 5) * 5;
export const uniq = (xs: number[]): number[] => [...new Set(xs)];

// ---------- 10 %-/1 %-Wege für "p % von y" (auch für Überschläge genutzt) ----------
export function pctOfSteps(p: number, y: number): string[] {
  const y10 = y / 10, y1 = y / 100, res = (p * y) / 100;
  const F = fmt;
  if (p === 10) {
    return [`10 % heißt: durch 10 teilen (Komma eine Stelle nach links)`, `${F(y)} ÷ 10 = ${F(res)}`, `Probe: ${F(res)} × 10 = ${F(y)} → ${F(res)}`];
  }
  if (p === 50) {
    return [`50 % ist die Hälfte`, `${F(y)} ÷ 2 = ${F(res)}`, `Probe: ${F(res)} × 2 = ${F(y)} → ${F(res)}`];
  }
  if (p === 25) {
    return [`25 % ist ein Viertel: zweimal halbieren`, `${F(y)} ÷ 2 = ${F(y / 2)}`, `${F(y / 2)} ÷ 2 = ${F(res)}`];
  }
  if (p === 75) {
    return [
      `75 % sind drei Viertel: erst ein Viertel, dann mal 3`,
      `${F(y)} ÷ 2 = ${F(y / 2)}, ${F(y / 2)} ÷ 2 = ${F(y / 4)}`,
      `3 × ${F(y / 4)} = ${F(res)}`,
    ];
  }
  if (p === 5) {
    return [`10 % von ${F(y)} = ${F(y10)}`, `5 % ist die Hälfte von 10 %`, `${F(y10)} ÷ 2 = ${F(res)}`];
  }
  if (p % 10 === 0) {
    const k = p / 10;
    return [`10 % von ${F(y)} = ${F(y10)}`, `${p} % sind ${k} × 10 %`, `${k} × ${F(y10)} = ${F(res)}`];
  }
  if (p % 10 === 5) {
    const t = (p - 5) / 10;
    return [
      `10 % von ${F(y)} = ${F(y10)}`,
      `${p} % = ${t === 1 ? '10 %' : `${t} × 10 %`} + 5 %, und 5 % ist die Hälfte von 10 % = ${F(y10 / 2)}`,
      `${t === 1 ? F(y10) : `${F(t * y10)}`} + ${F(y10 / 2)} = ${F(res)}`,
    ];
  }
  const t = Math.floor(p / 10), o = p % 10;
  if (o <= 7) {
    if (t === 0) {
      return [
        `1 % von ${F(y)} = ${F(y1)} (Komma zwei Stellen nach links)`,
        `Plausibel: 10 % wären ${F(y10)}, ${p} % also etwas weniger`,
        `${p} % = ${p} × ${F(y1)} = ${F(res)}`,
      ];
    }
    return [
      `10 % von ${F(y)} = ${F(y10)}`,
      `1 % von ${F(y)} = ${F(y1)}, also ${o} % = ${o} × ${F(y1)} = ${F(o * y1)}`,
      t === 1 ? `${F(y10)} + ${F(o * y1)} = ${F(res)}` : `${t} × ${F(y10)} = ${F(t * y10)}, dazu ${F(o * y1)} → ${F(res)}`,
    ];
  }
  const up = 10 - o;
  return [
    `${(t + 1) * 10} % von ${F(y)} = ${F(((t + 1) * y) / 10)}`,
    `1 % von ${F(y)} = ${F(y1)}, also ${up} % = ${up} × ${F(y1)} = ${F(up * y1)}`,
    `${p} % = ${(t + 1) * 10} % − ${up} % → ${F(((t + 1) * y) / 10)} − ${F(up * y1)} = ${F(res)}`,
  ];
}

// Bestes Rundungspaar: geringste Kosten bei Fehler <= tol, sonst kleinster Fehler
export interface Pair { a: number; b: number; err: number; c: number }
export function bestPair(
  aC: number[], bC: number[], truth: number, prod: (a: number, b: number) => number, cost: (a: number, b: number) => number,
  ok: (a: number, b: number) => boolean = () => true, tol = 0.06,
): Pair {
  const all: Pair[] = [];
  for (const a of aC) for (const b of bC) {
    if (!ok(a, b)) continue;
    all.push({ a, b, err: Math.abs(prod(a, b) - truth) / Math.abs(truth), c: cost(a, b) });
  }
  const good = all.filter((x) => x.err <= tol).sort((x, y) => x.c - y.c || x.err - y.err);
  return (good[0] ?? all.sort((x, y) => x.err - y.err)[0]) as Pair;
}

export function roundNote(pairs: Array<[number, number]>, div = false): string {
  // pairs: [[orig, gerundet]]; Produkt: gegenläufig runden hebt Fehler auf, Quotient: gleichläufig
  const ch = pairs.filter(([o, r]) => o !== r);
  if (!ch.length) return 'Die Zahlen sind schon handlich';
  const dirs = ch.map(([o, r]) => (r > o ? 'auf' : 'ab'));
  let why = '';
  if (ch.length === 2) {
    if (!div && dirs[0] !== dirs[1]) why = ' – einmal auf, einmal ab, damit sich der Fehler aufhebt';
    if (div && dirs[0] === dirs[1]) why = ` – beide ${dirs[0]}, dann hebt sich der Fehler beim Teilen weitgehend auf`;
  }
  return `Runden${why}: ${ch.map(([o, r]) => `${fmt(o)} ≈ ${fmt(r)}`).join(', ')}`;
}

export const dist10 = (n: number): number => Math.min(n % 10, 10 - (n % 10));

/** Text der richtigen Antwortoption einer Auswahl-Aufgabe (params.c<index>) */
export function optText(p: SP, task: Task): string {
  const v = (p as unknown as Record<string, unknown>)['c' + task.expected];
  return typeof v === 'string' ? v : '';
}
