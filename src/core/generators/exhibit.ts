import type { Level, Task } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { lw } from '../l10n.ts';
import { randInt, pick, round } from '../numbers.ts';
import type { Rng } from '../numbers.ts';
import { task, choiceTask, shuffle, lv, isInt, placesHint } from './helpers.ts';
import type { Gen } from './helpers.ts';

// Exhibits wie im Case: Daten stecken als Strings in params, damit Wiederholung, Analyse und KI sie ohne Zusatzfeld kennen.
// ex = Art (bar | col | group | table) · ttl = Titel · lab = Beschriftungen · s1/s2 = Werte · sn = Reihennamen · hd = Tabellenkopf
// k (und k2) = Index der gefragten Zeile/Spalte
const SETS = ['region', 'product', 'channel'] as const;
const YEARS = [2021, 2022, 2023, 2024, 2025];

const join = (xs: readonly (string | number)[]): string => xs.join('|');
const labels = (set: string, n: number, rng: Rng): string[] => shuffle(t(`core.ex.lab.${set}`).split('|'), rng).slice(0, n);
const money = (): string => lw('Mio. €');

/** n verschiedene Vielfache von step mit Summe total, keiner kleiner als 2·step */
function partition(total: number, n: number, step: number, rng: Rng): number[] {
  for (;;) {
    const w = Array.from({ length: n }, () => 0.4 + rng());
    const sw = w.reduce((a, b) => a + b, 0);
    const head = w.slice(0, -1).map((x) => Math.round((x / sw) * (total / step)) * step);
    const all = [...head, total - head.reduce((a, b) => a + b, 0)];
    if (all.every((v) => v >= 2 * step) && new Set(all).size === n) return all;
  }
}

const argmax = (xs: readonly number[]): number => xs.reduce((best, x, i) => (x > (xs[best] ?? -Infinity) ? i : best), 0);

