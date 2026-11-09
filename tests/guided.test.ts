// Geführter Lernmodus: strukturierte Schritte (core/solutions/guided.ts) – Zwischenwerte führen zum Ergebnis der Aufgabe.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../src/core/generators/index.ts';
import { GUIDED_SUBTYPES, exprText, guidedSteps, hasGuided, stepCorrect } from '../src/core/solutions/guided.ts';
import type { GuidedStep, Visual } from '../src/core/solutions/guided.ts';
import { setLang } from '../src/i18n/index.ts';
import { mkTask } from './helpers.ts';
import type { Task } from '../src/types.ts';

afterEach(() => setLang('de'));

const EXPECTED_SUBTYPES = [
  'tricks.x11', 'tricks.square5', 'tricks.near100', 'tricks.diffsq', 'tricks.pctswap',
  'mult.2x1', 'pct.change', 'frac.topct', 'big.mult',
];
const BAD = ['NaN', 'undefined', 'Infinity', '[object', '{'];

/** Alle Zahlen einer Grafik (für den Endlichkeits-Check). */
function visualNumbers(v: Visual): number[] {
  switch (v.kind) {
    case 'area': return [...v.parts, v.factor, v.shown];
    case 'digits': return [v.cells.length];
    case 'line': return [v.min, v.max, ...v.ticks.map((k) => k.v), ...v.spans.flatMap((s) => [s.from, s.to])];
    case 'bar': return [v.parts, v.filled, v.extra ?? 0, v.cut ?? 0];
    case 'places': return v.rows.map((r) => r.zeros);
  }
}

function visualTexts(v: Visual): string[] {
  switch (v.kind) {
    case 'digits': return v.cells.flatMap((c) => [c.v, c.note ?? '']);
    case 'line': return [...v.ticks.map((k) => k.label), ...v.spans.map((s) => s.label)];
    case 'bar': return [v.whole, v.part ?? '', v.delta ?? ''];
    case 'places': return v.rows.flatMap((r) => [r.label, r.digits, r.unit ?? '']);
    default: return [];
  }
}

function checkSteps(task: Task, steps: GuidedStep[]): void {
  const ctx = `${task.prompt} → ${JSON.stringify(steps.map((s) => [s.text, exprText(s.expr), s.expected]))}`;
  assert.ok(steps.length >= 2 && steps.length <= 7, `Schrittzahl ${steps.length}: ${ctx}`);
  // Erster Schritt erklärt nur (mit Grafik) – „Gemeinsam“ zeigt sie, bevor die erste Frage kommt
  assert.equal(steps[0]?.expected, undefined, `erster Schritt ohne Eingabe: ${ctx}`);
  assert.ok(steps[0]?.visual, `erster Schritt mit Grafik: ${ctx}`);
  const asked = steps.filter((s) => s.expected !== undefined);
  assert.ok(asked.length >= 1, `mindestens ein Zwischenschritt zum Eintippen: ${ctx}`);
  for (const s of steps) {
    assert.ok(s.text.trim().length > 0, ctx);
    const texts = [s.text, exprText(s.expr), s.hint ?? '', s.unit ?? '', ...(s.visual ? visualTexts(s.visual) : [])];
    for (const x of texts) for (const bad of BAD) assert.ok(!x.includes(bad), `${bad} in „${x}“: ${ctx}`);
    if (s.expected !== undefined) {
      assert.ok(Number.isFinite(s.expected), `Zwischenwert endlich: ${ctx}`);
      assert.ok(s.hint && s.hint.trim().length > 0, `Hinweis für jeden Eingabe-Schritt: ${ctx}`);
      assert.ok(s.expr && s.expr.length > 0, `Rechnung für jeden Eingabe-Schritt: ${ctx}`);
      assert.ok(stepCorrect(s, s.expected), `eigener Wert gilt als richtig: ${ctx}`);
      assert.ok(!stepCorrect(s, s.expected + 1 + (s.tolerance ?? 0)), `falscher Wert gilt als falsch: ${ctx}`);
    }
    if (s.visual) for (const n of visualNumbers(s.visual)) assert.ok(Number.isFinite(n), `Grafik endlich: ${ctx}`);
  }
  // Letzter Schritt liefert das Endergebnis – aus den Zwischenwerten gerechnet, muss zu task.expected passen
  const last = steps[steps.length - 1];
  assert.notEqual(last?.expected, undefined, `letzter Schritt mit Ergebnis: ${ctx}`);
  const tol = Math.max(task.tolerance.abs, task.tolerance.rel * Math.abs(task.expected), 1e-6);
  assert.ok(Math.abs((last?.expected ?? NaN) - task.expected) <= tol, `Endergebnis ${last?.expected} ≠ ${task.expected}: ${ctx}`);
}

