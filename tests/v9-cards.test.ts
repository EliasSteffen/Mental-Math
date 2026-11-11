// Paket J: Trick-Karten (core/cards.ts) und die gemeinsame Meisterungs-Schwelle (core/mastery.ts)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_IDS, CARD_UNLOCK_SCORE, cardProgress, cardRarity, mergeCards, rarityOf, unlockedCards } from '../src/core/cards.ts';
import { MASTERY_FULL, MASTERY_HALF, masteryLevel } from '../src/core/mastery.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { subtypeStats } from '../src/core/scoring.ts';
import { subtypeAttempts } from './v9-rewards-helpers.ts';

test('Meisterungs-Schwellen: eine Quelle (70 voll, 40 halb)', () => {
  assert.equal(MASTERY_FULL, 70);
  assert.equal(MASTERY_HALF, 40);
  assert.equal(masteryLevel(70), 'full');
  assert.equal(masteryLevel(69), 'half');
  assert.equal(masteryLevel(40), 'half');
  assert.equal(masteryLevel(39), 'empty');
  assert.equal(masteryLevel(null), 'empty');
  assert.equal(masteryLevel(undefined), 'empty');
  assert.equal(masteryLevel(Number.NaN), 'empty');
  assert.equal(CARD_UNLOCK_SCORE, MASTERY_FULL);
});

test('Seltenheit nach Gewicht: 1 gewöhnlich, 1,5 selten, ab 2 episch', () => {
  assert.equal(rarityOf(0.5), 'common');
  assert.equal(rarityOf(1), 'common');
  assert.equal(rarityOf(1.5), 'rare');
  assert.equal(rarityOf(2), 'epic');
  assert.equal(rarityOf(3), 'epic');
  assert.equal(cardRarity('mult.2x1'), 'common');
  assert.equal(cardRarity('mult.square'), 'rare');
  assert.equal(cardRarity('mult.2x2'), 'epic');
  assert.equal(cardRarity('gibt.es.nicht'), 'common');
});

test('Alle Karten: je ein sichtbarer Aufgabentyp, ohne „Eigenes“, alle mit Methode und Tipp-Schlüsseln', () => {
  assert.equal(CARD_IDS.length, 49);
  assert.ok(CARD_IDS.every((id) => SUBTYPES[id] !== undefined && SUBTYPES[id].category !== 'custom'));
  assert.equal(new Set(CARD_IDS).size, CARD_IDS.length);
});

test('Freischaltung genau bei Skill 70', () => {
  const at70 = subtypeAttempts('pct.of', 7, 4); // 100 · (0,7 · 4/7 + 0,3) = 70
  const at60 = subtypeAttempts('pct.of', 7, 3); // 60
  assert.equal(subtypeStats(at70)['pct.of']?.score, 70);
  assert.equal(subtypeStats(at60)['pct.of']?.score, 60);
  assert.deepEqual(unlockedCards(at70), ['pct.of']);
  assert.deepEqual(unlockedCards(at60), []);
  assert.deepEqual(unlockedCards([]), []);
});

test('Typen der versteckten Kategorie schalten keine Karte frei', () => {
  assert.deepEqual(unlockedCards(subtypeAttempts('custom.mul', 5, 5)), []);
});

test('cardProgress: Skill und Ziel, ohne Daten null', () => {
  assert.deepEqual(cardProgress('pct.of', subtypeAttempts('pct.of', 7, 3)), { score: 60, needed: 70 });
  assert.deepEqual(cardProgress('pct.of', []), { score: null, needed: 70 });
});

test('mergeCards: ergänzt nur, entfernt nie, meldet nur neue', () => {
  const stored = { 'pct.of': 100 };
  const r = mergeCards(stored, ['pct.of', 'mult.2x1'], 500);
  assert.deepEqual(r.cards, { 'pct.of': 100, 'mult.2x1': 500 });
  assert.deepEqual(r.fresh, ['mult.2x1']);
  assert.deepEqual(stored, { 'pct.of': 100 }, 'Eingabe bleibt unverändert');
  // Skill gefallen (nicht mehr verdient): Karte bleibt
  const kept = mergeCards(r.cards, [], 900);
  assert.deepEqual(kept.cards, r.cards);
  assert.deepEqual(kept.fresh, []);
});
