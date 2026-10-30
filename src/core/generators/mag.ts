import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { p10 } from '../units.ts';
import { task, lv } from './helpers.ts';
import type { Gen } from './helpers.ts';

// ---------- Größenordnungen ----------
const WORD: Record<number, string> = { 3: 'Tsd.', 6: 'Mio.', 9: 'Mrd.' };
const sciStr = (a: number, p: number): string => (a === 1 ? p10(p) : `${fmt(a, 4)}·${p10(p)}`);

// a × 10^p als Text: 'sci' (4,2·10⁵), 'word' (420 Tsd.), 'plain' (420.000); fällt auf sci zurück
type Style = 'sci' | 'word' | 'plain';
function dispNum(a: number, p: number, style: Style): string {
  if (style === 'word') {
    const e = [9, 6, 3].find((x) => x <= p && p - x <= 2);
    if (e) return `${fmt(round(a * 10 ** (p - e), 6), 6)} ${WORD[e] ?? ''}`;
  } else if (style === 'plain' && p >= -5 && p <= 6) {
    return fmt(round(a * 10 ** p, 8), 8);
  }
  return sciStr(a, p);
}

type Fact = [label: string, value: string, a: number, n: number, level: number];
const FACTS: Fact[] = [
  ['Einwohner Deutschland', '84 Mio.', 8.4, 7, 1], ['Sekunden pro Tag', '86.400', 8.64, 4, 1],
  ['Stunden pro Jahr', '8.760', 8.76, 3, 1], ['Tage pro Jahr', '365', 3.65, 2, 1],
  ['Einwohner Welt', '8,2 Mrd.', 8.2, 9, 1], ['Minuten pro Tag', '1.440', 1.44, 3, 1],
  ['Wochen pro Jahr', '52', 5.2, 1, 1],
  ['Haushalte Deutschland', '41 Mio.', 4.1, 7, 2], ['Erwerbstätige Deutschland', '46 Mio.', 4.6, 7, 2],
  ['Einwohner EU', '450 Mio.', 4.5, 8, 2], ['Pkw in Deutschland', '49 Mio.', 4.9, 7, 2],
  ['Arbeitsstunden pro FTE und Jahr', '1.700', 1.7, 3, 2], ['Einwohner USA', '335 Mio.', 3.35, 8, 2],
  ['Einwohner Berlin', '3,7 Mio.', 3.7, 6, 2], ['Arbeitstage pro Jahr', '220', 2.2, 2, 2],
  ['Minuten pro Jahr', '525.600', 5.256, 5, 2],
  ['BIP Deutschland in €', '4.300 Mrd.', 4.3, 12, 3], ['Sekunden pro Jahr', '31,5 Mio.', 3.15, 7, 3],
  ['Einwohner China', '1,4 Mrd.', 1.4, 9, 3], ['Einwohner Indien', '1,4 Mrd.', 1.4, 9, 3],
  ['Sekunden pro Monat', '2,6 Mio.', 2.6, 6, 3],
];
const EXP_HINT = 'a × 10ⁿ mit 1 ≤ a < 10';

