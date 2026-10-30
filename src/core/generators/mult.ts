import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, pctHint, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const multGen: Record<string, Gen> = {
  'mult.2x1': (rng: Rng, L: Level): Task => {
    for (;;) {
      const a = randInt(lv(L, 12, 12, 111), lv(L, 49, 99, 399), rng), b = randInt(lv(L, 3, 3, 6), lv(L, 6, 9, 9), rng);
      if (L === 3 && a % 10 === 0) continue;
      return task('mult.2x1', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
    }
  },
  'mult.2x2': (rng: Rng, L: Level): Task => {
    for (;;) {
      let a, b;
      if (L === 1) {
        b = randInt(12, 99, rng);
        a = rng() < 0.5 ? randInt(12, 19, rng) : 10 * randInt(2, 9, rng) + pick([-2, -1, 1, 2], rng);
      } else if (L === 3) {
        a = randInt(31, 99, rng); b = randInt(31, 99, rng);
        if (a % 5 === 0 || b % 5 === 0 || Math.abs(a % 10 - 5) < 2 || Math.abs(b % 10 - 5) < 2) continue;
      } else {
        a = randInt(12, 99, rng); b = randInt(12, 99, rng);
      }
      if (a % 10 === 0 || b % 10 === 0) continue;
      return task('mult.2x2', { params: { a, b }, prompt: `${fmt(a)} × ${fmt(b)}`, expected: a * b });
    }
  },
  'mult.easy': (rng: Rng, L: Level): Task => {
    const f = pick(lv(L, [5, 50], [5, 25, 50], [5, 25, 50]), rng), a = randInt(lv(L, 12, 12, 120), lv(L, 120, 480, 980), rng);
    return task('mult.easy', { params: { a, f }, prompt: `${fmt(a)} × ${fmt(f)}`, expected: a * f });
  },
  'mult.square': (rng: Rng, L: Level): Task => {
    for (;;) {
      const a = randInt(lv(L, 11, 13, 61), lv(L, 25, 99, 99), rng);
      if (a % 10 === 0) continue;
      if (L === 3 && a % 5 === 0) continue;
      return task('mult.square', { params: { a }, prompt: `${fmt(a)} × ${fmt(a)}`, expected: a * a });
    }
  },
};
