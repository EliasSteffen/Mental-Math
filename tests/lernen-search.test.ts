import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, normalizeSearch, pickNext } from '../src/views/lernen-search.ts';

test('normalizeSearch: Groß/klein, Akzente, ß, ×, Hochzahlen, Leerraum', () => {
  assert.equal(normalizeSearch('  Rückwärts-Prozent '), 'ruckwarts-prozent');
  assert.equal(normalizeSearch('Größe'), 'grosse');
  assert.equal(normalizeSearch('2-stellig × 1-stellig'), '2-stellig x 1-stellig');
  assert.equal(normalizeSearch('45²  =  40 × 50'), '452 = 40 x 50');
  assert.equal(normalizeSearch('Café'), 'cafe');
});

test('matchesSearch: alle Begriffe müssen vorkommen, leere Suche passt', () => {
  const hay = normalizeSearch('Rückwärts-Prozent Durch den Faktor teilen Prozente');
  assert.ok(matchesSearch(hay, ''));
  assert.ok(matchesSearch(hay, normalizeSearch('rückwärts')));
  assert.ok(matchesSearch(hay, normalizeSearch('ruckwarts')));
  assert.ok(matchesSearch(hay, normalizeSearch('faktor prozent')));
  assert.ok(!matchesSearch(hay, normalizeSearch('faktor quadrat')));
  assert.ok(matchesSearch(normalizeSearch('2-stellig × 1-stellig'), normalizeSearch('2 x 1')));
});

test('pickNext: kleinster Rang, bei Gleichstand das erste; leer → null', () => {
  const items = [{ id: 'a', r: 2 }, { id: 'b', r: 1 }, { id: 'c', r: 0 }, { id: 'd', r: 0 }];
  assert.equal(pickNext(items, (x) => x.r)?.id, 'c');
  assert.equal(pickNext([{ id: 'a', r: 0 }, { id: 'b', r: 0 }], (x) => x.r)?.id, 'a');
  assert.equal(pickNext([], () => 0), null);
});
