import type { Level, Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, pctHint, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const fracGen: Record<string, Gen> = {
  'frac.topct': (rng: Rng, L: Level): Task => {
    const [n, d] = pick(lv(L, [
      [1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [1, 20], [1, 25],
    ], [
      [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [1, 7],
      [1, 8], [3, 8], [5, 8], [7, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 15], [1, 20], [1, 25], [1, 40],
    ], [
      [1, 6], [5, 6], [1, 7], [1, 9], [2, 9], [4, 9], [1, 11], [1, 12], [5, 12], [7, 12], [1, 15], [1, 16], [3, 16], [1, 40], [3, 40],
    ]), rng);
    const e = round((n / d) * 100, 4);
    return task('frac.topct', { params: { n, d },
      prompt: t('core.p.frac_pct', { n, d }),
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.15,
    });
  },
  'frac.of': (rng: Rng, L: Level): Task => {
    const d = pick(lv(L, [2, 3, 4, 5, 10], [3, 4, 5, 6, 8, 12, 25], [6, 7, 8, 9, 12, 15, 25]), rng), n = randInt(1, d - 1, rng);
    const y = d * randInt(lv(L, 2, 3, 8), lv(L, 20, 60, 99), rng) * (L === 3 ? pick([1, 10], rng) : L === 1 ? 1 : pick([1, 10], rng));
    return task('frac.of', { params: { n, d, y }, prompt: t('core.p.frac_of', { n, d, y: fmt(y) }), expected: (n * y) / d });
  },
};
