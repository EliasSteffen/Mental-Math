// v11 E: Erfolge-Übersicht – zuletzt verdiente Orden, neueste Karten, günstigster offener Artikel; Texte de/en.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGES } from '../src/core/badges.ts';
import { CARD_IDS } from '../src/core/cards.ts';
import { cheapestOpenItem, newestCards, recentBadges } from '../src/core/erfolge.ts';
import { MAX_FREEZES } from '../src/core/habit.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';

const [b0, b1, b2, b3, b4, b5, b6] = BADGES.map((b) => b.id);

test('recentBadges: nichts verdient → leer', () => {
  assert.deepEqual(recentBadges({}, {}), []);
  assert.deepEqual(recentBadges({ [b0!]: 0 }, null), []);
});

test('recentBadges: neueste zuerst, höchstens 5, nur verdiente', () => {
  const tiers = { [b0!]: 1, [b1!]: 2, [b2!]: 1, [b3!]: 3, [b4!]: 1, [b5!]: 1, [b6!]: 0 };
  const stored = { [b0!]: { ts: 10 }, [b1!]: { ts: 50 }, [b2!]: { ts: 30 }, [b3!]: { ts: 40 }, [b4!]: { ts: 20 }, [b5!]: { ts: 60 } };
  assert.deepEqual(recentBadges(tiers, stored, 5), [b5, b1, b3, b2, b4]);
  assert.deepEqual(recentBadges(tiers, stored, 2), [b5, b1]);
});

test('recentBadges: ohne Zeitstempel zuletzt, dann Katalogreihenfolge', () => {
  const tiers = { [b2!]: 1, [b1!]: 1, [b0!]: 1 };
  assert.deepEqual(recentBadges(tiers, { [b2!]: { ts: 5 } }, 5), [b2, b0, b1]);
});

test('newestCards: neueste zuerst, höchstens 3, unbekannte ignoriert', () => {
  const [c0, c1, c2, c3] = CARD_IDS;
  const cards = { [c0!]: 100, [c1!]: 300, [c2!]: 200, [c3!]: 50, 'gibt-es-nicht': 999 };
  assert.deepEqual(newestCards(cards, 3), [c1, c2, c0]);
  assert.deepEqual(newestCards({}, 3), []);
});

test('cheapestOpenItem: ohne Käufe der Freeze (günstigster)', () => {
  assert.equal(cheapestOpenItem({ purchases: {}, freezes: 0 })?.id, 'freeze');
});

test('cheapestOpenItem: Freeze-Vorrat voll → nächstgünstigster (Rahmen Silber)', () => {
  assert.equal(cheapestOpenItem({ purchases: {}, freezes: MAX_FREEZES })?.id, 'frame:silver');
});

test('cheapestOpenItem: Besitz wird übersprungen, alles gekauft → null', () => {
  assert.equal(cheapestOpenItem({ purchases: { 'frame:silver': 1 }, freezes: MAX_FREEZES })?.id, 'theme:sunset');
  const all = { 'frame:silver': 1, 'frame:gold': 1, 'frame:diamond': 1, 'theme:sunset': 1, 'theme:sand': 1, 'theme:ocean': 1 };
  assert.equal(cheapestOpenItem({ purchases: all, freezes: MAX_FREEZES }), null);
});

test('Texte: de und en haben die neuen Schlüssel, nicht leer', () => {
  for (const k of ['back', 'secQuests', 'secLeague', 'secBadges', 'secCards', 'secShop', 'secStats', 'statsTitle', 'badgesEmpty', 'cardsEmpty', 'shopNext', 'shopAllOwned', 'chestReady'] as const) {
    assert.ok(de.rewards[k].length > 0, `de ${k}`);
    assert.ok(en.rewards[k].length > 0, `en ${k}`);
  }
});
