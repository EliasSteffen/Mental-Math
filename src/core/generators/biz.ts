import type { Level, Task } from '../../types.ts';
import { t as tr } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { fmt, randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, lv, decHint, placesHint, pctHint, UNIT_VALUE, bigStr } from './helpers.ts';
import type { Gen } from './helpers.ts';

export const bizGen: Record<string, Gen> = {
  'biz.payback': (rng: Rng, L: Level): Task => {
    for (;;) {
      const I = pick(lv(L, [2, 4, 6, 8, 10, 12, 20], [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30], [7, 9, 14, 18, 22, 35, 45]), rng);
      const s = pick(lv(L, [1, 2, 4, 5], [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8], [1.5, 2.5, 3, 4, 6, 7]), rng);
      if (I / s > 10) continue;
      const e = round(I / s, 4);
      return task('biz.payback', { params: { I, s },
        prompt: tr('core.p.payback', { i: fmt(I), s: fmt(s) }),
        unit: lw('Jahre'),
        hint: decHint(e),
        expected: e,
        abs: 0.06,
      });
    }
  },
  'biz.breakeven': (rng: Rng, L: Level): Task => {
    for (;;) {
      const db = pick(lv(L, [10, 20, 25, 50], [5, 8, 10, 12, 15, 20, 25, 40, 50], [12, 15, 18, 24, 35, 45]), rng);
      const p = L === 1 ? 10 * randInt(3, 20, rng) : L === 3 ? randInt(40, 400, rng) : 5 * randInt(4, 40, rng);
      if (p <= db) continue;
      const v = p - db, Q = 1000 * randInt(lv(L, 2, 2, 8), lv(L, 20, 80, 150), rng), F = db * Q;
      return task('biz.breakeven', { params: { F, p, v },
        prompt: tr('core.p.breakeven', { f: fmt(F), p: fmt(p), v: fmt(v) }),
        unit: lw('Stück'),
        expected: Q,
      });
    }
  },
  'biz.margin': (rng: Rng, L: Level): Task => {
    for (;;) {
      const R = pick(lv(L, [20, 40, 50, 100, 200, 400], [20, 40, 50, 80, 120, 150, 200, 250, 400, 500], [60, 75, 90, 120, 160, 180, 240, 350, 450, 640]), rng);
      const m = pick(lv(L, [5, 10, 20, 25], [2, 4, 5, 8, 10, 12, 15, 20, 25], [6, 7, 8, 9, 12, 15, 18, 24, 35]), rng);
      const G = (R * m) / 100;
      if (Math.abs(G * 10 - Math.round(G * 10)) > 1e-6) continue;
      return task('biz.margin', { params: { R, G },
        prompt: tr('core.p.margin', { r: fmt(R), g: fmt(G) }),
        unit: '%',
        expected: m,
      });
    }
  },
  'biz.roi': (rng: Rng, L: Level): Task => {
    const C = pick(lv(L, [2, 4, 5, 10], [2, 4, 5, 8, 10, 20], [3, 6, 7, 9, 12, 15, 25, 40]), rng);
    const roi = pick(lv(L, [10, 20, 50, 100], [10, 20, 25, 40, 50, 75, 100, 150, 200], [15, 30, 35, 45, 60, 80, 120, 175, 250]), rng);
    const B = round(C * (1 + roi / 100), 4);
    return task('biz.roi', { params: { C, B },
      prompt: tr('core.p.roi', { c: fmt(C), b: fmt(B) }),
      unit: '%',
      expected: roi,
    });
  },
  'biz.tco': (rng: Rng, L: Level): Task => {
    const O = pick(lv(L, [2, 5, 10], [2, 3, 5, 8, 10, 12, 15], [3.5, 7.5, 12, 18, 24]), rng);
    const A = pick(lv(L, [1, 2, 3, 5, 10], [1.5, 2, 2.5, 3, 4, 5, 7.5, 12, 15, 20], [2.4, 3.6, 4.5, 6.5, 8.5, 12.5]), rng);
    const n = pick(lv(L, [2, 3, 5], [3, 4, 5], [4, 5, 6, 7]), rng);
    return task('biz.tco', { params: { O, A, n },
      prompt: tr('core.p.tco', { o: fmt(O), a: fmt(A), n }),
      unit: lw('Mio.') + ' €',
      expected: O + n * A,
    });
  },
  'biz.fte': (rng: Rng, L: Level): Task => {
    const V = pick(lv(L, [0.5, 1, 2], [0.5, 1, 1.2, 1.5, 2, 3], [0.7, 1.2, 1.8, 2.5, 3.5, 4.2]), rng);
    const t = pick(lv(L, [3, 5, 6, 10], [3, 4, 5, 6, 8, 10, 12], [7, 9, 11, 13, 15]), rng);
    const s = pick(lv(L, [10, 20, 25, 50], [10, 20, 25, 30, 40, 50], [15, 35, 45, 60]), rng);
    const H = pick(lv(L, [1600], [1500, 1600], [1500, 1600, 1650, 1720]), rng);
    return task('biz.fte', { params: { V, t, s, H },
      prompt: tr('core.p.fte', { v: fmt(V), t: fmt(t), s: fmt(s), h: fmt(H) }),
      unit: 'FTE',
      hint: tr('core.hint.tol5'),
      expected: (V * 1e6 * t * (s / 100)) / 60 / H,
      rel: 0.05,
    });
  },
  'biz.sla': (rng: Rng, L: Level): Task => {
    const a = pick(lv(L, [99, 99.9], [99, 99.5, 99.9, 99.95, 99.99], [99.5, 99.95, 99.99, 99.8, 99.7]), rng);
    const minutes = a === 99.99;
    const hours = ((100 - a) / 100) * 8760;
    return task('biz.sla', { params: { a },
      prompt: tr(minutes ? 'core.p.sla.min' : 'core.p.sla.h', { a: fmt(a) }),
      unit: minutes ? 'min' : 'h',
      hint: tr('core.hint.tol5'),
      expected: minutes ? hours * 60 : hours,
      rel: 0.05,
    });
  },
};
