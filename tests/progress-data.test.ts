import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekDays, weekScaleMax, minutesLastDays, attemptsLastDays, accuracyOf, focusOf, patternCounts, recentErrors,
  relativeDay, firstLast, trendOf, dailyHistory, fmtSec, rollingMean,
} from '../src/views/progress-data.ts';
import { setLang } from '../src/i18n/index.ts';
import type { Attempt, ErrorType } from '../src/types.ts';

afterEach(() => setLang('de'));

const D = (y: number, m: number, d: number, h = 12): number => new Date(y, m, d, h).getTime();
const MIN = 60000;
const NOW = D(2026, 5, 10, 15); // Mittwoch, 10.06.2026, 15 Uhr

let seq = 0;
function att(o: Partial<Attempt> & { errorType?: ErrorType | null } = {}): Attempt {
  return {
    ts: NOW - 1000 * ++seq, sessionId: 's', mode: 'all', category: 'big', subtype: 'big.div', prompt: '12 Mrd. ÷ 400.000',
    unit: '', expected: 30000, given: 30000, correct: true, errorType: null, timeMs: 8000, targetMs: 15000, weight: 1.5, points: 100,
    ...o,
  };
}
const wrong = (errorType: ErrorType, o: Partial<Attempt> = {}): Attempt =>
  att({ correct: false, errorType, given: errorType === 'skip' ? null : 300000, points: 0, ...o });

