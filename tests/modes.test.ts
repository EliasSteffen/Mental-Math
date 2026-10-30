import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMode, isValidMode, modeName } from '../src/core/modes.ts';
import { CATEGORIES, SUBTYPES } from '../src/core/generators/index.ts';

test('parseMode: Kategorien, Subtypen und Spezialmodi sind gültig', () => {
  for (const c of CATEGORIES) assert.equal(parseMode(c.id), c.id);
  for (const id of Object.keys(SUBTYPES)) assert.equal(parseMode(id), id);
  for (const m of ['all', 'weak', 'review', 'daily', 'retry', 'custom']) {
    assert.equal(parseMode(m), m);
    assert.equal(isValidMode(m), true);
  }
});

test('parseMode: ungültige Eingaben → null', () => {
  for (const bad of ['', 'nope', 'mult.', 'pct.nope', 'ALL', ' all', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(parseMode(bad), null, bad);
    assert.equal(isValidMode(bad), false, bad);
  }
  assert.equal(parseMode(undefined as unknown as string), null);
  assert.equal(parseMode(5 as unknown as string), null);
});

test('modeName: wie bisher', () => {
  assert.equal(modeName('all'), 'Alle Kategorien');
  assert.equal(modeName('weak'), 'Schwächen');
  assert.equal(modeName('review'), 'Wiederholung');
  assert.equal(modeName('pct'), 'Prozente');
  assert.equal(modeName('mult'), 'Multiplikation');
  assert.equal(modeName('pct.of'), 'Prozente · x % von y');
  assert.equal(modeName('units.convert'), 'Einheiten · Einheiten umrechnen');
  assert.equal(modeName('unbekannt'), 'unbekannt');
});

test('modeName: Daily, Retry, Custom', () => {
  assert.equal(modeName('daily'), 'Daily Challenge');
  assert.equal(modeName('retry'), 'Wiederholung');
  assert.equal(modeName('custom'), 'Eigenes Training');
});
