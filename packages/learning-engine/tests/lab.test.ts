import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auc, baseRate, cartesian, catalogFromObservations, detectionScore, elo, gridSearch, loadObservations, mulberry32, pick,
  probabilityScore, randomLearner, answer, replay, simulateDetection, simulatePolicy, syntheticCatalog, trainTestSplit, trueP,
  tuneDetection, windowAccuracy,
} from '../src/lab/index.ts';
import type { Observation } from '../src/index.ts';

const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/* ---------- Bausteine ---------- */

test('Zufall: gleicher Seed → gleiche Folge', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('Kennzahlen: Precision/Recall/F1, AUC, Brier, Log-Loss, Kalibrierung', () => {
  const d = detectionScore({ tp: 6, fp: 2, fn: 4 });
  near(d.precision, 0.75);
  near(d.recall, 0.6);
  near(d.f1, (2 * 0.75 * 0.6) / 1.35);
  assert.deepEqual(detectionScore({ tp: 0, fp: 0, fn: 0 }).f1, 1);
  assert.equal(auc([{ p: 0.9, y: 1 }, { p: 0.1, y: 0 }]), 1);
  assert.equal(auc([{ p: 0.1, y: 1 }, { p: 0.9, y: 0 }]), 0);
  assert.equal(auc([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.5);
  assert.equal(auc([{ p: 0.5, y: 1 }]), null);
  const s = probabilityScore([{ p: 0.8, y: 1 }, { p: 0.8, y: 0 }]);
  near(s.brier, (0.04 + 0.64) / 2);
  near(s.logLoss, -(Math.log(0.8) + Math.log(0.2)) / 2);
  assert.deepEqual(s.calibration.map((b) => [b.n, b.rate]), [[2, 0.5]]);
});

test('Raster: alle Kombinationen, beste zuerst', () => {
  assert.equal(cartesian({ a: [1, 2, 3], b: ['x', 'y'] }).length, 6);
  const r = gridSearch({ a: [1, 2, 3], b: [10, 20] }, ({ a, b }) => -((a - 2) ** 2) - b);
  assert.deepEqual(r[0]?.params, { a: 2, b: 10 });
  assert.deepEqual(gridSearch({ a: [1, 2, 3] }, ({ a }) => a, { minimize: true })[0]?.params, { a: 1 });
});

test('Export laden: v3-Export oder Liste, unvollständige verworfen, zeitlich sortiert, Katalog ableiten', () => {
  const ok = { ts: 2, subtype: 'pct.of', category: 'pct', correct: true, timeMs: 5000, targetMs: 10000, errorType: null, level: 2 as const };
  const { observations, skipped } = loadObservations({ version: 3, attempts: [ok, { ...ok, ts: 1, errorType: 'quatsch' }, { ts: 3 }, null] });
  assert.equal(skipped, 2);
  assert.deepEqual(observations.map((o) => o.ts), [1, 2]);
  assert.equal(observations[0]!.errorType, null);
  assert.equal(observations[1]!.level, 2);
  assert.equal(loadObservations([ok]).observations.length, 1);
  assert.equal(loadObservations('kaputt').observations.length, 0);
  assert.deepEqual(catalogFromObservations([...observations, { ...ok, subtype: 'div.round', category: 'div', targetMs: 15000 }]), {
    'pct.of': { category: 'pct', targetMs: 10000 },
    'div.round': { category: 'div', targetMs: 15000 },
  });
});

test('Lernende: eingepflanzte Schwächen, Antworten passen zur Wahrheit, Lernen hebt das Können', () => {
  const cat = syntheticCatalog({ categories: 2, perCategory: 3 });
  const rng = mulberry32(3);
  const p = randomLearner(rng, cat, 0, { deficits: 2, reasons: ['ungenau'], learningRate: 0.2 });
  assert.equal(Object.keys(p.injected).length, 2);
  const weak = Object.keys(p.injected)[0]!;
  const strong = Object.keys(cat).find((s) => !p.injected[s])!;
  assert.ok(trueP(p, weak) < 0.75 && trueP(p, strong) > 0.8);
  const before = trueP(p, weak);
  const answers = Array.from({ length: 50 }, (_, i) => answer(p, weak, 2, i * 1000, rng));
  assert.ok(trueP(p, weak) > before, 'üben verbessert');
  assert.ok(answers.every((o) => o.subtype === weak && o.category === cat[weak]!.category && o.targetMs === 10_000));
  assert.ok(answers.filter((o) => !o.correct).every((o) => o.errorType !== null));
});

test('Simulation ist reproduzierbar', () => {
  assert.deepEqual(simulateDetection({ learners: 5, checkpoints: [5] }), simulateDetection({ learners: 5, checkpoints: [5] }));
  assert.deepEqual(simulatePolicy({ policy: 'recommended', learners: 3, days: 3 }), simulatePolicy({ policy: 'recommended', learners: 3, days: 3 }));
});

/* ---------- Qualitäts-Schranken ----------
   Halten fest, was das heutige Modell in der Simulation mindestens leistet (Werte mit Abstand unter dem Ist-Stand,
   siehe `npm run lab -w learning-engine`). Wer das Modell ändert, darf sie verbessern, aber nicht unterschreiten. */

test('Schranke Erkennung: findet die meisten Schwächen, Diagnose meist richtig, mehr Daten helfen', () => {
  const r = simulateDetection({ learners: 40, checkpoints: [5, 15] });
  const [early, later] = r.checkpoints;
  assert.ok(early && later);
  assert.ok(later.overall.recall >= 0.75, `Recall ${later.overall.recall}`);
  assert.ok(later.overall.f1 >= 0.6, `F1 ${later.overall.f1}`);
  assert.ok(later.reasonAccuracy >= 0.85, `Diagnose ${later.reasonAccuracy}`);
  assert.ok(later.top3Precision >= 0.6, `Top-3 ${later.top3Precision}`);
  assert.ok(later.recallByReason.langsam >= 0.9 && later.recallByReason.ungenau >= 0.8);
  assert.ok(later.overall.recall > early.overall.recall);
});

test('Schranke Strategie: Empfehlungen und Schwächen-Modus bauen Schwächen schneller ab als gemischtes Üben', () => {
  const opts = { learners: 25, days: 14 };
  const mixed = simulatePolicy({ policy: 'mixed', ...opts });
  const rec = simulatePolicy({ policy: 'recommended', ...opts });
  const weak = simulatePolicy({ policy: 'weak-mode', ...opts });
  assert.ok(rec.deficitScoreAfter > mixed.deficitScoreAfter + 3, `${rec.deficitScoreAfter} vs ${mixed.deficitScoreAfter}`);
  assert.ok(weak.stillDeficient < mixed.stillDeficient - 0.3, `${weak.stillDeficient} vs ${mixed.stillDeficient}`);
  assert.ok(rec.deficitPracticeShare > mixed.deficitPracticeShare);
});

test('Schranke Vorhersage: Modelle je Aufgabentyp trennen besser als die Gesamtquote', () => {
  const cat = syntheticCatalog();
  const ids = Object.keys(cat);
  const rng = mulberry32(11);
  const p = randomLearner(rng, cat, 0, { deficits: 8 });
  const obs: Observation[] = Array.from({ length: 3000 }, (_, i) => answer(p, pick(rng, ids), 2, i * 1_800_000, rng));
  const s = trainTestSplit(obs, [baseRate(), windowAccuracy(), elo({ k: 0.3 })]);
  const [base, win, el] = s.test;
  assert.ok(base && win && el);
  assert.ok((win.auc ?? 0) > 0.6 && (el.auc ?? 0) > 0.65, `AUC window ${win.auc}, elo ${el.auc}`);
  assert.ok(el.logLoss < base.logLoss && win.brier < base.brier);
  // Replay bewertet nur ab `from`, lernt aber von Anfang an
  assert.equal(replay(obs, baseRate(), { from: 2900 }).n, 100);
});

test('Tuning: liefert sortierte, gültige Kombinationen (ungültige fallen weg)', () => {
  const res = tuneDetection({ window: [10, 25], level2Score: [60, 95] }, { learners: 8, checkpoint: 5 });
  assert.equal(res.length, 2); // level2Score 95 > level3Score 85 ist ungültig
  assert.ok(res[0]!.value >= res[1]!.value);
});