export const exhibitGen: Record<string, Gen> = {
  'exhibit.share': (rng: Rng, L: Level): Task => {
    const set = pick(SETS, rng);
    const n = lv(L, 4, 4, 5);
    const [total, step] = pick(lv<Array<[number, number]>>(L,
      [[200, 10], [400, 20], [500, 25]],
      [[200, 10], [250, 10], [400, 20], [500, 25]],
      [[180, 5], [240, 5], [360, 5], [420, 5], [640, 5]]), rng);
    const vals = partition(total, n, step, rng);
    const lab = labels(set, n, rng);
    const k = randInt(0, n - 1, rng);
    const share = round(((vals[k] ?? 0) / total) * 100, 1);
    return task('exhibit.share', {
      params: { ex: 'bar', ttl: t(`core.ex.ttl.${set}`, { u: money() }), lab: join(lab), s1: join(vals), k },
      prompt: t('core.ex.q.share', { seg: lab[k] ?? '' }),
      unit: '%',
      hint: isInt(share) ? '' : t('core.ex.hint.round'),
      expected: share,
      abs: isInt(share) ? 0 : 0.5,
    });
  },

  'exhibit.growth': (rng: Rng, L: Level): Task => {
    for (;;) {
      const base = pick(lv(L, [50, 80, 100, 200, 250, 400], [40, 60, 75, 120, 150, 160, 240], [36, 48, 64, 85, 140, 175, 220, 270]), rng);
      const g = L === 1 ? pick([10, 20, 25, 40, 50, 60, 75, 100], rng) : L === 2 ? 5 * randInt(1, 16, rng) : randInt(8, 90, rng);
      const end = Math.round(base * (1 + g / 100));
      const k = L === 1 ? 0 : randInt(0, 2, rng);
      const k2 = L === 1 ? 4 : randInt(k + 2, 4, rng);
      // Zwischenwerte: linear mit etwas Rauschen, außerhalb leicht fallend/steigend
      const vals = YEARS.map((_, i) => {
        if (i === k) return base;
        if (i === k2) return end;
        if (i < k) return Math.round(base * (1 - (k - i) * (0.03 + rng() * 0.05)));
        if (i > k2) return Math.round(end * (1 + (i - k2) * (0.02 + rng() * 0.06)));
        const f = (i - k) / (k2 - k);
        return Math.round(base + (end - base) * f * (0.8 + rng() * 0.4));
      });
      if (vals.some((v) => v <= 0)) continue;
      const gr = round(((end - base) / base) * 100, 1);
      return task('exhibit.growth', {
        params: { ex: 'col', ttl: t('core.ex.ttl.years', { u: money() }), lab: join(YEARS), s1: join(vals), k, k2 },
        prompt: t('core.ex.q.growth', { y1: YEARS[k] ?? '', y2: YEARS[k2] ?? '' }),
        unit: '%',
        hint: isInt(gr) ? '' : t('core.ex.hint.round'),
        expected: gr,
        abs: isInt(gr) ? 0 : 0.5,
      });
    }
  },

  'exhibit.mix': (rng: Rng, L: Level): Task => {
    for (;;) {
      const n = L === 1 ? 2 : 3;
      const shares = partition(100, n, L === 3 ? 5 : 10, rng);
      const pool = lv(L, [10, 20, 30, 40, 50], [5, 8, 10, 12, 15, 20, 25, 30, 40], [7, 9, 12, 14, 18, 24, 29, 35, 49]);
      const prices = shuffle(pool, rng).slice(0, n).sort((a, b) => a - b);
      const avg = round(shares.reduce((sum, s, i) => sum + s * (prices[i] ?? 0), 0) / 100, 2);
      if (L < 3 && !isInt(avg * 2)) continue;
      const tiers = t('core.ex.lab.tier').split('|');
      const lab = n === 2 ? [tiers[0] ?? '', tiers[2] ?? ''] : tiers.slice(0, 3);
      return task('exhibit.mix', {
        params: { ex: 'table', ttl: t('core.ex.ttl.mix'), lab: join(lab), s1: join(shares), s2: join(prices), hd: t('core.ex.hd.mix') },
        prompt: t('core.ex.q.mix'),
        unit: '€',
        hint: placesHint(avg),
        expected: avg,
        abs: 0.01,
      });
    }
  },

  // Falle aus echten Exhibits: das absolut größte Plus ist nicht das prozentual größte
  'exhibit.rel': (rng: Rng, L: Level): Task => {
    const set = pick(SETS, rng);
    const n = lv(L, 3, 4, 4);
    const gap = lv(L, 10, 5, 3);
    for (;;) {
      const base = shuffle(lv(L, [20, 40, 50, 80, 100, 200], [20, 25, 40, 50, 60, 80, 120, 150, 200], [24, 30, 45, 64, 75, 90, 140, 180, 250]), rng).slice(0, n);
      const g = shuffle(lv(L, [10, 20, 25, 50, 75, 100], [5, 10, 15, 20, 25, 30, 40, 50], [6, 8, 12, 15, 18, 24, 30, 35, 45]), rng).slice(0, n);
      const end = base.map((b, i) => Math.round(b * (1 + (g[i] ?? 0) / 100)));
      if (L < 3 && end.some((e, i) => e !== (base[i] ?? 0) * (1 + (g[i] ?? 0) / 100))) continue;
      const rel = end.map((e, i) => ((e - (base[i] ?? 1)) / (base[i] ?? 1)) * 100);
      const abs = end.map((e, i) => e - (base[i] ?? 0));
      const k = argmax(rel);
      const sorted = [...rel].sort((a, b) => b - a);
      if (argmax(abs) === k || (sorted[0] ?? 0) - (sorted[1] ?? 0) < gap) continue;
      const lab = labels(set, n, rng);
      return choiceTask('exhibit.rel', rng, {
        prompt: t('core.ex.q.rel', { y1: 2024, y2: 2025 }),
        correct: lab[k] ?? '',
        distractors: lab.filter((_, i) => i !== k),
        params: { ex: 'group', ttl: t(`core.ex.ttl.${set}`, { u: money() }), lab: join(lab), s1: join(base), s2: join(end), sn: '2024|2025', k },
      });
    }
  },
};
