import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, PCT_HINT, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const bigGen: Record<string, Gen> = {
  'big.mult': (rng: Rng, L: Level): Task => {
    for (;;) {
      const m = pick(lv(L, [2, 3, 4, 5], [1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7.5, 8], [1.2, 1.8, 2.4, 3.6, 4.8, 6.4, 7.2, 8.4, 9.6]), rng);
      const uName = pick(['Tsd.', 'Mio.'], rng);
      const b = pick(lv(L,
        [20, 30, 40, 50, 200, 300, 500, 2000],
        [20, 30, 40, 50, 60, 80, 200, 300, 400, 500, 2000, 3000, 4000, 5000, 20000, 40000],
        [30, 60, 70, 90, 120, 150, 700, 1200, 1500, 6000, 7000, 9000]), rng);
      const P = round(m * (UNIT_VALUE[uName] ?? 1) * b, 4);
      const ua = P >= 1e9 ? 'Mrd.' : P >= 1e6 ? 'Mio.' : 'Tsd.';
      const e = P / (UNIT_VALUE[ua] ?? 1);
      if (round(e, 3) !== round(e, 4) && Math.abs(e - round(e, 2)) > 1e-9) continue;
      if (L === 3 && Math.abs(e - round(e, 2)) > 1e-9) continue;
      return task('big.mult', { params: { m, u: uName, b, ua },
        prompt: `${fmt(m)} ${uName} × ${fmt(b)}`,
        unit: ua,
        expected: e,
        abs: 0.005,
      });
    }
  },
  'big.div': (rng: Rng, L: Level): Task => {
    for (;;) {
      const q = pick(lv(L, [2, 3, 4, 5, 10, 20, 25, 50], [2, 3, 4, 5, 6, 8, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80], [12, 15, 24, 36, 45, 60, 75, 120, 125]), rng);
      const k = pick(lv(L, [3, 4, 5], [3, 4, 5, 6], [3, 4, 5, 6]), rng);
      const A = q * 10 ** k;
      const d = pick(lv(L,
        [200, 500, 2000, 5000, 20000],
        [200, 300, 400, 500, 2000, 4000, 5000, 20000, 40000, 400000],
        [300, 600, 1200, 1500, 4000, 25000, 60000, 150000]), rng);
      const D = A * d;
      if (D < 1e5 || D >= 1e12) continue;
      if (L === 1 && D >= 1e9) continue;
      const dm = D >= 1e9 ? D / 1e9 : D >= 1e6 ? D / 1e6 : D;
      if (Math.abs(dm - round(dm, 2)) > 1e-9) continue;
      const ua = A >= 1e6 ? 'Mio.' : 'Tsd.';
      return task('big.div', { params: { D, d, ua },
        prompt: `${bigStr(D)} ÷ ${fmt(d)}`,
        unit: ua,
        expected: A / (UNIT_VALUE[ua] ?? 1),
        abs: 0.005,
      });
    }
  },
  'big.percapita': (rng: Rng, L: Level): Task => {
    const T = L === 1 ? randInt(1, 12, rng) : L === 3 ? 0.1 * randInt(5, 300, rng) : 0.5 * randInt(1, 60, rng);
    const [label, base] = pick(lv(L, [
      ['84 Mio. Einwohner', 84],
      ['450 Mio. EU-Bürger', 450],
    ], [
      ['84 Mio. Einwohner', 84],
      ['41 Mio. Haushalte', 41],
      ['46 Mio. Erwerbstätige', 46],
      ['450 Mio. EU-Bürger', 450],
    ], [
      ['84 Mio. Einwohner', 84],
      ['41 Mio. Haushalte', 41],
      ['46 Mio. Erwerbstätige', 46],
      ['450 Mio. EU-Bürger', 450],
    ]), rng);
    return task('big.percapita', { params: { T: round(T, 4), base },
      prompt: `${fmt(round(T, 4))} Mrd. € verteilt auf ${label} – wie viel € pro Kopf?`,
      unit: '€',
      hint: PCT_HINT,
      expected: (T * 1000) / base,
      rel: 0.03,
    });
  },
};
