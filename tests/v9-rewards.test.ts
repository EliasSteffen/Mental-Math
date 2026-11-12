// Paket J: Belohnungen erkennen (core/rewards.ts) und Einstellungen league/badges/cards
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyEvents, evaluateRewards, rewardLines, splitRewardLines, type RewardHistory, type RewardStore } from '../src/core/rewards.ts';
import { DEFAULT_SETTINGS, normalizeBadges, normalizeCards, normalizeLeague, normalizeSettings } from '../src/data/schema.ts';
import { getSettings, resetAll, setSettings } from '../src/data/storage.ts';
import { att, perfectFor, sess, subtypeAttempts } from './v9-rewards-helpers.ts';

const hist = (o: Partial<RewardHistory> = {}): RewardHistory => ({
  attempts: [], sessions: [], dailyResults: {}, streakBest: 0, chainBest: {}, parallelBest: 0, placement: false, ...o,
});
const store = (o: Partial<RewardStore> = {}): RewardStore => ({ league: null, badges: {}, cards: {}, ...o });
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

test('Erste Auswertung (Neuinstallation): Bronze I, still, nichts verdient', () => {
  const r = evaluateRewards(hist(), store(), 1000);
  assert.equal(r.first, true);
  assert.deepEqual(r.store, { league: { tier: 0, peak: 0, ts: 1000 }, badges: {}, cards: {} });
  assert.equal(r.changed, true);
  assert.deepEqual(r.events, emptyEvents());
  assert.equal(r.rating, 0);
});

test('Bestandsnutzer: Verdientes wird still gespeichert, keine Ereignisse', () => {
  const history = hist({
    attempts: [...perfectFor(12), ...range(120).map(() => att())],
    sessions: range(12).map((i) => sess({ id: `s${i}`, n: 10, correct: 10 })),
    streakBest: 8,
  });
  const r = evaluateRewards(history, store(), 5000);
  assert.equal(r.first, true);
  assert.deepEqual(r.events, emptyEvents());
  assert.equal(Object.keys(r.store.cards).length, 12, 'zwölf perfekte Typen');
  assert.equal(r.store.badges['streak']?.tier, 1);
  assert.equal(r.store.badges['solved']?.tier, 1);
  assert.equal(r.store.badges['rounds']?.tier, 1);
  assert.equal(r.store.badges['cards']?.tier, 1);
  assert.ok((r.store.league?.tier ?? 0) > 0);
  // Danach ist alles Bestand: eine zweite Auswertung ohne neue Daten meldet nichts und ändert nichts
  const again = evaluateRewards(history, r.store, 6000);
  assert.equal(again.first, false);
  assert.equal(again.changed, false);
  assert.deepEqual(again.events, emptyEvents());
  assert.equal(again.store.league, r.store.league);
});

test('Runde schaltet eine Karte frei: Ereignis mit dem Typ, einmalig', () => {
  const before = evaluateRewards(hist({ attempts: subtypeAttempts('pct.of', 7, 3) }), store({ league: { tier: 0, peak: 0, ts: 1 } }), 10);
  assert.deepEqual(before.events.cards, []);
  const after = evaluateRewards(hist({ attempts: subtypeAttempts('pct.of', 7, 4) }), before.store, 20);
  assert.deepEqual(after.events.cards, ['pct.of']);
  assert.equal(after.store.cards['pct.of'], 20);
  assert.equal(after.changed, true);
  // Skill fällt wieder: Karte bleibt, nichts Neues
  const lost = evaluateRewards(hist({ attempts: subtypeAttempts('pct.of', 7, 1) }), after.store, 30);
  assert.deepEqual(lost.events.cards, []);
  assert.equal(lost.store.cards['pct.of'], 20);
});

