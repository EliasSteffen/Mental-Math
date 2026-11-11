// Paket H: Spielerkarte (Zahlen), Beispielaufgabe und Tagesziel-Punkte der Heute-Karte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestDaily, profileCardData } from '../src/views/profile-card-data.ts';
import { goalDots, heroExample, MAX_GOAL_DOTS } from '../src/views/home-data.ts';
import { BADGES } from '../src/core/badges.ts';
import { CARD_IDS } from '../src/core/cards.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import type { Attempt, Recommendation } from '../src/types.ts';

let ts = 1_700_000_000_000;
const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: ++ts, sessionId: 's', mode: 'mult.2x1', category: 'mult', subtype: 'mult.2x1', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 3000, targetMs: 5000, weight: 1, points: 100, ...o,
});
const base = { sessions: [], activity: {}, dailyResults: {}, goalRounds: 3, tier: 0, badges: {}, cards: {} };

test('Spielerkarte: leerer Stand', () => {
  const d = profileCardData({ ...base, attempts: [] });
  assert.equal(d.level, 1);
  assert.equal(d.xpFraction, 0);
  assert.equal(d.accuracy, null);
  assert.equal(d.bestDaily, null);
  assert.equal(d.solved, 0);
  assert.deepEqual(d.badges, { earned: 0, total: BADGES.length });
  assert.deepEqual(d.cards, { earned: 0, total: CARD_IDS.length });
});

test('Spielerkarte: XP, Genauigkeit (ohne „Weiß nicht“), Orden und Karten', () => {
  const attempts = [att(), att(), att({ correct: false, errorType: 'falsch', points: 0 }), att({ correct: false, errorType: 'skip', points: 0 })];
  const first = BADGES[0]?.id;
  assert.ok(first);
  const d = profileCardData({
    ...base, attempts, tier: 4, badges: { [first]: 2 }, cards: { [CARD_IDS[0] ?? '']: 1, fremd: 1 },
    sessions: [{ ts } as never],
  });
  assert.equal(d.tier, 4);
  assert.equal(d.xpInto, 200);
  assert.equal(d.xpNeeded, 500);
  assert.equal(d.xpFraction, 0.4);
  assert.equal(d.solved, 2);
  assert.equal(d.accuracy, 67);
  assert.equal(d.rounds, 1);
  assert.equal(d.badges.earned, 1);
  assert.equal(d.cards.earned, 1);
});

test('Spielerkarte: Serie und Freezes aus der Historie', () => {
  const now = new Date(2026, 5, 10, 12).getTime();
  const sessions = [0, 1, 2].map((i) => ({ ts: now - i * 86_400_000 }) as never);
  const d = profileCardData({ ...base, attempts: [], sessions, now });
  assert.equal(d.streak, 3);
  assert.equal(d.streakBest, 3);
  assert.equal(d.freezes, 0);
});

test('bestDaily: höchster Anteil, bei Gleichstand mehr Punkte', () => {
  assert.equal(bestDaily({}), null);
  assert.equal(bestDaily(null), null);
  const r = (correct: number, n: number, points: number) => ({ n, correct, points, timeMs: 1, ts: 1 });
  assert.deepEqual(bestDaily({ a: r(10, 15, 100), b: r(12, 15, 90), c: r(12, 15, 95) }), { correct: 12, n: 15 });
});

test('goalDots: gefüllt/offen, Grenzen', () => {
  assert.deepEqual(goalDots(2, 3), { filled: 2, total: 3 });
  assert.deepEqual(goalDots(5, 3), { filled: 3, total: 3 });
  assert.deepEqual(goalDots(0, 0), { filled: 0, total: 1 });
  assert.equal(goalDots(0, 99).total, MAX_GOAL_DOTS);
});

const rec = (o: Partial<Recommendation>): Recommendation => ({ kind: 'mixed', mode: 'all', subtype: null, title: 'x', reason: 'y', ...o });

test('heroExample: Subtyp → Aufgabe, am selben Tag stabil, an anderen Tagen anders', () => {
  const r = rec({ kind: 'new', mode: 'mult.2x1', subtype: 'mult.2x1' });
  const a = heroExample(r, { dayKey: '2026-06-10' });
  assert.equal(a?.kind, 'task');
  assert.deepEqual(a, heroExample(r, { dayKey: '2026-06-10' }));
  const prompts = new Set(['2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'].map((d) => JSON.stringify(heroExample(r, { dayKey: d }))));
  assert.ok(prompts.size > 1);
});

test('heroExample: Exhibit zeigt nur den Fragetext', () => {
  const r = rec({ kind: 'new', mode: 'exhibit.share', subtype: 'exhibit.share' });
  const ex = heroExample(r, { dayKey: '2026-06-10' });
  assert.equal(ex?.kind, 'task');
  if (ex?.kind === 'task') assert.ok(ex.prompt.length > 0 && !ex.prompt.includes('|'));
});

test('heroExample: Review und gemischt → 2–3 Typnamen', () => {
  const review = heroExample(rec({ kind: 'review', mode: 'review' }), {
    dayKey: '2026-06-10', reviewSubtypes: ['mult.2x1', 'pct.of', 'div.2by1', 'mult.2x1'],
  });
  assert.equal(review?.kind, 'names');
  if (review?.kind === 'names') {
    assert.ok(review.names.length >= 2 && review.names.length <= 3);
    for (const n of review.names) assert.ok(Object.values(SUBTYPES).some((s) => s.name === n));
  }
  const mixed = heroExample(rec({}), { dayKey: '2026-06-10' });
  assert.equal(mixed?.kind, 'names');
  assert.deepEqual(mixed, heroExample(rec({}), { dayKey: '2026-06-10' }));
  // zu wenige fällige Typen → kein Block
  assert.equal(heroExample(rec({ kind: 'review', mode: 'review' }), { dayKey: 'd', reviewSubtypes: ['pct.of'] }), null);
});
