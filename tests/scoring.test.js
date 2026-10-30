import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeFactor, evaluate, skill, categoryStats, subtypeStats, overall, weaknesses, errorPatterns, sessionSummary,
} from '../public/js/scoring.js';
import { SUBTYPES, CATEGORIES } from '../public/js/generators.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const task = (o = {}) => ({ expected: 408, tolerance: { abs: 0, rel: 0 }, targetMs: 10000, weight: 1, ...o });

test('timeFactor', () => {
  near(timeFactor(5000, 10000), 1);
  near(timeFactor(10000, 10000), 1);
  near(timeFactor(20000, 10000), 0.7);
  near(timeFactor(30000, 10000), 0.4);
  near(timeFactor(99000, 10000), 0.4);
});

test('evaluate', () => {
  let r = evaluate(task(), 408, 5000);
  assert.deepEqual([r.correct, r.errorType, r.points], [true, null, 100]);
  r = evaluate(task({ weight: 2 }), 408, 20000);
  assert.equal(r.points, 140);
  r = evaluate(task(), 4080, 5000);
  assert.deepEqual([r.correct, r.errorType, r.points], [false, 'nullen', 0]);
  r = evaluate(task(), 40.8, 5000);
  assert.equal(r.errorType, 'nullen');
  r = evaluate(task({ expected: 920 }), 918, 5000);
  assert.deepEqual([r.correct, r.errorType, r.points], [false, 'knapp', 20]);
  assert.equal(evaluate(task({ expected: 920, weight: 1.5 }), 918, 5000).points, 30);
  r = evaluate(task(), 100, 5000);
  assert.deepEqual([r.correct, r.errorType, r.points], [false, 'falsch', 0]);
  r = evaluate(task(), null, 5000);
  assert.deepEqual([r.correct, r.errorType, r.points], [false, 'skip', 0]);
  // Toleranz
  assert.equal(evaluate(task({ expected: 100, tolerance: { abs: 0, rel: 0.05 } }), 105, 1000).correct, true);
  assert.equal(evaluate(task({ expected: 100, tolerance: { abs: 1, rel: 0 } }), 101, 1000).correct, true);
});

const att = (o = {}) => ({
  category: 'pct', subtype: 'pct.of', correct: true, errorType: null, timeMs: 5000, targetMs: 10000, points: 100, ...o,
});

test('skill', () => {
  assert.equal(skill([att(), att()]).score, null);
  assert.equal(skill([att(), att()]).n, 2);
  const s = skill([att(), att(), att(), att({ correct: false, errorType: 'falsch', timeMs: 20000 })]);
  near(s.accuracy, 0.75);
  near(s.speed, 1);
  assert.equal(s.score, Math.round(100 * (0.7 * 0.75 + 0.3)));
  assert.equal(s.n, 4);
  near(s.avgTimeMs, 8750);
  near(s.avgTargetMs, 10000);
  // nur richtige Versuche zählen für speed; keiner richtig -> 0
  assert.equal(skill([att({ correct: false }), att({ correct: false }), att({ correct: false })]).speed, 0);
  // Fenster
  const many = [...Array(30).fill(0).map(() => att({ correct: false })), ...Array(25).fill(0).map(() => att())];
  assert.equal(skill(many).accuracy, 1);
  assert.equal(skill(many).n, 25);
});

test('categoryStats, subtypeStats, overall', () => {
  const cs = categoryStats([att()]);
  assert.equal(Object.keys(cs).length, CATEGORIES.length);
  assert.equal(cs.pct.n, 1);
  assert.equal(cs.mult.n, 0);
  const ss = subtypeStats([att()]);
  assert.equal(ss['pct.of'].n, 1);
  assert.equal(Object.keys(ss).length, Object.keys(SUBTYPES).length);
  assert.equal(overall(Array(120).fill(0).map(() => att())).n, 100);
});

