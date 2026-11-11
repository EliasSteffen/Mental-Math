// Paket J: Ligen (core/league.ts) – Wertung, Schwellen, Hysterese, Peak
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAMPION_DEFAULT, DEMOTE_BUFFER, LEAGUES, MASTER_TIER, RANKED_SUBTYPE_IDS, TIER_MINS, advanceLeague, leagueRating, nextTier, tierIndex,
  tierInfo, tierOf, tierProgress,
} from '../src/core/league.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { att, perfectFor, subtypeAttempts } from './v9-rewards-helpers.ts';

test('Schwellen: 16 Stufen aufsteigend wie im Plan, Meister ab 780', () => {
  assert.deepEqual([...TIER_MINS], [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 660, 720, 780]);
  assert.equal(MASTER_TIER, 15);
  assert.deepEqual(LEAGUES.map((l) => l.id), ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master']);
  assert.equal(DEMOTE_BUFFER, 25);
  assert.equal(CHAMPION_DEFAULT, 10);
});

test('Wertung: ohne Daten 0, alle Typen perfekt 1000, ungeübt zählt 0', () => {
  assert.equal(leagueRating([]), 0);
  assert.equal(leagueRating(perfectFor(RANKED_SUBTYPE_IDS.length)), 1000);
  // Hälfte der Typen perfekt → etwa die Hälfte (ganzzahlig gerundet)
  const half = Math.floor(RANKED_SUBTYPE_IDS.length / 2);
  assert.equal(leagueRating(perfectFor(half)), Math.round((10 * half * 100) / RANKED_SUBTYPE_IDS.length));
});

test('Wertung: Typen der versteckten Kategorie „Eigenes“ zählen nicht mit', () => {
  assert.ok(!RANKED_SUBTYPE_IDS.some((id) => id.startsWith('custom.')));
  assert.equal(RANKED_SUBTYPE_IDS.length, Object.keys(SUBTYPES).length - 2);
  const custom = subtypeAttempts('custom.mul', 5, 5);
  assert.equal(leagueRating(custom), 0);
});

test('Wertung: weniger als 3 Versuche je Typ geben keinen Skill', () => {
  assert.equal(leagueRating([att({ subtype: 'pct.of' }), att({ subtype: 'pct.of' })]), 0);
  assert.ok(leagueRating(subtypeAttempts('pct.of', 3, 3)) > 0);
});

test('tierIndex: Grenzen an jeder Schwelle', () => {
  TIER_MINS.forEach((min, i) => {
    assert.equal(tierIndex(min), i, `ab ${min}`);
    if (min > 0) assert.equal(tierIndex(min - 1), i - 1, `unter ${min}`);
  });
  assert.equal(tierIndex(1000), 15);
  assert.equal(tierIndex(-5), 0);
  assert.equal(tierIndex(Number.NaN), 0);
});

test('tierInfo: Liga, Stufe, Schwellen; Meister ohne Stufe', () => {
  assert.deepEqual(tierInfo(0), { league: 'bronze', step: 1, min: 0, next: 50 });
  assert.deepEqual(tierInfo(2), { league: 'bronze', step: 3, min: 100, next: 150 });
  assert.deepEqual(tierInfo(3), { league: 'silver', step: 1, min: 150, next: 200 });
  assert.deepEqual(tierInfo(14), { league: 'diamond', step: 3, min: 720, next: 780 });
  assert.deepEqual(tierInfo(15), { league: 'master', step: null, min: 780, next: null });
  assert.equal(tierInfo(99).league, 'master');
  assert.equal(tierInfo(-3).league, 'bronze');
});

test('tierOf ist die Umkehrung von tierInfo', () => {
  for (let i = 0; i <= MASTER_TIER; i++) {
    const info = tierInfo(i);
    assert.equal(tierOf(info.league, info.step ?? 1), i);
  }
});

test('nextTier: Aufstieg sofort, Abstieg erst 25 LP unter der Schwelle', () => {
  assert.equal(nextTier(null, 360), 7); // ohne Vorwert: reine Wertung
  assert.equal(nextTier(3, 300), 6, 'Aufstieg sofort, auch über mehrere Stufen');
  assert.equal(nextTier(7, 350), 7);
  assert.equal(nextTier(7, 349), 7, 'knapp darunter bleibt');
  assert.equal(nextTier(7, 325), 7, 'genau Schwelle − Puffer bleibt');
  assert.equal(nextTier(7, 324), 6, 'darunter steigt ab');
  assert.equal(nextTier(15, 756), 15);
  assert.equal(nextTier(15, 754), 14);
  assert.equal(nextTier(0, 0), 0, 'Bronze I fällt nie');
});

test('nextTier: großer Absturz springt mehrere Stufen, nie über die bisherige hinaus', () => {
  assert.equal(nextTier(10, 100), 2);
  assert.ok(nextTier(4, 700) >= 4, 'Wertung über der Stufe: nie Abstieg');
  assert.equal(nextTier(Number.NaN, 120), tierIndex(120));
});

test('nextTier: hält Stufen ohne Flackern bei Schwankungen um die Schwelle', () => {
  let tier = 6; // Gold I (300)
  const seen: number[] = [];
  for (const r of [305, 290, 280, 301, 276, 299, 310]) {
    tier = nextTier(tier, r);
    seen.push(tier);
  }
  assert.deepEqual(seen, [6, 6, 6, 6, 6, 6, 6]);
  assert.equal(nextTier(6, 274), 5);
});

test('advanceLeague: Peak steigt nur, Abstieg lässt ihn stehen, unverändert → changed false', () => {
  const first = advanceLeague(null, 360, 1000);
  assert.deepEqual(first, { state: { tier: 7, peak: 7, ts: 1000 }, from: null, to: 7, changed: true });
  const same = advanceLeague(first.state, 355, 2000);
  assert.equal(same.changed, false);
  assert.equal(same.state, first.state, 'gleiches Objekt, keine neue ts');
  const down = advanceLeague(first.state, 200, 3000);
  assert.deepEqual(down.state, { tier: 4, peak: 7, ts: 3000 });
  assert.equal(down.from, 7);
  assert.equal(down.to, 4);
  const up = advanceLeague(down.state, 500, 4000);
  assert.deepEqual(up.state, { tier: 10, peak: 10, ts: 4000 });
});

test('tierProgress: Anteil zur nächsten Stufe, im Abstiegspuffer 0, Meister voll', () => {
  assert.deepEqual(tierProgress(0, 25), { into: 25, needed: 50, fraction: 0.5 });
  assert.deepEqual(tierProgress(7, 340), { into: 0, needed: 50, fraction: 0 });
  assert.equal(tierProgress(15, 900).fraction, 1);
  assert.equal(tierProgress(3, 199).fraction, 49 / 50);
});
