// v10 F: Rundenbilanz – LP-Delta der Liga-Wertung, Level aus dem XP-Konto (inkl. Geschenke), Rückfall auf Aufgaben-XP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRecap } from '../src/core/recap.ts';
import { leagueRating, tierIndex } from '../src/core/league.ts';
import { levelOf } from '../src/core/xp.ts';
import type { Attempt, Session } from '../src/types.ts';

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 'x', mode: 'all', category: 'mult', subtype: 'mult.2x1', prompt: 'p', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 3000, targetMs: 6000, weight: 1, points: 100, params: {}, ...o,
} as Attempt);

/** Viele richtige Aufgaben aller Typen, damit die Liga-Wertung klar über 0 liegt */
const practised = (count: number, sessionId = 'old'): Attempt[] =>
  Array.from({ length: count }, (_, i) => att({ ts: i + 1, sessionId, subtype: i % 2 ? 'mult.2x1' : 'mult.2x2' }));

const base = {
  mode: 'all', n: 10, correct: 10, avgMs: 4200, assistedAny: false,
  sessionsBefore: [] as Session[], attemptsBefore: [] as Attempt[], attemptsAfter: [] as Attempt[],
};

test('LP: Wertung vor und nach der Runde, Delta ist die Differenz', () => {
  const before = practised(40);
  const round = Array.from({ length: 10 }, () => att({ sessionId: 'now', ts: 99 }));
  const r = roundRecap({ ...base, attemptsBefore: before, attemptsAfter: [...before, ...round] });
  assert.equal(r.lp.before, leagueRating(before));
  assert.equal(r.lp.after, leagueRating([...before, ...round]));
  assert.equal(r.lp.delta, r.lp.after - r.lp.before);
});

test('LP: keine Aufgaben vorher, Stand danach als Wertung; Stufe ohne gespeicherte Stufe = reine Wertung', () => {
  const after = practised(60, 'now');
  const r = roundRecap({ ...base, attemptsAfter: after });
  assert.equal(r.lp.before, 0);
  assert.equal(r.lp.after, leagueRating(after));
  assert.ok(r.lp.delta > 0);
  assert.equal(r.lp.tier, tierIndex(r.lp.after));
});

test('LP: Aufstieg zählt sofort – die gespeicherte Stufe 0 wird überschritten', () => {
  const after = practised(60, 'now');
  const r = roundRecap({ ...base, attemptsAfter: after, leagueTier: 0 });
  assert.equal(r.lp.tier, tierIndex(r.lp.after));
});

test('LP: ohne Aufgaben – Delta 0, Stufe Bronze I', () => {
  const r = roundRecap({ ...base, n: 0, correct: 0 });
  assert.deepEqual(r.lp, { before: 0, after: 0, delta: 0, tier: 0 });
});

test('Level: aus dem XP-Konto (inkl. Geschenk-XP), Level-up aus levelOf', () => {
  // Konto vorher 1200 XP (Level 2), nach der Runde 1500 (Level 3) – 300 XP gewonnen, davon 100 Geschenk
  const r = roundRecap({ ...base, xp: { before: 1200, after: 1500 } });
  const after = levelOf(1500);
  assert.equal(r.level.level, after.level);
  assert.equal(r.level.into, after.into);
  assert.equal(r.level.needed, after.needed);
  assert.equal(r.level.gained, 300);
  assert.equal(r.level.levelUp, true);
});

test('Level: ohne Level-up bleibt levelUp aus', () => {
  const r = roundRecap({ ...base, xp: { before: 600, after: 700 } });
  assert.equal(r.level.level, 2);
  assert.equal(r.level.levelUp, false);
  assert.equal(r.level.gained, 100);
});

test('Level: ohne XP-Konto wie bisher aus den Aufgaben-XP der Versuche', () => {
  const before = [att({ points: 300 }), att({ points: 300 })]; // 600 XP → Level 2
  const r = roundRecap({ ...base, attemptsBefore: [], attemptsAfter: before });
  assert.equal(r.level.level, 2);
  assert.equal(r.level.into, 100);
  assert.equal(r.level.needed, 1000);
  assert.equal(r.level.gained, 600);
  assert.equal(r.level.levelUp, true);
});