// Zwei Faktoren a × 10^p für Produkt/Quotient
function twoFactors(rng: Rng, L: Level, kind: 'product' | 'ratio') {
  let a1: number, a2: number, p1: number, p2: number;
  const styles: Style[] = lv(L, ['sci', 'word', 'plain'], ['sci', 'word', 'plain', 'word'], ['sci', 'word', 'sci']);
  for (;;) {
    if (kind === 'product') {
      if (L === 1) {
        a1 = pick([1, 2, 3], rng); a2 = pick([1, 2, 3], rng); p1 = randInt(2, 6, rng); p2 = randInt(2, 5, rng);
      } else if (L === 2) {
        a1 = randInt(2, 9, rng); a2 = randInt(2, 9, rng); p1 = randInt(2, 7, rng); p2 = randInt(2, 6, rng);
      } else {
        a1 = pick([1.2, 1.5, 2.5, 3.2, 4, 6, 7.5, 8], rng); a2 = pick([1.5, 2.4, 3, 4, 5, 6.4, 8], rng);
        p1 = randInt(-4, 9, rng); p2 = randInt(-4, 9, rng);
      }
    } else if (L === 1) {
      a2 = pick([1, 2, 3, 4], rng); a1 = a2 * randInt(1, Math.floor(9 / a2), rng); p1 = randInt(6, 10, rng); p2 = randInt(2, 4, rng);
    } else if (L === 2) {
      a1 = randInt(1, 9, rng); a2 = randInt(2, 9, rng); p1 = randInt(3, 10, rng); p2 = randInt(2, 6, rng);
    } else {
      a1 = pick([1.2, 1.5, 2.4, 3, 4.5, 6, 7.5, 9], rng); a2 = pick([1.5, 2, 2.5, 4, 5, 6.4, 8], rng);
      p1 = randInt(-3, 9, rng); p2 = randInt(-3, 9, rng);
    }
    if (a1 === a2 && L > 1) continue;
    break;
  }
  const d1 = dispNum(a1, p1, pick(styles, rng)), d2 = dispNum(a2, p2, pick(styles, rng));
  return { a1, a2, p1, p2, d1, d2 };
}

export const magGen: Record<string, Gen> = {
  'mag.exponent': (rng: Rng, L: Level): Task => {
    const a = pick(lv(L, [1.5, 2, 3, 4.2, 5, 6.5, 8, 9], [1.2, 2.5, 3.6, 4.8, 5.5, 7.2, 8.4, 9.5], [1.05, 2.4, 3.2, 4.5, 6.8, 7.5, 9.2]), rng);
    const word = L === 1 ? rng() < 0.6 : rng() < 0.5;
    let u = '', e = 0, k: number, n: number, disp: string;
    if (word) {
      e = pick([3, 6, 9], rng);
      k = pick(lv(L, [0], [0, 1, 2], [-2, -1, 3, 2]), rng);
      n = k + e;
      u = WORD[e] ?? '';
      disp = `${fmt(round(a * 10 ** k, 6), 6)} ${u}`;
    } else {
      n = L === 1 ? randInt(3, 5, rng) : L === 2 ? randInt(-4, 6, rng) : randInt(-6, -2, rng);
      if (L === 2 && n >= 0 && n < 3) n = n - 4;
      k = n;
      disp = fmt(round(a * 10 ** n, 9), 9);
    }
    return task('mag.exponent', { params: { a, k, e, n, u, disp },
      prompt: `${disp} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: n,
    });
  },
  'mag.facts': (rng: Rng, L: Level): Task => {
    const pool = FACTS.filter((f) => (L === 1 ? f[4] === 1 : L === 2 ? f[4] <= 2 : f[4] >= 2));
    const [label, v, a, n] = pick(pool, rng);
    return task('mag.facts', { params: { fact: label, v, a, n },
      prompt: `Größenordnung: ${label} – Wert = a × 10ⁿ, n = ?`,
      hint: EXP_HINT,
      expected: n,
    });
  },
  'mag.product': (rng: Rng, L: Level): Task => {
    const f = twoFactors(rng, L, 'product');
    const carry = round(f.a1 * f.a2, 6) >= 10 ? 1 : 0;
    return task('mag.product', { params: { a1: f.a1, p1: f.p1, a2: f.a2, p2: f.p2, d1: f.d1, d2: f.d2 },
      prompt: `${f.d1} × ${f.d2} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: f.p1 + f.p2 + carry,
    });
  },
  'mag.ratio': (rng: Rng, L: Level): Task => {
    const f = twoFactors(rng, L, 'ratio');
    const borrow = f.a1 < f.a2 ? 1 : 0;
    return task('mag.ratio', { params: { a1: f.a1, p1: f.p1, a2: f.a2, p2: f.p2, d1: f.d1, d2: f.d2 },
      prompt: `${f.d1} ÷ ${f.d2} = a × 10ⁿ – wie lautet n?`,
      hint: EXP_HINT,
      expected: f.p1 - f.p2 - borrow,
    });
  },
};
