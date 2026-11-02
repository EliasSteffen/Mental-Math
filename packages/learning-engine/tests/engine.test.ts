import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG, resolveConfig, skillStats, statsBy, overallStats, levelFromScore, adaptiveLevel, findDeficits, errorPatterns,
  recordResult, dueReviews, nextDue, nextStep, roundInsight, DAY_MS,
} from '../src/index.ts';
import type { Catalog, ErrorType, Observation } from '../src/index.ts';

const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const obs = (o: Partial<Observation> = {}): Observation => ({
  ts: 0, subtype: 'pct.of', category: 'pct', correct: true, errorType: null, timeMs: 5000, targetMs: 10000, ...o,
});
const CATALOG: Catalog = {
  'pct.of': { category: 'pct', targetMs: 10000 },
  'pct.change': { category: 'pct', targetMs: 10000 },
  'mult.2x2': { category: 'mult', targetMs: 20000 },
  'mult.2x1': { category: 'mult', targetMs: 5000 },
  'div.round': { category: 'div', targetMs: 15000 },
  'frac.of': { category: 'frac', targetMs: 10000 },
  'biz.roi': { category: 'biz', targetMs: 10000 },
};
const T0 = new Date(2026, 5, 10, 12).getTime();

test('config: Standardwerte = Verhalten der App, Prüfung der Wertebereiche', () => {
  assert.equal(DEFAULT_CONFIG.window, 25);
  assert.deepEqual([...DEFAULT_CONFIG.reviewIntervalsDays], [1, 2, 4, 7, 14]);
  assert.deepEqual(resolveConfig(), { ...DEFAULT_CONFIG });
  assert.equal(resolveConfig({ window: 10 }).window, 10);
  assert.throws(() => resolveConfig({ window: 0 }), RangeError);
  assert.throws(() => resolveConfig({ accuracyWeight: 0.8 }), RangeError); // Summe ≠ 1
  assert.doesNotThrow(() => resolveConfig({ accuracyWeight: 0.8, speedWeight: 0.2 }));
  assert.throws(() => resolveConfig({ level2Score: 90 }), RangeError);
  assert.throws(() => resolveConfig({ reviewIntervalsDays: [] }), RangeError);
});

test('skillStats: Genauigkeit, Tempo, Score, Fenster', () => {
  assert.equal(skillStats([obs(), obs()]).score, null);
  const s = skillStats([obs(), obs(), obs(), obs({ correct: false, errorType: 'falsch', timeMs: 20000 })]);
  near(s.accuracy, 0.75);
  near(s.speed, 1);
  assert.equal(s.score, Math.round(100 * (0.7 * 0.75 + 0.3)));
  near(s.avgTimeMs, 8750);
  assert.equal(skillStats([obs({ correct: false }), obs({ correct: false }), obs({ correct: false })]).speed, 0);
  const many = [...Array.from({ length: 30 }, () => obs({ correct: false })), ...Array.from({ length: 25 }, () => obs())];
  assert.equal(skillStats(many).accuracy, 1);
  assert.equal(skillStats(many).n, 25);
  // Hilfe zählt halb, ungemessene Antworten zählen nicht fürs Tempo
  near(skillStats([obs({ assisted: true }), obs(), obs({ correct: false }), obs({ assisted: true })]).accuracy, 0.5);
  near(skillStats([obs({ untimed: true, timeMs: 1e6 }), obs({ timeMs: 20000 }), obs({ timeMs: 20000 })]).speed, 0.5);
  // eigenes Fenster und eigene Gewichte
  assert.equal(skillStats(many, resolveConfig({ window: 40 })).n, 40);
  assert.equal(skillStats([obs(), obs(), obs()], resolveConfig({ accuracyWeight: 1, speedWeight: 0 })).score, 100);
});

test('statsBy, overallStats', () => {
  const st = statsBy([obs(), obs({ subtype: 'mult.2x1', category: 'mult' })], 'category', ['pct', 'mult', 'div']);
  assert.deepEqual(Object.keys(st), ['pct', 'mult', 'div']);
  assert.equal(st.pct!.n, 1);
  assert.equal(st.div!.n, 0);
  assert.equal(overallStats(Array.from({ length: 120 }, () => obs())).n, 100);
});

test('Stufe: Schwellen 60/85, ohne Score Stufe 1', () => {
  assert.equal(levelFromScore(null), 1);
  assert.equal(levelFromScore(59), 1);
  assert.equal(levelFromScore(60), 2);
  assert.equal(levelFromScore(85), 3);
  const good = Array.from({ length: 5 }, () => obs());
  assert.equal(adaptiveLevel('pct.of', good), 3);
  assert.equal(adaptiveLevel('pct.change', good), 1);
});

