import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, PCT_HINT, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const estGen: Record<string, Gen> = {
  'est.mult': (rng: Rng, L: Level): Task => {
    let a, b;
    if (L === 1) { a = 10 * randInt(11, 99, rng); b = randInt(11, 30, rng); }
    else if (L === 3) { a = randInt(1100, 9900, rng); b = randInt(110, 990, rng); }
    else { a = rng() < 0.5 ? randInt(110, 990, rng) : randInt(1100, 9900, rng); b = randInt(11, 99, rng); }
    return task('est.mult', { params: { a, b },
      prompt: `${fmt(a)} × ${fmt(b)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: a * b,
      rel: 0.08,
    });
  },
  'est.div': (rng: Rng, L: Level): Task => {
    const n = L === 1 ? randInt(10, 99, rng) * 100 : L === 3 ? randInt(10000, 990000, rng) : randInt(1000, 99000, rng);
    const d = randInt(lv(L, 11, 13, 13), lv(L, 49, 97, 97), rng);
    return task('est.div', { params: { n, d },
      prompt: `${fmt(n)} ÷ ${fmt(d)}`,
      hint: 'Schätzung, ±8 % ok',
      expected: n / d,
      rel: 0.08,
    });
  },
  'est.pct': (rng: Rng, L: Level): Task => {
    for (;;) {
      const p = L === 1 ? pick([11, 12, 19, 21, 22, 29, 31, 39], rng) : randInt(11, 89, rng);
      if (p % 5 === 0) continue;
      const y = L === 1 ? 100 * randInt(12, 99, rng) : L === 3 ? randInt(11000, 99900, rng) : randInt(1100, 9900, rng);
      return task('est.pct', { params: { p, y },
        prompt: `${fmt(p)} % von ${fmt(y)}`,
        hint: 'Schätzung, ±8 % ok',
        expected: (p * y) / 100,
        rel: 0.08,
      });
    }
  },
};