test('Aufstieg: promoted mit von/nach, Peak steigt', () => {
  const start = store({ league: { tier: 0, peak: 0, ts: 1 } });
  const r = evaluateRewards(hist({ attempts: perfectFor(5) }), start, 10); // 5/49 · 1000 ≈ 102 → Bronze III
  assert.deepEqual(r.events.promoted, { from: 0, to: 2 });
  assert.equal(r.events.demoted, undefined);
  assert.deepEqual(r.store.league, { tier: 2, peak: 2, ts: 10 });
});

test('Abstieg erst mit Abstand; Peak bleibt, Meldung „demoted“', () => {
  const high = store({ league: { tier: 5, peak: 5, ts: 1 } }); // Silber III (250)
  const stay = evaluateRewards(hist({ attempts: perfectFor(11) }), high, 10); // 11/49 ≈ 224 ≥ 225? → knapp darunter
  const rating = stay.rating;
  assert.ok(rating >= 200 && rating < 250);
  if (rating >= 225) assert.equal(stay.events.demoted, undefined, 'im Puffer: keine Meldung');
  const down = evaluateRewards(hist({ attempts: perfectFor(5) }), high, 20); // ≈ 102
  assert.deepEqual(down.events.demoted, { from: 5, to: 2 });
  assert.equal(down.store.league?.peak, 5);
  assert.equal(down.events.promoted, undefined);
});

test('Orden nie verloren: gespeicherte Stufe bleibt ohne Historie', () => {
  const r = evaluateRewards(hist(), store({ league: { tier: 0, peak: 0, ts: 1 }, badges: { solved: { tier: 3, ts: 1 } }, cards: { 'pct.of': 1 } }), 99);
  assert.equal(r.store.badges['solved']?.tier, 3);
  assert.equal(r.store.cards['pct.of'], 1);
  assert.deepEqual(r.events.badges, []);
});

test('Neuer Orden: Ereignis mit Stufe; Liga-Peak füttert „Aufsteiger“', () => {
  const start = store({ league: { tier: 0, peak: 0, ts: 1 } });
  const r = evaluateRewards(hist({ sessions: range(10).map((i) => sess({ id: `s${i}`, mode: 'chain', n: 1, correct: 0, ts: new Date(2026, 0, 15 + i, 12).getTime() })) }), start, 10);
  assert.deepEqual(r.events.badges, [{ id: 'rounds', tier: 1 }]);
  // Peak Silber I (Stufe 3) → climber Bronze
  const strong = evaluateRewards(hist({ attempts: perfectFor(15) }), start, 20); // 15/49 ≈ 306 → Gold I
  assert.ok(strong.events.badges.some((b) => b.id === 'climber' && b.tier >= 1));
  assert.deepEqual(strong.events.promoted, { from: 0, to: strong.store.league?.tier });
});

test('Karten-Zahl treibt „Sammler“ in derselben Auswertung', () => {
  const start = store({ league: { tier: 0, peak: 0, ts: 1 } });
  const r = evaluateRewards(hist({ attempts: perfectFor(10) }), start, 10);
  assert.equal(r.events.cards.length, 10);
  assert.ok(r.events.badges.some((b) => b.id === 'cards' && b.tier === 1));
});

test('Ergebniszeilen: Reihenfolge, höchstens 4 (v10), Rest als „+N“', () => {
  const ev = {
    promoted: { from: 5, to: 6 },
    badges: [{ id: 'streak' as const, tier: 1 as const }, { id: 'rounds' as const, tier: 2 as const }],
    cards: ['pct.of', 'mult.2x1'],
  };
  const lines = rewardLines(ev);
  assert.deepEqual(lines.map((l) => l.kind), ['league', 'badge', 'badge', 'card', 'card']);
  const { shown, more } = splitRewardLines(ev);
  assert.equal(shown.length, 4);
  assert.equal(more, 1);
  assert.deepEqual(splitRewardLines(emptyEvents()), { shown: [], more: 0 });
  assert.deepEqual(splitRewardLines({ badges: [], cards: ['pct.of'] }), { shown: [{ kind: 'card', id: 'pct.of' }], more: 0 });
  // Abstieg dezent, zuletzt
  const down = rewardLines({ demoted: { from: 6, to: 5 }, badges: [{ id: 'streak', tier: 1 }], cards: [] });
  assert.deepEqual(down.map((l) => l.kind), ['badge', 'league']);
  assert.equal((down[1] as { up: boolean }).up, false);
});