test('weekDays: Montag bis Sonntag, heute markiert, Zukunft leer', () => {
  const act = { '2026-06-08': 12 * MIN, '2026-06-10': 15.4 * MIN, '2026-06-11': 99 * MIN };
  const days = weekDays(act, NOW);
  assert.deepEqual(days.map((d) => d.date), ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14']);
  assert.deepEqual(days.map((d) => d.min), [12, 0, 15, 99, 0, 0, 0]);
  assert.deepEqual(days.map((d) => d.today), [false, false, true, false, false, false, false]);
  assert.deepEqual(days.map((d) => d.future), [false, false, false, true, true, true, true]);
  // Sonntag gehört noch zur selben Woche
  assert.equal(weekDays({}, D(2026, 5, 14)).at(0)?.date, '2026-06-08');
  assert.equal(weekDays({}, D(2026, 5, 15)).at(0)?.date, '2026-06-15');
});

test('weekScaleMax: Ziel bei 75 %, größter Tag passt immer', () => {
  const days = weekDays({ '2026-06-08': 12 * MIN }, NOW);
  assert.equal(weekScaleMax(days, 15), 20);
  assert.equal(weekScaleMax(weekDays({ '2026-06-08': 40 * MIN }, NOW), 15), 40);
  assert.equal(weekScaleMax(days, 0), 12);
});

test('minutesLastDays und attemptsLastDays: heute plus 6 Tage', () => {
  const act = { '2026-06-10': 10 * MIN, '2026-06-04': 5 * MIN, '2026-06-03': 99 * MIN };
  assert.equal(minutesLastDays(act, NOW), 15);
  assert.equal(minutesLastDays(null, NOW), 0);
  const list = [att({ ts: D(2026, 5, 4, 0) + 1 }), att({ ts: D(2026, 5, 3, 23) }), att({ ts: NOW - 1 })];
  assert.equal(attemptsLastDays(list, NOW).length, 2);
});

test('accuracyOf: Anteil richtig, null ohne Daten', () => {
  assert.equal(accuracyOf([]), null);
  assert.equal(accuracyOf([att(), att(), wrong('falsch'), att()]), 0.75);
});

test('focusOf: schwächster Subtyp mit Nullen-Fehlern und Zeiten', () => {
  const list = [
    att({ timeMs: 19000 }), wrong('nullen', { timeMs: 19000 }), wrong('nullen', { timeMs: 19000 }), wrong('nullen', { timeMs: 19000 }),
    wrong('knapp', { timeMs: 19000 }), att({ timeMs: 19000 }),
    // anderer Subtyp: stark
    ...Array.from({ length: 5 }, () => att({ subtype: 'mult.2x1', category: 'mult', timeMs: 3000, targetMs: 5000 })),
  ];
  const f = focusOf(list);
  assert.equal(f.kind, 'focus');
  if (f.kind !== 'focus') return;
  assert.equal(f.focus.weakness.subtype, 'big.div');
  assert.equal(f.focus.weakness.reason, 'nullen');
  assert.equal(f.focus.errors, 4);
  assert.equal(f.focus.zeros, 3);
  assert.equal(f.focus.avgMs, 19000);
  assert.equal(f.focus.targetMs, 15000);
});

test('focusOf: zu wenig Daten vs. kein Schwachpunkt; deaktivierte Kategorien zählen nicht', () => {
  assert.deepEqual(focusOf([]), { kind: 'few' });
  assert.deepEqual(focusOf([att(), att()]), { kind: 'few' });
  assert.deepEqual(focusOf([att(), att(), att(), att()]), { kind: 'none' });
  const weak = [wrong('falsch'), wrong('falsch'), wrong('falsch')];
  assert.equal(focusOf(weak).kind, 'focus');
  assert.deepEqual(focusOf(weak, ['mult']), { kind: 'few' });
});

test('patternCounts: errorType plus „zu langsam“ für richtige, gemessene Antworten', () => {
  const list = [
    wrong('nullen'), wrong('nullen'), wrong('knapp'), wrong('falsch'), wrong('skip'),
    att({ timeMs: 20000 }), att({ timeMs: 20000, untimed: true }), att({ timeMs: 1000 }),
    wrong('falsch', { timeMs: 99000 }), // falsch und langsam zählt nur als falsch
  ];
  const r = patternCounts(list);
  assert.equal(r.n, 9);
  assert.deepEqual(r.counts, { nullen: 2, slow: 1, knapp: 1, falsch: 2, skip: 1 });
  // Fenster: nur die letzten n Aufgaben
  assert.deepEqual(patternCounts(list, 2).counts, { nullen: 0, slow: 0, knapp: 0, falsch: 1, skip: 0 });
  assert.deepEqual(patternCounts(null), { n: 0, counts: { nullen: 0, slow: 0, knapp: 0, falsch: 0, skip: 0 } });
});

test('recentErrors: neueste zuerst, begrenzt', () => {
  const a = wrong('falsch', { prompt: 'a' });
  const b = wrong('nullen', { prompt: 'b' });
  const c = wrong('knapp', { prompt: 'c' });
  assert.deepEqual(recentErrors([a, att(), b, att(), c], 2).map((x) => x.prompt), ['c', 'b']);
  assert.deepEqual(recentErrors([]), []);
});

test('relativeDay: heute, gestern, sonst null', () => {
  assert.equal(relativeDay(D(2026, 5, 10, 0), NOW), 'today');
  assert.equal(relativeDay(D(2026, 5, 9, 23), NOW), 'yesterday');
  assert.equal(relativeDay(D(2026, 5, 8), NOW), null);
  assert.equal(relativeDay(D(2026, 0, 1), D(2026, 0, 2)), 'yesterday');
});

test('firstLast und trendOf', () => {
  assert.deepEqual(firstLast([null, 4.8, null, 5.5, 6.1, null]), { first: 4.8, last: 6.1 });
  assert.equal(firstLast([null, 3, null]), null);
  assert.equal(firstLast([]), null);
  assert.equal(trendOf(4.8, 6.1), 'up');
  assert.equal(trendOf(6.1, 4.8), 'down');
  assert.equal(trendOf(5, 5.2), 'flat');
  assert.equal(trendOf(0, 0), 'flat');
});

test('rollingMean: gleitender Mittelwert, null-Tage zählen nicht', () => {
  assert.deepEqual(rollingMean([null, 2, null, 4, 6], 3), [null, 2, 2, 3, 5]);
  assert.deepEqual(rollingMean([null, null], 7), [null, null]);
  assert.deepEqual(rollingMean([1, 2, 3]), [1, 1.5, 2]);
});

test('dailyHistory: 7 Tage, neueste zuerst', () => {
  const res = { '2026-06-10': { n: 15, correct: 12, points: 1230, timeMs: 1, ts: 1 }, '2026-06-03': { n: 15, correct: 1, points: 1, timeMs: 1, ts: 1 } };
  const h = dailyHistory(res, NOW);
  assert.equal(h.length, 7);
  assert.equal(h[0]?.date, '2026-06-10');
  assert.equal(h[0]?.result?.correct, 12);
  assert.equal(h[6]?.date, '2026-06-04');
  assert.equal(h.filter((d) => d.result).length, 1);
});

test('fmtSec: ab 10 s ganzzahlig, sonst eine Stelle; beide Sprachen', () => {
  assert.equal(fmtSec(19300), '19 s');
  assert.equal(fmtSec(4500), '4,5 s');
  assert.equal(fmtSec(15000), '15 s');
  setLang('en');
  assert.equal(fmtSec(4500), '4.5 s');
});
