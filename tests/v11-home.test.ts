// v11 H – Heute: Auswahl des Heros (Einstufungstest für Neue), Kachelreihenfolge und Zeilen im Sheet „Weitere Modi“.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroKind, modeRows, PHONE_TILES, showsPlacementRow, type PlacementState } from '../src/views/home-data.ts';
import { home as de } from '../src/i18n/locales/de/home.ts';
import { home as en } from '../src/i18n/locales/en/home.ts';

const fresh: PlacementState = { placement: false, difficulty: 'auto', attempts: 0 };

test('heroKind: nur neue Nutzer (kein Test, Auto, 0 Versuche) bekommen den Einstufungstest', () => {
  assert.equal(heroKind(fresh), 'placement');
  assert.equal(heroKind({ ...fresh, placement: true }), 'recommendation');
  assert.equal(heroKind({ ...fresh, attempts: 1 }), 'recommendation');
  assert.equal(heroKind({ ...fresh, difficulty: 3 }), 'recommendation');
  assert.equal(heroKind({ ...fresh, difficulty: 3, placement: true }), 'recommendation');
});

test('showsPlacementRow: mit Versuchen, aber ohne Test, steht die Zeile im Sheet', () => {
  assert.equal(showsPlacementRow(fresh), false, 'Neue bekommen den Hero, keine Zeile');
  assert.equal(showsPlacementRow({ ...fresh, attempts: 5 }), true);
  assert.equal(showsPlacementRow({ ...fresh, attempts: 5, placement: true }), false);
  assert.equal(showsPlacementRow({ ...fresh, difficulty: 2, attempts: 0 }), true);
});

test('Kacheln Telefon: Daily · Quests · Mini-Case · Gemischt · Kategorien · Weitere Modi, keine Einstufung', () => {
  assert.deepEqual([...PHONE_TILES], ['daily', 'quests', 'case', 'mixed', 'categories', 'modes']);
  assert.equal(PHONE_TILES.length % 2, 0, 'sechs Kacheln, drei volle Reihen');
  assert.ok(!(PHONE_TILES as readonly string[]).includes('placement'));
});

test('Sheet „Weitere Modi“: ohne Mini-Case, Einstufung nur oben und nur wenn offen', () => {
  assert.deepEqual(modeRows({ placementRow: false }), ['chain', 'parallel', 'estimate', 'custom', 'race']);
  assert.deepEqual(modeRows({ placementRow: true }), ['placement', 'chain', 'parallel', 'estimate', 'custom', 'race']);
});

test('Texte: Hero-Schlüssel in beiden Sprachen vorhanden und passend', () => {
  assert.equal(de.placementTitle, 'Einstufungstest');
  assert.equal(de.placementReason, 'Finde in 2 Minuten deine Startstufe');
  assert.equal(de.placementCta, 'Test starten');
  assert.equal(en.placementTitle, 'Placement test');
  assert.equal(en.placementReason, 'Find your starting level in 2 minutes');
  assert.equal(en.placementCta, 'Start test');
  assert.equal(de.caseTitle, 'Mini-Case');
  assert.equal(en.caseTitle, 'Mini case');
});
