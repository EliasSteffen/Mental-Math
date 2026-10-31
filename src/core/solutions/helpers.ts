// Gemeinsame Helfer der Lösungswege
import type { Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt, round } from '../numbers.ts';

/** Alle möglichen Aufgabenparameter (je Subtyp nur ein Teil gesetzt); wird in solutionSteps() aus task.params gecastet. */
export interface SP {
  a: number; b: number; f: number; n: number; d: number; m: number; u: string; ua: string; ub: string; uc: string;
  o1: string; o2: string; k: number; D: number; p: number; y: number; alt: number; neu: number; r: number;
  nach: number; discount: number; m1: number; m2: number; r1: number; r2: number; T: number; base: number;
  I: number; s: number; F: number; v: number | string; R: number; G: number; C: number; B: number; O: number;
  A: number; t: number; V: number; H: number; S: number; E: number; fam: number; x: number; e: number;
  disp: string; fact: string;
  ex: string; ttl: string; lab: string; s1: string; s2: string; sn: string; hd: string; k2: number; a1: number; a2: number; p1: number; p2: number; d1: string; d2: string;
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

/** Prozentangabe in der UI-Sprache (de „12 %“, en „12%“) */
export const pc = (x: number | string): string => t('sol.pct', { x: typeof x === 'number' ? fmt(x) : x });

// ---------- 10 %-/1 %-Wege für "p % von y" (auch für Überschläge genutzt) ----------
export function pctOfSteps(p: number, y: number): string[] {
  const y10 = y / 10, y1 = y / 100, res = (p * y) / 100;
  const F = fmt;
  const of = (q: number, v: number): string => t('sol.pof.of', { p: q, y: F(y), v: F(v) });
  if (p === 10) return [t('sol.pof.10'), `${F(y)} ÷ 10 = ${F(res)}`, t('sol.pof.check', { res: F(res), k: 10, y: F(y) })];
  if (p === 50) return [t('sol.pof.50'), `${F(y)} ÷ 2 = ${F(res)}`, t('sol.pof.check', { res: F(res), k: 2, y: F(y) })];
  if (p === 25) return [t('sol.pof.25'), `${F(y)} ÷ 2 = ${F(y / 2)}`, `${F(y / 2)} ÷ 2 = ${F(res)}`];
  if (p === 75) return [t('sol.pof.75'), `${F(y)} ÷ 2 = ${F(y / 2)}, ${F(y / 2)} ÷ 2 = ${F(y / 4)}`, `3 × ${F(y / 4)} = ${F(res)}`];
  if (p === 5) return [of(10, y10), t('sol.pof.5'), `${F(y10)} ÷ 2 = ${F(res)}`];
  if (p % 10 === 0) {
    const k = p / 10;
    return [of(10, y10), t('sol.pof.k10', { p, k }), `${k} × ${F(y10)} = ${F(res)}`];
  }
  if (p % 10 === 5) {
    const tens = (p - 5) / 10;
    return [
      of(10, y10),
      t('sol.pof.x5', { p, tens: tens === 1 ? pc(10) : `${tens} × ${pc(10)}`, h: F(y10 / 2) }),
      `${tens === 1 ? F(y10) : F(tens * y10)} + ${F(y10 / 2)} = ${F(res)}`,
    ];
  }
  const tens = Math.floor(p / 10), o = p % 10;
  if (o <= 7) {
    if (tens === 0) {
      return [t('sol.pof.one', { y: F(y), v: F(y1) }), t('sol.pof.plaus', { v: F(y10), p }), t('sol.pof.small', { p, v: F(y1), res: F(res) })];
    }
    return [
      of(10, y10),
      t('sol.pof.ones', { y: F(y), y1: F(y1), o, v: F(o * y1) }),
      tens === 1 ? `${F(y10)} + ${F(o * y1)} = ${F(res)}` : t('sol.pof.plus', { t: tens, y10: F(y10), ty: F(tens * y10), v: F(o * y1), res: F(res) }),
    ];
  }
  const up = 10 - o, P = (tens + 1) * 10;
  return [
    of(P, (P * y) / 100),
    t('sol.pof.ones', { y: F(y), y1: F(y1), o: up, v: F(up * y1) }),
    t('sol.pof.minus', { p, P, up, a: F((P * y) / 100), b: F(up * y1), res: F(res) }),
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
  if (!ch.length) return t('sol.rn.none');
  const dirs = ch.map(([o, r]) => (r > o ? 'up' : 'down'));
  let why = '';
  if (ch.length === 2) {
    if (!div && dirs[0] !== dirs[1]) why = t('sol.rn.opp');
    if (div && dirs[0] === dirs[1]) why = t(dirs[0] === 'up' ? 'sol.rn.bothUp' : 'sol.rn.bothDown');
  }
  return t('sol.rn.round', { why, list: ch.map(([o, r]) => `${fmt(o)} ≈ ${fmt(r)}`).join(', ') });
}

export const dist10 = (n: number): number => Math.min(n % 10, 10 - (n % 10));

/** Text der richtigen Antwortoption einer Auswahl-Aufgabe (params.c<index>) */
export function optText(p: SP, task: Task): string {
  const v = (p as unknown as Record<string, unknown>)['c' + task.expected];
  return typeof v === 'string' ? v : '';
}
