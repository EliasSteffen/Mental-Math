import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, streakInfo, heatmap, dailySeries, xpInfo, recommendation } from '../public/js/progress.js';
import { SUBTYPES, CATEGORIES } from '../public/js/generators.js';

const D = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();
const MIN = 60000;
const NOW = D(2026, 5, 10); // Mittwoch, 10.06.2026

test('dayKey lokal', () => {
  assert.equal(dayKey(D(2026, 0, 5, 0)), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 11, 31, 23, 59).getTime()), '2026-12-31');
});

test('streakInfo', () => {
  const goal = 10 * MIN;
  const act = { '2026-06-10': 12 * MIN, '2026-06-09': 10 * MIN, '2026-06-08': 20 * MIN, '2026-06-07': 5 * MIN, '2026-06-05': 30 * MIN, '2026-06-04': 30 * MIN, '2026-06-03': 30 * MIN, '2026-06-02': 30 * MIN };
  assert.deepEqual(streakInfo(act, goal, NOW), { current: 3, best: 4, todayMs: 12 * MIN, goalMs: goal, todayDone: true });
  // heute noch nicht erreicht → endet gestern
  const a2 = { ...act, '2026-06-10': 2 * MIN };
  const s2 = streakInfo(a2, goal, NOW);
  assert.equal(s2.current, 2);
  assert.equal(s2.todayDone, false);
  assert.equal(s2.todayMs, 2 * MIN);
  // gestern auch nicht → 0
  assert.equal(streakInfo({ '2026-06-08': goal }, goal, NOW).current, 0);
  assert.deepEqual(streakInfo({}, goal, NOW), { current: 0, best: 0, todayMs: 0, goalMs: goal, todayDone: false });
  // Monats-/Jahreswechsel
  const ny = { '2025-12-31': goal, '2026-01-01': goal, '2026-01-02': goal };
  assert.equal(streakInfo(ny, goal, D(2026, 0, 2)).current, 3);
  assert.equal(streakInfo(ny, goal, D(2026, 0, 2)).best, 3);
});

test('heatmap', () => {
  const goal = 10 * MIN;
  const act = { '2026-06-10': 12 * MIN, '2026-06-09': 4 * MIN, '2026-06-08': 8 * MIN, '2026-06-02': 25 * MIN };
  const cells = heatmap(act, goal, NOW);
  assert.equal(cells.length, 16 * 7);
  assert.equal(cells[0].date, '2026-02-23'); // Montag
  assert.equal(new Date(2026, 1, 23).getDay(), 1);
  assert.equal(cells.find((c) => c.date === '2026-06-08').level, 2);
  assert.equal(cells.find((c) => c.date === '2026-06-09').level, 1);
  assert.equal(cells.find((c) => c.date === '2026-06-10').level, 3);
  assert.equal(cells.find((c) => c.date === '2026-06-02').level, 4);
  assert.equal(cells.find((c) => c.date === '2026-06-03').level, 0);
  assert.equal(cells[cells.length - 1].date, '2026-06-14'); // Sonntag der aktuellen Woche
  assert.equal(heatmap(act, goal, NOW, 4).length, 28);
  const sorted = cells.map((c) => c.date);
  assert.deepEqual([...sorted].sort(), sorted);
});

const att = (o = {}) => ({
  ts: NOW, category: 'pct', subtype: 'pct.of', correct: true, errorType: null, timeMs: 5000, targetMs: 10000, points: 100, ...o,
});

test('dailySeries', () => {
  const attempts = [
    att({ ts: D(2026, 5, 10) }),
    att({ ts: D(2026, 5, 10, 8), correct: false, points: 0 }),
    att({ ts: D(2026, 5, 9), timeMs: 20000 }),
    att({ ts: D(2026, 5, 9), category: 'mult', subtype: 'mult.2x1' }),
    att({ ts: D(2026, 5, 8), untimed: true }),
    att({ ts: D(2026, 4, 1) }),
  ];
  const s = dailySeries(attempts, { days: 4, now: NOW });
  assert.deepEqual(s.map((x) => x.date), ['2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']);
  assert.deepEqual(s[0], { date: '2026-06-07', n: 0, accuracy: null, speed: null });
  assert.deepEqual(s[1], { date: '2026-06-08', n: 1, accuracy: 1, speed: null });
  assert.equal(s[2].n, 2);
  assert.equal(s[2].accuracy, 1);
  assert.ok(Math.abs(s[2].speed - 0.75) < 1e-9);
  assert.equal(s[3].accuracy, 0.5);
  assert.equal(s[3].speed, 0.5 === 0 ? 0 : s[3].speed);
  const c = dailySeries(attempts, { category: 'mult', days: 2, now: NOW });
  assert.deepEqual(c.map((x) => x.n), [1, 0]);
  assert.equal(dailySeries(attempts, { now: NOW }).length, 14);
});

test('xpInfo', () => {
  assert.deepEqual(xpInfo([]), { xp: 0, level: 1, into: 0, needed: 500 });
  assert.deepEqual(xpInfo([att({ points: 499 })]), { xp: 499, level: 1, into: 499, needed: 500 });
  assert.deepEqual(xpInfo([att({ points: 500 })]), { xp: 500, level: 2, into: 0, needed: 1000 });
  assert.deepEqual(xpInfo([att({ points: 1000 }), att({ points: 600 })]), { xp: 1600, level: 3, into: 100, needed: 1500 });
});

test('recommendation: Priorität', () => {
  const DAY = 86400000;
  const due = { 'biz.roi': { box: 0, dueAt: NOW - DAY, lastTs: 0 }, 'pct.of': { box: 1, dueAt: NOW - 1, lastTs: 0 } };
  const bad = Array(5).fill(0).map((_, i) => att({ subtype: 'pct.reverse', correct: i < 2, errorType: i < 2 ? null : 'falsch' }));
  let r = recommendation(bad, due, NOW);
  assert.equal(r.kind, 'review');
  assert.equal(r.mode, 'review');
  assert.equal(r.subtype, null);
  assert.equal(r.reason, '2 Wiederholungen fällig');
  assert.equal(recommendation(bad, { 'biz.roi': { box: 0, dueAt: NOW, lastTs: 0 }, 'pct.of': { box: 0, dueAt: NOW + 1, lastTs: 0 } }, NOW).reason, '1 Wiederholung fällig');
  r = recommendation(bad, {}, NOW);
  assert.deepEqual(r, { kind: 'weak', mode: 'pct.reverse', subtype: 'pct.reverse', title: 'Rückwärts-Prozent', reason: '40 % richtig in den letzten Versuchen' });
  r = recommendation([], {}, NOW);
  assert.equal(r.kind, 'new');
  assert.equal(r.subtype, 'mult.2x1');
  assert.equal(r.title, SUBTYPES['mult.2x1'].name);
  assert.equal(r.reason, 'Noch nie geübt');
  const good = Object.keys(SUBTYPES).flatMap((id) => Array(5).fill(0).map(() => att({ subtype: id, category: SUBTYPES[id].category })));
  r = recommendation(good, {}, NOW);
  assert.deepEqual([r.kind, r.mode, r.subtype], ['mixed', 'all', null]);
  assert.ok(r.title && r.reason);
  // Teil geübt: erste Kategorie-Reihenfolge
  const some = good.filter((a) => a.subtype !== 'frac.of');
  assert.equal(recommendation(some, {}, NOW).subtype, 'frac.of');
  assert.ok(CATEGORIES.length);
});
