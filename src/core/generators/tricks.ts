// Rechentricks: nur Aufgaben, bei denen der jeweilige Trick wirklich greift
import type { Level, Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt, randInt, pick } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const tricksGen: Record<string, Gen> = {
  // ×11: 2-stellig (L1 ohne Übertrag), L3 3-stellig
  'tricks.x11': (rng: Rng, L: Level): Task => {
    let n: number;
    for (;;) {
      n = L === 3 ? randInt(101, 999, rng) : randInt(12, 99, rng);
      const d = String(n).split('').map(Number);
      if (L === 1 && (d[0] ?? 0) + (d[1] ?? 0) > 9) continue;
      if (L === 1 && n % 11 === 0) continue;
      if (L === 3 && n % 10 === 0) continue;
      break;
    }
    return task('tricks.x11', { params: { n }, prompt: `${fmt(n)} × 11`, expected: n * 11 });
  },

  // (m − d)(m + d) mit m = Vielfaches von 10
  'tricks.diffsq': (rng: Rng, L: Level): Task => {
    const m = L === 1 ? randInt(2, 9, rng) * 10 : L === 2 ? randInt(2, 9, rng) * 10 : randInt(6, 19, rng) * 10;
    const d = lv(L, randInt(1, 5, rng), randInt(1, 9, rng), randInt(2, 9, rng));
    const a = m - d, b = m + d;
    return task('tricks.diffsq', { params: { a, b, m, d }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
  },

  // beide Faktoren knapp unter 100
  'tricks.near100': (rng: Rng, L: Level): Task => {
    const lo = lv(L, 93, 88, 85);
    const a = randInt(lo, 99, rng);
    let b = randInt(lo, 99, rng);
    if (L === 3 && b === a) b = randInt(lo, 99, rng);
    return task('tricks.near100', { params: { a, b }, prompt: `${a} × ${b}`, expected: a * b });
  },

  // Quadrat einer Zahl auf 5
  'tricks.square5': (rng: Rng, L: Level): Task => {
    const n = L === 3 ? randInt(10, 19, rng) * 10 + 5 : randInt(1, L === 1 ? 5 : 9, rng) * 10 + 5;
    return task('tricks.square5', { params: { n }, prompt: `${n}²`, expected: n * n });
  },

  // p % von y, wobei y % von p leichter ist (y ∈ {10, 20, 25, 50}) – Ergebnis immer ganzzahlig
  'tricks.pctswap': (rng: Rng, L: Level): Task => {
    const y = pick(lv(L, [10, 20, 50], [10, 20, 25, 50], [20, 25, 50]), rng);
    const step = y === 50 ? 2 : y === 25 ? 4 : y === 20 ? 5 : 10;
    const [lo, hi] = lv<[number, number]>(L, [12, 48], [16, 72], [36, 96]);
    let p: number;
    do {
      p = randInt(Math.ceil(lo / step), Math.floor(hi / step), rng) * step;
    } while ([10, 20, 25, 50, 75, 100].includes(p));
    return task('tricks.pctswap', { params: { p, y }, prompt: t('core.p.pct_of', { p, y }), expected: (p * y) / 100 });
  },

  // a − b mit b auf 7/8/9 endend
  'tricks.subround': (rng: Rng, L: Level): Task => {
    let a: number, b: number;
    do {
      const [bLo, bHi] = lv<[number, number]>(L, [17, 49], [27, 99], [117, 899]);
      b = randInt(bLo, bHi, rng);
      a = L === 1 ? randInt(40, 99, rng) : L === 2 ? randInt(100, 500, rng) : randInt(500, 2000, rng);
    } while (b % 10 < 7 || a - b < 10);
    return task('tricks.subround', { params: { a, b }, prompt: `${fmt(a)} − ${fmt(b)}`, expected: a - b });
  },
};
