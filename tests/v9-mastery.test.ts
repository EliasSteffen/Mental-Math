import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masteryCounts, type MasteryLevel } from '../src/core/mastery.ts';

test('masteryCounts: leere Liste → alles 0', () => {
  const { overall, categories } = masteryCounts([]);
  assert.deepEqual(overall, { full: 0, half: 0, empty: 0, total: 0 });
  assert.deepEqual(categories, {});
});

test('masteryCounts: Summe über alle Kategorien, je Kategorie getrennt', () => {
  const items = [
    { category: 'mult', mastery: 'full' as const },
    { category: 'mult', mastery: 'full' as const },
    { category: 'mult', mastery: 'half' as const },
    { category: 'pct', mastery: 'empty' as const },
    { category: 'pct', mastery: 'full' as const },
  ];
  const { overall, categories } = masteryCounts(items);
  assert.deepEqual(overall, { full: 3, half: 1, empty: 1, total: 5 });
  assert.deepEqual(categories.mult, { full: 2, half: 1, empty: 0, total: 3 });
  assert.deepEqual(categories.pct, { full: 1, half: 0, empty: 1, total: 2 });
});

test('masteryCounts: die Teilmengen ergeben das Ganze', () => {
  const level = (i: number): MasteryLevel => (i % 3 === 0 ? 'full' : i % 3 === 1 ? 'half' : 'empty');
  const items = Array.from({ length: 30 }, (_, i) => ({ category: `c${i % 4}`, mastery: level(i) }));
  const { overall, categories } = masteryCounts(items);
  const sum = Object.values(categories).reduce((n, c) => n + c.total, 0);
  assert.equal(overall.total, 30);
  assert.equal(sum, overall.total);
  assert.equal(overall.full + overall.half + overall.empty, overall.total);
});

test('masteryCounts: unbekannte Stufe zählt als offen', () => {
  const { overall } = masteryCounts([{ category: 'x', mastery: 'bogus' as never }]);
  assert.deepEqual(overall, { full: 0, half: 0, empty: 1, total: 1 });
});
