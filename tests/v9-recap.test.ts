import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRecap } from '../src/core/recap.ts';
import type { Attempt, Session } from '../src/types.ts';

const sess = (o: Partial<Session> = {}): Session => ({ id: 's0', ts: 1000, mode: 'all', n: 10, correct: 9, points: 500, avgTimeMs: 5000, ...o });
const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 'x', mode: 'all', category: 'mult', subtype: 'mult.2x1', prompt: 'p', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 3000, targetMs: 6000, weight: 1, points: 100, params: {}, ...o,
} as Attempt);
const base = { mode: 'all', n: 10, correct: 10, avgMs: 4200, assistedAny: false, sessionsBefore: [] as Session[], attemptsBefore: [] as Attempt[], attemptsAfter: [] as Attempt[] };

test('perfect: n >= 3, alle richtig, ohne Hilfe', () => {
  assert.equal(roundRecap(base).perfect, true);
  assert.equal(roundRecap({ ...base, correct: 9 }).perfect, false);
  assert.equal(roundRecap({ ...base, assistedAny: true }).perfect, false);
  assert.equal(roundRecap({ ...base, n: 2, correct: 2 }).perfect, false);
});

test('newBest: ohne Vorwert und schneller als Vorwert', () => {
  assert.deepEqual(roundRecap(base).newBest, { avgMs: 4200, prevAvgMs: null });
  const prev = [sess({ avgTimeMs: 5000 })];
  assert.deepEqual(roundRecap({ ...base, sessionsBefore: prev }).newBest, { avgMs: 4200, prevAvgMs: 5000 });
  assert.equal(roundRecap({ ...base, avgMs: 5200, sessionsBefore: prev }).newBest, null);
});

test('newBest: Qualifikation und Modi', () => {
  assert.equal(roundRecap({ ...base, n: 4, correct: 4 }).newBest, null);
  assert.equal(roundRecap({ ...base, correct: 7 }).newBest, null);
  for (const mode of ['daily', 'retry', 'review', 'placement', 'challenge', 'custom']) {
    assert.equal(roundRecap({ ...base, mode }).newBest, null, mode);
  }
});

test('vsLast: gegen die letzte Runde desselben Modus', () => {
  assert.equal(roundRecap(base).vsLast, null);
  const before = [sess({ ts: 1, avgTimeMs: 9000 }), sess({ ts: 5, avgTimeMs: 4800, correct: 8 }), sess({ ts: 9, mode: 'weak', avgTimeMs: 1 })];
  const r = roundRecap({ ...base, sessionsBefore: before }).vsLast;
  assert.ok(r);
  assert.equal(r.deltaAvgMs, -600);
  assert.ok(Math.abs(r.deltaAcc - 0.2) < 1e-9);
});

test('skill: größter Zuwachs unter den Subtypen der Runde', () => {
  const b = [att({ correct: false, errorType: 'falsch', timeMs: 9000 }), att({ correct: false, errorType: 'falsch' }), att({ correct: true })];
  const added = [att({}), att({}), att({})];
  const r = roundRecap({ ...base, attemptsBefore: b, attemptsAfter: [...b, ...added] });
  assert.ok(r.skill);
  assert.equal(r.skill.subtype, 'mult.2x1');
  assert.ok(r.skill.before !== null && r.skill.after > r.skill.before);
  // kein Zuwachs
  const worse = [att({}), att({}), att({})];
  const w = roundRecap({ ...base, attemptsBefore: worse, attemptsAfter: [...worse, att({ correct: false, errorType: 'falsch' })] });
  assert.equal(w.skill, null);
});

test('level: Level-up an der Grenze', () => {
  const b = [att({ points: 495 })];
  const up = roundRecap({ ...base, attemptsBefore: b, attemptsAfter: [...b, att({ points: 20 })] }).level;
  assert.equal(up.levelUp, true);
  assert.equal(up.level, 2);
  assert.equal(up.gained, 20);
  assert.equal(up.into, 15);
  assert.equal(up.needed, 1000);
  const same = roundRecap({ ...base, attemptsBefore: b, attemptsAfter: [...b, att({ points: 4 })] }).level;
  assert.equal(same.levelUp, false);
  assert.equal(same.level, 1);
});