test('findDeficits: Diagnose, Reihenfolge, Filter', () => {
  const bad = (subtype: string, errs: ErrorType[]): Observation[] => Array.from({ length: 5 }, (_, i) => obs({
    subtype, category: CATALOG[subtype]?.category ?? 'x', correct: false, errorType: errs[i] ?? 'falsch',
  }));
  const list = [
    ...bad('mult.2x2', ['nullen', 'nullen']),
    ...bad('div.round', []),
    ...Array.from({ length: 5 }, () => obs({ subtype: 'pct.change', timeMs: 30000 })),
    ...Array.from({ length: 5 }, () => obs({ subtype: 'frac.of', category: 'frac' })),
    obs({ subtype: 'biz.roi', category: 'biz', correct: false }),
    ...bad('unknown.type', []),
  ];
  const d = findDeficits(list, { catalog: CATALOG, limit: 5 });
  assert.deepEqual(d.map((x) => [x.subtype, x.reason]), [['mult.2x2', 'nullen'], ['div.round', 'ungenau'], ['pct.change', 'langsam']]);
  assert.equal(d[0]!.targetMs, 20000);
  assert.equal(findDeficits(list, { catalog: CATALOG }).length, 3);
  assert.equal(findDeficits(list, { catalog: CATALOG, limit: 1 }).length, 1);
  assert.deepEqual(findDeficits(list, { catalog: CATALOG, categories: new Set(['pct']) }).map((x) => x.subtype), ['pct.change']);
  // strengere Schwelle für Nullen-Fehler
  assert.equal(findDeficits(list, { catalog: CATALOG }, resolveConfig({ zeroErrorMin: 3 }))[0]!.reason, 'ungenau');
});

test('errorPatterns', () => {
  const list = [obs(), obs({ errorType: 'nullen' }), obs({ errorType: 'nullen' }), obs({ errorType: 'knapp' }), obs({ errorType: 'skip' })];
  assert.deepEqual(errorPatterns(list), { nullen: 2, knapp: 1, falsch: 0, skip: 1 });
});

test('Leitner: anlegen, aufsteigen, gemeistert, zurücksetzen', () => {
  assert.deepEqual(recordResult({}, { subtype: 'a', correct: true, ts: T0 }), {});
  let r = recordResult({}, { subtype: 'a', correct: false, ts: T0 });
  assert.deepEqual(r, { a: { box: 0, dueAt: T0 + DAY_MS, lastTs: T0 } });
  let ts = T0;
  [2, 4, 7, 14].forEach((d, i) => {
    ts += DAY_MS;
    r = recordResult(r, { subtype: 'a', correct: true, ts, isReview: true });
    assert.equal(r.a?.box, i + 1);
    assert.equal(r.a?.dueAt, ts + d * DAY_MS);
  });
  assert.deepEqual(recordResult(r, { subtype: 'a', correct: true, ts: ts + 14 * DAY_MS, isReview: true }), {});
  assert.equal(recordResult(r, { subtype: 'a', correct: false, ts, isReview: true }).a?.box, 0);
  // eigene Intervalle: nach Box 1 gemeistert
  const cfg = resolveConfig({ reviewIntervalsDays: [1, 3] });
  const r1 = recordResult({ a: { box: 0, dueAt: T0, lastTs: T0 } }, { subtype: 'a', correct: true, ts: T0, isReview: true }, cfg);
  assert.equal(r1.a?.dueAt, T0 + 3 * DAY_MS);
  assert.deepEqual(recordResult(r1, { subtype: 'a', correct: true, ts: T0, isReview: true }, cfg), {});
});

test('dueReviews, nextDue', () => {
  const r = { a: { box: 0, dueAt: T0 + 2 * DAY_MS, lastTs: 0 }, b: { box: 1, dueAt: T0 - DAY_MS, lastTs: 0 }, c: { box: 2, dueAt: T0, lastTs: 0 } };
  assert.deepEqual(dueReviews(r, T0 + 2 * DAY_MS).map((x) => x.subtype), ['b', 'c', 'a']);
  assert.equal(nextDue(r), T0 - DAY_MS);
  assert.equal(nextDue({}), null);
});

test('nextStep: Wiederholung > Schwäche > Neues > gemischt', () => {
  const opts = { catalog: CATALOG, categories: new Set(['pct', 'mult']), newCategories: ['pct', 'mult'] };
  const due = { 'mult.2x2': { box: 0, dueAt: T0 - 1, lastTs: 0 }, 'div.round': { box: 0, dueAt: T0 - 1, lastTs: 0 } };
  const step = nextStep([], due, T0, opts);
  assert.equal(step.kind, 'review');
  assert.deepEqual(step.kind === 'review' ? step.due.map((d) => d.subtype) : [], ['mult.2x2']); // div ist nicht aktiv
  const weak = Array.from({ length: 4 }, () => obs({ correct: false }));
  const w = nextStep(weak, {}, T0, opts);
  assert.equal(w.kind === 'weak' ? w.deficit.subtype : null, 'pct.of');
  const fine = Array.from({ length: 4 }, () => obs());
  assert.deepEqual(nextStep(fine, {}, T0, opts), { kind: 'new', subtype: 'pct.change' });
  const all = Object.keys(CATALOG).flatMap((subtype) => Array.from({ length: 3 }, () => obs({ subtype, category: CATALOG[subtype]!.category })));
  assert.deepEqual(nextStep(all, {}, T0, opts), { kind: 'mixed' });
});

test('roundInsight: ab 2 Fehlern, häufigste Art, häufigster Typ', () => {
  const r = (subtype: string, errorType: ErrorType | null) => ({ subtype, correct: errorType === null, errorType });
  assert.equal(roundInsight([r('a', null), r('b', 'nullen')]), null);
  assert.deepEqual(roundInsight([r('a', 'nullen'), r('b', 'falsch'), r('b', 'nullen'), r('c', null)]), { type: 'nullen', count: 2, subtype: 'a' });
  assert.deepEqual(roundInsight([r('x', 'falsch'), r('y', 'falsch'), r('y', 'falsch'), r('z', 'skip')]), { type: 'falsch', count: 3, subtype: 'y' });
});
