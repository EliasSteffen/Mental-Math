// Adaptive Schwierigkeit (src/core/adaptive.ts): Treppe je Typ, Vorstufe „Grundlagen“, Einstieg, Empfehlung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Attempt } from '../src/types.ts';
import {
  BASIS, BASIS_SHARE, HAS_BASIC, adaptiveStep, outcome, planTask, shakyFoundation, stepFromOutcomes,
} from '../src/core/adaptive.ts';
import type { Outcome } from '../src/core/adaptive.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import { generate, generateForMode } from '../src/core/generators/index.ts';
import { recommendation } from '../src/core/progress.ts';

const att = (subtype: string, correct: boolean, o: Partial<Attempt> = {}): Attempt => ({
  ts: 0, sessionId: 's', mode: 'all', prompt: '', unit: '', expected: 0, given: correct ? 0 : 1, weight: 1,
  category: subtype.split('.')[0] as Attempt['category'], subtype, correct, errorType: correct ? null : 'falsch',
  timeMs: 3000, targetMs: 10000, points: correct ? 100 : 0, ...o,
});
const many = (subtype: string, n: number, correct: boolean): Attempt[] => Array.from({ length: n }, () => att(subtype, correct));
const G: Outcome = 'good';
const B: Outcome = 'bad';
const N: Outcome = 'neutral';
const seq = (...xs: number[]): () => number => { let i = 0; return () => xs[i++ % xs.length] ?? 0; };

test('outcome: richtig+zügig = sicher, falsch = Fehler, langsam oder mit Hilfe = neutral, Schätzen zählt nicht', () => {
  assert.equal(outcome(att('pct.of', true)), 'good');
  assert.equal(outcome(att('pct.of', false)), 'bad');
  assert.equal(outcome(att('pct.of', false, { given: null, errorType: 'skip' })), 'bad');
  assert.equal(outcome(att('pct.of', true, { timeMs: 16000 })), 'neutral');
  assert.equal(outcome(att('pct.of', true, { timeMs: 16000, untimed: true })), 'good');
  assert.equal(outcome(att('pct.of', true, { assisted: true })), 'neutral');
  assert.equal(outcome(att('pct.of', true, { estimate: true })), null);
});

test('Treppe: 3 sichere Treffer hoch, 2 Fehler unter den letzten 4 runter, Grenzen 0 und 3', () => {
  assert.equal(stepFromOutcomes([]), 1);
  assert.equal(stepFromOutcomes([G, G]), 1);
  assert.equal(stepFromOutcomes([G, G, G]), 2);
  assert.equal(stepFromOutcomes([G, G, B, G]), 1, 'Fehler unterbricht die Serie');
  assert.equal(stepFromOutcomes([G, N, G, N, G]), 2, 'neutral zählt nicht');
  assert.equal(stepFromOutcomes(Array(20).fill(G)), 3);
  assert.equal(stepFromOutcomes([B, B]), 0);
  assert.equal(stepFromOutcomes([B, G, B]), 0);
  assert.equal(stepFromOutcomes([B, G, G, G, B]), 2, 'nach dem Aufstieg zählen alte Fehler nicht mehr');
  assert.equal(stepFromOutcomes(Array(20).fill(B)), 0);
  assert.equal(stepFromOutcomes([B, B, G, G, G]), 1, 'aus der Vorstufe wieder heraus');
});

test('adaptiveStep: nur Antworten dieses Typs, chronologisch', () => {
  const list = [...many('pct.of', 3, true), ...many('mult.2x1', 4, false), att('pct.of', true)];
  assert.equal(adaptiveStep('pct.of', list), 2);
  assert.equal(adaptiveStep('mult.2x1', list), 0);
  assert.equal(adaptiveStep('table.mul', list), 1);
});

test('BASIS: nur bekannte Typen, keine Kreise, jede Kette endet beim kleinen 1×1 oder ohne Grundlage', () => {
  for (const [id, basis] of Object.entries(BASIS)) {
    assert.ok(SUBTYPES[id], id);
    assert.ok(SUBTYPES[basis], basis);
    const seen = new Set([id]);
    let cur: string | undefined = basis;
    while (cur) {
      assert.ok(!seen.has(cur), `Kreis bei ${id}`);
      seen.add(cur);
      cur = BASIS[cur];
    }
  }
  for (const id of HAS_BASIC) assert.ok(SUBTYPES[id], id);
});

test('planTask: Stufe 1–3 = der Typ selbst', () => {
  assert.deepEqual(planTask('pct.of', []), { subtype: 'pct.of', level: 1, basic: false, foundationFor: null });
  assert.deepEqual(planTask('pct.of', many('pct.of', 3, true)), { subtype: 'pct.of', level: 2, basic: false, foundationFor: null });
});

