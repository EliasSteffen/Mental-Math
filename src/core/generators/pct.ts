import type { Level, Task } from '../../types.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, PCT_HINT, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const pctGen: Record<string, Gen> = {
  'pct.of': (rng: Rng, L: Level): Task => {
    const p = pick(lv(L, [5, 10, 20, 25, 50], [3, 5, 8, 10, 12, 15, 17, 20, 25, 30, 35, 40, 45, 60, 75], [7, 13, 16, 18, 22, 27, 33, 36, 48, 65, 85]), rng);
    const y = L === 1 ? randInt(2, 50, rng) * 10 : L === 3 ? randInt(12, 199, rng) * 10 : randInt(4, 96, rng) * pick([10, 100], rng);
    return task('pct.of', { params: { p, y }, prompt: `${fmt(p)} % von ${fmt(y)}`, expected: (p * y) / 100, abs: 0.01 });
  },
  'pct.change': (rng: Rng, L: Level): Task => {
    for (;;) {
      const alt = pick(lv(L, [20, 40, 50, 100, 200], [20, 25, 40, 50, 60, 75, 80, 120, 150, 200, 250, 400], [30, 35, 45, 64, 72, 85, 90, 125, 160, 240, 360]), rng);
      const r = pick(lv(L, [10, 20, 25, 50], [5, 10, 12.5, 15, 20, 25, 30, 40, 50], [4, 6, 8, 12, 15, 16, 18, 24, 35, 45]), rng);
      const up = rng() < 0.5;
      const neu = round(alt * (1 + (up ? r : -r) / 100), 4);
      if (Math.abs(neu * 10 - Math.round(neu * 10)) > 1e-6 || neu <= 0) continue;
      return task('pct.change', { params: { alt, neu },
        prompt: `Umsatz ${up ? 'steigt' : 'sinkt'} von ${fmt(alt)} auf ${fmt(neu)} Mio. €. Um wie viel Prozent?`,
        unit: '%',
        expected: r,
      });
    }
  },
  'pct.reverse': (rng: Rng, L: Level): Task => {
    const O = L === 1 ? 100 * randInt(1, 10, rng) : L === 3 ? 20 * randInt(5, 60, rng) : 20 * randInt(2, 20, rng);
    const discount = rng() < 0.5;
    const r = discount
      ? pick(lv(L, [10, 20, 50], [10, 20, 25, 40, 50], [15, 30, 35, 40, 45, 60]), rng)
      : pick(lv(L, [10, 20, 50], [10, 20, 25, 50], [15, 30, 35, 40, 45, 60]), rng);
    const nach = round(O * (1 + (discount ? -r : r) / 100), 4);
    return task('pct.reverse', { params: { r, nach, discount: discount ? 1 : 0 },
      prompt: `Nach ${fmt(r)} % ${discount ? 'Rabatt' : 'Preiserhöhung'} kostet ein Produkt ${fmt(nach)} €. Ursprünglicher Preis?`,
      unit: '€',
      expected: O,
    });
  },
  'pct.points': (rng: Rng, L: Level): Task => {
    const m1 = pick(lv(L, [5, 10, 20, 25], [4, 5, 8, 10, 12, 15, 20, 25], [6, 7, 9, 12, 15, 18, 24]), rng);
    const d = L === 1 ? pick([1, 2, 5], rng) : randInt(1, L === 3 ? 6 : 5, rng), m2 = m1 + d;
    const e = round((d / m1) * 100, 4);
    return task('pct.points', { params: { m1, m2 },
      prompt: `Die Marge steigt von ${fmt(m1)} % auf ${fmt(m2)} %. Um wie viel Prozent (nicht Prozentpunkte)?`,
      unit: '%',
      hint: decHint(e),
      expected: e,
      abs: 0.1,
    });
  },
  'pct.chain': (rng: Rng, L: Level): Task => {
    const R = lv(L, [10, 20, 50, -10, -20, -50], [10, 20, 25, 50, -10, -20, -25, -50], [5, 15, 30, 40, -5, -15, -30, -40, 20, -20]);
    const r1 = pick(R, rng), r2 = pick(R, rng);
    const word = (r: number, pron: string) => `${r > 0 ? 'steigt' : 'sinkt'}${pron} um ${fmt(Math.abs(r))} %`;
    return task('pct.chain', { params: { r1, r2 },
      prompt: `Der Preis ${word(r1, '')}, danach ${word(r2, ' er')}. Gesamtveränderung in %?`,
      unit: '%',
      hint: 'mit Vorzeichen, z. B. −4',
      expected: ((1 + r1 / 100) * (1 + r2 / 100) - 1) * 100,
      abs: 0.05,
    });
  },
};