test('geführte Aufgabentypen: genau die vorgesehenen', () => {
  assert.deepEqual([...GUIDED_SUBTYPES].sort(), [...EXPECTED_SUBTYPES].sort());
  for (const id of EXPECTED_SUBTYPES) assert.ok(hasGuided(id), id);
  assert.equal(hasGuided('pct.of'), false);
  assert.equal(hasGuided('constructor'), false);
});

for (const id of EXPECTED_SUBTYPES) {
  test(`guidedSteps(${id}): Zwischenwerte ergeben task.expected (alle Stufen)`, () => {
    for (const level of [1, 2, 3] as const) {
      for (let i = 0; i < 150; i++) {
        const task = generate(id, Math.random, { level });
        checkSteps(task, guidedSteps(task));
      }
    }
  });
}

test('guidedSteps auf Englisch: ohne deutsche Reste, Ergebnis stimmt', () => {
  const german = /\b(und|oder|nicht|heißt|zerlegen|Probe|Rest|Ergebnis|Nullen|Ziffern|Stück|von|mal|Mio\.|Mrd\.|Tsd\.)(?![\p{L}])/u;
  setLang('en');
  for (const id of EXPECTED_SUBTYPES) {
    for (const level of [1, 2, 3] as const) {
      for (let i = 0; i < 40; i++) {
        const task = generate(id, Math.random, { level });
        const steps = guidedSteps(task);
        checkSteps(task, steps);
        for (const s of steps) {
          for (const x of [s.text, exprText(s.expr), s.hint ?? '', s.unit ?? '']) assert.ok(!german.test(x), `${id}: deutscher Rest in „${x}“`);
        }
      }
    }
  }
});