test('planTask: Vorstufe → meist die Grundlage, bis hinunter zum Einstiegs-1×1; sonst der Typ auf Leicht', () => {
  const hist = [...many('mult.2x2', 2, false)];
  // Grundlage mult.2x1 ungeübt (Leicht) → wackelt → wird geübt
  assert.deepEqual(planTask('mult.2x2', hist, seq(0)), { subtype: 'mult.2x1', level: 1, basic: false, foundationFor: 'mult.2x2' });
  // Zufall über BASIS_SHARE → der Typ selbst auf Leicht (damit er wieder aufsteigen kann)
  assert.deepEqual(planTask('mult.2x2', hist, seq(BASIS_SHARE + 0.01)), { subtype: 'mult.2x2', level: 1, basic: false, foundationFor: null });
  // Kette: auch mult.2x1 und das 1×1 auf der Vorstufe → Einstiegs-1×1, Hinweis für den ursprünglichen Typ
  const deep = [...hist, ...many('mult.2x1', 2, false), ...many('table.mul', 2, false)];
  assert.deepEqual(planTask('mult.2x2', deep, seq(0)), { subtype: 'table.mul', level: 1, basic: true, foundationFor: 'mult.2x2' });
  // Grundlage sicher (Stufe ≥ 2) → keine Grundlage, der Typ auf Leicht
  const solid = [...hist, ...many('mult.2x1', 3, true)];
  assert.deepEqual(planTask('mult.2x2', solid, seq(0)), { subtype: 'mult.2x2', level: 1, basic: false, foundationFor: null });
  // Kleines 1×1 selbst auf der Vorstufe: Einstieg
  assert.deepEqual(planTask('table.mul', many('table.mul', 2, false), seq(0)), { subtype: 'table.mul', level: 1, basic: true, foundationFor: null });
});

test('Einstieg: 1×1 nur mit ×2, ×5, ×10; 2-stellig × 1-stellig klein; zählt weniger Punkte', () => {
  for (let i = 0; i < 200; i++) {
    const t = generate('table.mul', Math.random, { level: 1, basic: true });
    const { a, b } = t.params as { a: number; b: number };
    assert.ok([2, 5, 10].includes(a) || [2, 5, 10].includes(b), `${a} × ${b}`);
    assert.ok(a <= 10 && b <= 10);
    assert.equal(t.basic, true);
    const d = generate('table.div', Math.random, { level: 1, basic: true });
    assert.equal(d.expected * Number(d.params.a), Number(d.params.n));
    const m = generate('mult.2x1', Math.random, { level: 1, basic: true });
    assert.ok(Number(m.params.a) <= 25 && Number(m.params.b) <= 5);
  }
  assert.ok(generate('table.mul', Math.random, { level: 1, basic: true }).weight < generate('table.mul', Math.random, { level: 1 }).weight);
  // Ohne eigenen Einstieg oder auf höherer Stufe bleibt alles wie gehabt
  assert.equal(generate('pct.of', Math.random, { level: 1, basic: true }).basic, undefined);
  assert.equal(generate('table.mul', Math.random, { level: 2, basic: true }).basic, undefined);
});

test('generateForMode mit plan: Grundlage und Einstieg landen in der Aufgabe', () => {
  const t = generateForMode('mult', { plan: () => ({ subtype: 'table.mul', level: 1, basic: true, foundationFor: 'mult.2x1' }) });
  assert.equal(t.subtype, 'table.mul');
  assert.equal(t.basic, true);
  assert.equal(t.foundationFor, 'mult.2x1');
  assert.equal(t.mode, 'mult');
  const same = generateForMode('pct.of', { plan: (id) => ({ subtype: id, level: 3, basic: false, foundationFor: null }) });
  assert.equal(same.level, 3);
  assert.equal(same.foundationFor, undefined);
});

test('Empfehlung: Schwäche auf der Vorstufe mit nachweislich wackliger Grundlage → Grundlage zuerst', () => {
  const struggling = [...many('mult.2x1', 4, false), att('mult.2x1', true)];
  // Ungeübtes 1×1 ist kein Beleg: Empfehlung bleibt die Schwäche selbst (in der Runde kommt das 1×1 trotzdem dazwischen)
  assert.equal(shakyFoundation('mult.2x1', struggling), null);
  assert.equal(recommendation(struggling, {}, 0).subtype, 'mult.2x1');
  // 1×1 mit Fehlern (aber besser als 2×1, sonst wäre es selbst die größte Schwäche) → 1×1 zuerst
  const tableShaky = [att('table.mul', false), att('table.mul', true), att('table.mul', false), ...struggling];
  const rec = recommendation(tableShaky, {}, 0);
  assert.equal(rec.subtype, 'table.mul');
  assert.match(rec.reason, /Grundlage zuerst/);
  // Mit sicherem 1×1 bleibt die Schwäche selbst die Empfehlung
  const withTable = [...many('table.mul', 6, true), ...struggling];
  assert.equal(shakyFoundation('mult.2x1', withTable), null);
  assert.equal(recommendation(withTable, {}, 0).subtype, 'mult.2x1');
  // Kette: Prozente wackeln, 2×1 auf der Vorstufe, 1×1 auch → beim 1×1 anfangen
  const chain = [...many('pct.of', 4, false), att('pct.of', true), ...many('mult.2x1', 3, false), ...many('table.mul', 3, false)];
  assert.equal(shakyFoundation('pct.of', chain), 'table.mul');
  // 2×1 wackelt, 1×1 ungeübt → bei 2×1 anfangen
  assert.equal(shakyFoundation('pct.of', chain.filter((a) => a.subtype !== 'table.mul')), 'mult.2x1');
});
