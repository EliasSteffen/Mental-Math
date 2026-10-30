import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, generateForMode, activeCategories, CATEGORIES } from '../src/core/generators/index.ts';
import { evaluate } from '../src/core/scoring.ts';
import { mkTask, asChoice } from './helpers.ts';
import type { Level } from '../src/types.ts';
import { validateExplainRequest, buildPrompt } from '../server/explain.ts';

test('Prozente: Dezimalschreibweise zählt (0,15 = 15 %)', () => {
  const t = mkTask({ subtype: 'pct.of', unit: '%', expected: 15, tolerance: { abs: 0.01, rel: 0 }, targetMs: 10000, weight: 1 });
  assert.equal(evaluate(t, 15, 1000).correct, true);
  assert.equal(evaluate(t, 0.15, 1000).correct, true);
  assert.equal(evaluate(t, 1.5, 1000).correct, false);
});

test('Auswahl-Aufgaben: Index-Vergleich, Fehler immer „falsch“', () => {
  for (const id of ['units.dimless', 'units.result']) {
    for (let i = 0; i < 100; i++) {
      const t = asChoice(generate(id));
      assert.equal(t.kind, 'choice');
      assert.equal(t.choices.length, 4);
      assert.equal(new Set(t.choices).size, 4, `doppelte Optionen: ${t.choices}`);
      assert.equal(evaluate(t, t.expected, 1000).correct, true);
      const wrong = evaluate(t, (t.expected + 1) % 4, 1000);
      assert.equal(wrong.correct, false);
      assert.equal(wrong.errorType, 'falsch');
      assert.equal(evaluate(t, null, 1000).errorType, 'skip');
    }
  }
});

test('units.convert: wie im Hinweis gerundete Antwort wird akzeptiert', () => {
  for (const level of [1, 2, 3] as Level[]) {
    for (let i = 0; i < 500; i++) {
      const t = generate('units.convert', Math.random, { level });
      const m = t.hint.match(/auf (\d) Nachkommastelle/);
      const d = m ? Number(m[1]) : 0;
      const rounded = Math.round(t.expected * 10 ** d) / 10 ** d;
      assert.equal(evaluate(t, rounded, 1000).correct, true, `${t.prompt} → ${t.expected} (${t.hint})`);
    }
  }
});

test('Kategorienauswahl filtert Modi', () => {
  assert.equal(activeCategories(null).length, CATEGORIES.filter((c) => !c.hidden).length);
  assert.deepEqual(activeCategories(['units', 'mag']).map((c) => c.id), ['units', 'mag']);
  for (let i = 0; i < 200; i++) {
    assert.equal(generateForMode('all', { enabledCategories: ['mag'] }).category, 'mag');
  }
});

test('KI-Prompt bei Auswahl-Aufgaben enthält Optionen und gewählte Antwort als Text', () => {
  const t = asChoice(generate('units.dimless'));
  const given = (t.expected + 1) % 4;
  const v = validateExplainRequest({ kind: 'task', subtype: t.subtype, prompt: t.prompt, params: t.params, expected: t.expected, unit: '', given });
  assert.equal(v.ok, true);
  assert.ok(v.ok);
  const p = buildPrompt(v.value);
  for (const o of t.choices) assert.ok(p.user.includes(o), `Option fehlt: ${o}`);
  assert.ok(p.user.includes(t.choices[given] ?? ''));
});