test('Beispiele: Zwischenwerte wie im Lehrbuch', () => {
  const values = (subtype: string, params: Record<string, number | string>, expected: number): Array<number | undefined> =>
    guidedSteps(mkTask({ subtype, params, expected })).map((s) => s.expected);
  // 53 × 11: Mitte 8, Ergebnis 583
  assert.deepEqual(values('tricks.x11', { n: 53 }, 583), [undefined, 8, 583]);
  // 57 × 11: Mitte 12 → Übertrag 6 | 2 | 7
  assert.deepEqual(values('tricks.x11', { n: 57 }, 627), [undefined, 12, 6, 627]);
  // 476 × 11: 4 | 11 | 13 | 6 → 5.236
  assert.deepEqual(values('tricks.x11', { n: 476 }, 5236), [undefined, 11, 13, 5236]);
  // 65² = 6 × 7 | 25
  assert.deepEqual(values('tricks.square5', { n: 65 }, 4225), [undefined, 42, 4225]);
  // 97 × 96: Abstände 3 und 4, 97 − 4 = 93, 3 × 4 = 12
  assert.deepEqual(values('tricks.near100', { a: 97, b: 96 }, 9312), [undefined, 3, 4, 93, 12, 9312]);
  // 93 × 93: nur ein Abstand (kein doppelter Schritt)
  assert.deepEqual(values('tricks.near100', { a: 93, b: 93 }, 8649), [undefined, 7, 86, 49, 8649]);
  // 47 × 53 = 50² − 3²
  assert.deepEqual(values('tricks.diffsq', { a: 47, b: 53, m: 50, d: 3 }, 2491), [undefined, 50, 3, 2500, 9, 2491]);
  // 24 % von 25 = 25 % von 24 = 24 ÷ 4
  assert.deepEqual(values('tricks.pctswap', { p: 24, y: 25 }, 6), [undefined, 4, 6]);
  // 47 × 6 = 40 × 6 + 7 × 6; 49 × 6 = 50 × 6 − 1 × 6; 347 × 6 = 300·6 + 40·6 + 7·6; 40 × 7 = 4 × 7 · 10
  assert.deepEqual(values('mult.2x1', { a: 47, b: 6 }, 282), [undefined, 240, 42, 282]);
  assert.deepEqual(values('mult.2x1', { a: 49, b: 6 }, 294), [undefined, 1, 300, 6, 294]);
  assert.deepEqual(values('mult.2x1', { a: 347, b: 6 }, 2082), [undefined, 1800, 240, 42, 2082]);
  assert.deepEqual(values('mult.2x1', { a: 40, b: 7 }, 280), [undefined, 28, 280]);
  // 40 → 45: Änderung 5, 10 % = 4, 1,25 Schritte → 12,5 %
  assert.deepEqual(values('pct.change', { alt: 40, neu: 45 }, 12.5), [undefined, 5, 4, 1.25, 12.5]);
  // 3/8 = 3 × 12,5 %; 5/6 = 100 % − 16,67 %; 1/4 = 25 %
  assert.deepEqual(values('frac.topct', { n: 3, d: 8 }, 37.5), [undefined, 12.5, 37.5]);
  assert.deepEqual(values('frac.topct', { n: 5, d: 6 }, 83.3333), [undefined, 16.666667, 83.333333]);
  assert.deepEqual(values('frac.topct', { n: 1, d: 4 }, 25), [undefined, 25]);
  // 3 Mio. × 40: Ziffern 12, Nullen 6 + 1 = 7, → 120 Mio.
  assert.deepEqual(values('big.mult', { m: 3, u: 'Mio.', b: 40, ua: 'Mio.' }, 120), [undefined, 12, 7, 120]);
});

test('Hervorhebungen: ×11 markiert die Ziffern, Rechnung als Text lesbar', () => {
  const steps = guidedSteps(mkTask({ subtype: 'tricks.x11', params: { n: 53 }, expected: 583 }));
  assert.deepEqual(steps[0]?.expr, [{ mark: '5' }, { mark: '3' }, ' × 11']);
  assert.equal(exprText(steps[1]?.expr), '5 + 3');
});

test('stepCorrect: Toleranz und Einheit', () => {
  const frac = guidedSteps(mkTask({ subtype: 'frac.topct', params: { n: 1, d: 3 }, expected: 33.3333, tolerance: { abs: 0.15, rel: 0 } }));
  const third = frac[1] as GuidedStep;
  assert.ok(stepCorrect(third, 33.3));
  assert.ok(stepCorrect(third, 33.33));
  assert.ok(!stepCorrect(third, 33));
  assert.ok(!stepCorrect(third, null));
  assert.ok(!stepCorrect(third, Number.NaN));
  const big = guidedSteps(mkTask({ subtype: 'big.mult', params: { m: 3, u: 'Mio.', b: 40, ua: 'Mio.' }, expected: 120 }));
  const last = big[big.length - 1] as GuidedStep;
  assert.ok(stepCorrect(last, 120));
  assert.ok(stepCorrect(last, 120_000_000), '„120 Mio.“ ausgeschrieben');
  assert.ok(!stepCorrect(last, 12));
  assert.ok(!stepCorrect({ text: 'nur Text' }, 1), 'Schritt ohne Ergebnis');
});

test('ohne geführten Modus, ohne params oder ungültig → []', () => {
  assert.deepEqual(guidedSteps(mkTask({ subtype: 'pct.of', params: { p: 10, y: 50 }, expected: 5 })), []);
  assert.deepEqual(guidedSteps(mkTask({ subtype: 'tricks.x11', expected: 1 })), []);
  assert.deepEqual(guidedSteps(null), []);
  assert.deepEqual(guidedSteps(mkTask({ subtype: '__proto__', params: { a: 1 }, expected: 1 })), []);
});
