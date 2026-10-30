import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, PCT_HINT, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const divGen: Record<string, Gen> = {
  'div.exact': (rng: Rng, L: Level): Task => {
    const d = pick(lv(L, [2, 3, 4, 5, 6, 8], [3, 4, 6, 7, 8, 9, 12, 15, 25], [7, 9, 12, 15, 16, 18, 24, 25]), rng);
    const q = randInt(lv(L, 12, 12, 100), lv(L, 100, 250, 999), rng);
    return task('div.exact', { params: { n: d * q, d }, prompt: `${fmt(d * q)} ÷ ${fmt(d)}`, expected: q });
  },
  'div.decimal': (rng: Rng, L: Level): Task => {
    const d = pick(lv(L, [0.2, 0.25, 0.5], [0.2, 0.25, 0.4, 0.5, 0.8, 1.5, 2.5], [0.4, 0.8, 1.5, 2.5, 0.75, 1.2]), rng);
    const q = 20 * randInt(1, lv(L, 15, 40, 100), rng);
    return task('div.decimal', { params: { n: round(q * d, 4), d }, prompt: `${fmt(round(q * d, 4))} ÷ ${fmt(d)}`, expected: q });
  },
  'div.round': (rng: Rng, L: Level): Task => {
    for (;;) {
      const d = pick(lv(L, [3, 4, 6, 8], [6, 7, 8, 9, 11, 12], [7, 11, 13, 17, 19]), rng);
      const n = randInt(lv(L, 60, 200, 1000), lv(L, 400, 2000, 9000), rng);
      if (n % d === 0) continue;
      return task('div.round', { params: { n, d },
        prompt: `${fmt(n)} ÷ ${fmt(d)}`,
        hint: 'auf ganze Zahl runden',
        expected: Math.round(n / d),
        abs: 1,
      });
    }
  },
};