test('weaknesses', () => {
  const bad = (sub, errs) => Array(5).fill(0).map((_, i) => att({
    category: SUBTYPES[sub].category, subtype: sub, correct: false, errorType: errs[i] || 'falsch',
  }));
  const slow = Array(5).fill(0).map(() => att({ subtype: 'pct.change', timeMs: 30000 }));
  const good = Array(5).fill(0).map(() => att({ subtype: 'frac.of', category: 'frac' }));
  const few = [att({ subtype: 'biz.roi', category: 'biz', correct: false })];
  const list = [
    ...bad('mult.2x2', ['nullen', 'nullen']),
    ...bad('div.round', []),
    ...slow, ...good, ...few,
  ];
  const w = weaknesses(list, 5);
  assert.deepEqual(w.map((x) => x.subtype), ['mult.2x2', 'div.round', 'pct.change']);
  assert.equal(w[0].reason, 'nullen');
  assert.equal(w[0].label, 'Nullen-Fehler');
  assert.equal(w[1].reason, 'ungenau');
  assert.equal(w[1].label, 'Ungenau');
  assert.equal(w[2].reason, 'langsam');
  assert.equal(w[2].label, 'Zu langsam');
  assert.equal(w[0].categoryName, 'Multiplikation');
  assert.equal(w[0].tip, SUBTYPES['mult.2x2'].tip);
  assert.equal(w[0].targetMs, SUBTYPES['mult.2x2'].targetMs);
  assert.ok(w[0].score <= w[1].score && w[1].score <= w[2].score);
  assert.equal(weaknesses(list, 2).length, 2);
});

test('errorPatterns, sessionSummary', () => {
  const list = [
    att(), att({ correct: false, errorType: 'nullen', points: 0 }), att({ correct: false, errorType: 'nullen', points: 0 }),
    att({ correct: false, errorType: 'knapp', points: 20 }), att({ correct: false, errorType: 'falsch', points: 0 }),
    att({ correct: false, errorType: 'skip', points: 0 }),
  ];
  assert.deepEqual(errorPatterns(list), { nullen: 2, knapp: 1, falsch: 1, skip: 1 });
  const s = sessionSummary(list);
  assert.equal(s.n, 6);
  assert.equal(s.correct, 1);
  near(s.accuracy, 1 / 6);
  assert.equal(s.points, 120);
  near(s.avgTimeMs, 5000);
  assert.deepEqual(sessionSummary([]), { n: 0, correct: 0, accuracy: 0, points: 0, avgTimeMs: 0 });
});

test('assisted halbiert Punkte nur bei richtiger Antwort', () => {
  assert.equal(evaluate(task(), 408, 5000, { assisted: true }).points, 50);
  assert.equal(evaluate(task({ weight: 2 }), 408, 20000, { assisted: true }).points, 70);
  assert.equal(evaluate(task(), 408, 5000).points, 100);
  const r = evaluate(task({ expected: 920 }), 918, 5000, { assisted: true });
  assert.equal(r.points, 20);
});

test('skill: assisted-richtige zählen 0,5 für accuracy', () => {
  const a = (o) => ({ correct: true, timeMs: 5000, targetMs: 10000, ...o });
  const s = skill([a({ assisted: true }), a({}), a({ correct: false }), a({ assisted: true })]);
  near(s.accuracy, 2 / 4);
  near(s.speed, 1);
});

test('evaluate: Größeneinheiten akzeptieren volle Zahl', () => {
  const t = task({ expected: 40, unit: 'Tsd.', subtype: 'big.div', tolerance: { abs: 0.005, rel: 0 } });
  assert.equal(evaluate(t, 40, 1000).correct, true);
  assert.equal(evaluate(t, 40000, 1000).correct, true);
  assert.equal(evaluate(t, 400000, 1000).errorType, 'nullen');
  assert.equal(evaluate(t, 4000, 1000).errorType, 'nullen');
  assert.equal(evaluate(t, 41000, 1000).errorType, 'knapp');
  const c = task({ expected: 31.5, unit: 'Mio. €', subtype: 'biz.tco', tolerance: { abs: 0.005, rel: 0 } });
  assert.equal(evaluate(c, 31500000, 1000).correct, true);
});

test('evaluate: pct.change akzeptiert negatives Vorzeichen', () => {
  const t = task({ expected: 20, subtype: 'pct.change', unit: '%' });
  assert.equal(evaluate(t, -20, 1000).correct, true);
  assert.equal(evaluate(t, 25, 1000).correct, false);
});
