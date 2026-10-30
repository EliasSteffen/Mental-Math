import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, PCT_HINT, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const growthGen: Record<string, Gen> = {
  'growth.compound': (rng: Rng, L: Level): Task => {
    const r = pick(lv(L, [2, 5, 10], [2, 3, 4, 5, 6, 8, 10, 15, 20], [3, 6, 7, 8, 12, 15, 25]), rng);
    const n = randInt(L === 3 ? 3 : 2, L === 1 ? 3 : r >= 15 ? 3 : L === 3 ? 6 : 5, rng);
    return task('growth.compound', { params: { r, n },
      prompt: `${fmt(r)} % Wachstum pro Jahr über ${n} Jahre – Gesamtwachstum?`,
      unit: '%',
      hint: '±2 % ok',
      expected: ((1 + r / 100) ** n - 1) * 100,
      abs: 0.5,
      rel: 0.02,
    });
  },
  'growth.rule72': (rng: Rng, L: Level): Task => {
    const r = pick(lv(L, [3, 4, 6, 8, 9, 12], [2, 3, 4, 6, 8, 9, 12, 18, 24], [5, 7, 10, 11, 14, 15, 16, 20]), rng);
    return task('growth.rule72', { params: { r },
      prompt: `Bei ${fmt(r)} % Wachstum p. a. – nach wie vielen Jahren verdoppelt sich der Wert (ca.)?`,
      unit: 'Jahre',
      expected: 72 / r,
      rel: 0.1,
    });
  },
  'growth.cagr': (rng: Rng, L: Level): Task => {
    for (;;) {
      const r = pick(lv(L, [10, 20, 50], [5, 10, 20, 25, 50], [8, 12, 15, 25, 30]), rng);
      const n = pick(lv(L, [2], [2, 3], [2, 3, 4]), rng);
      const S = pick(lv(L, [100, 200], [100, 200, 400, 800, 1000], [100, 250, 400, 500, 800]), rng);
      const E = S * (1 + r / 100) ** n;
      if (Math.abs(E * 100 - Math.round(E * 100)) > 1e-6) continue;
      return task('growth.cagr', { params: { r, n, S, E },
        prompt: `Umsatz wächst in ${n} Jahren von ${fmt(S)} auf ${fmt(E)} Mio. €. Jährliche Wachstumsrate?`,
        unit: '%',
        expected: r,
        abs: 1,
      });
    }
  },
};