test('Einstellungen: Defaults und Normalisierung', () => {
  assert.equal(DEFAULT_SETTINGS.league, null);
  assert.deepEqual(DEFAULT_SETTINGS.badges, {});
  assert.deepEqual(DEFAULT_SETTINGS.cards, {});
  const keys = Object.keys(DEFAULT_SETTINGS);
  assert.deepEqual(keys.slice(keys.indexOf('league'), keys.indexOf('league') + 3), ['league', 'badges', 'cards'], 'angehängt (v10 folgt danach)');

  assert.deepEqual(normalizeLeague({ tier: 4, peak: 9, ts: 5 }), { tier: 4, peak: 9, ts: 5 });
  assert.deepEqual(normalizeLeague({ tier: 9, peak: 4, ts: 5 }), { tier: 9, peak: 9, ts: 5 }, 'Peak nie unter der Stufe');
  for (const bad of [null, 'x', [], {}, { tier: 16, peak: 16, ts: 1 }, { tier: -1, peak: 0, ts: 1 }, { tier: 1.5, peak: 2, ts: 1 }, { tier: 1, peak: 1, ts: Number.NaN }, { tier: '1', peak: 1, ts: 1 }]) {
    assert.equal(normalizeLeague(bad), null, JSON.stringify(bad));
  }

  assert.deepEqual(normalizeBadges({ streak: { tier: 2, ts: 7 }, x: { tier: 0, ts: 1 }, y: { tier: 4, ts: 1 }, z: { tier: 1 }, w: 'n' }), { streak: { tier: 2, ts: 7 } });
  assert.deepEqual(normalizeBadges(null), {});
  assert.deepEqual(normalizeBadges([]), {});
  assert.equal(Object.keys(normalizeBadges(Object.fromEntries(range(100).map((i) => [`b${i}`, { tier: 1, ts: 1 }])))).length, 64);

  assert.deepEqual(normalizeCards({ 'pct.of': 5, bad: 'x', nan: Number.NaN }), { 'pct.of': 5 });
  assert.deepEqual(normalizeCards('x'), {});
  assert.equal(Object.keys(normalizeCards(Object.fromEntries(range(300).map((i) => [`c${i}`, 1])))).length, 200);

  const s = normalizeSettings({ league: { tier: 2, peak: 2, ts: 1 }, badges: { streak: { tier: 1, ts: 1 } }, cards: { 'pct.of': 1 }, theme: 'night' });
  assert.deepEqual(s.league, { tier: 2, peak: 2, ts: 1 });
  assert.equal(s.theme, 'night');
  const junk = normalizeSettings({ league: 7, badges: 'x', cards: [] });
  assert.equal(junk.league, null);
  assert.deepEqual(junk.badges, {});
  assert.deepEqual(junk.cards, {});
});

test('Einstellungen: Speichern und Lesen über den Speicher; unbekannte Felder alter Clients bleiben', () => {
  resetAll();
  assert.equal(getSettings().league, null);
  setSettings({ league: { tier: 3, peak: 4, ts: 9 }, badges: { streak: { tier: 2, ts: 9 } }, cards: { 'pct.of': 9 } });
  const s = getSettings();
  assert.deepEqual(s.league, { tier: 3, peak: 4, ts: 9 });
  assert.deepEqual(s.badges, { streak: { tier: 2, ts: 9 } });
  assert.deepEqual(s.cards, { 'pct.of': 9 });
  setSettings({ sessionLength: 20 });
  assert.deepEqual(getSettings().cards, { 'pct.of': 9 }, 'andere Änderungen lassen Sammlung stehen');
  resetAll();
});
