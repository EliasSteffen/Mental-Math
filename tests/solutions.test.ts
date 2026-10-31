import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBTYPES, generate } from '../src/core/generators/index.ts';
import { solutionSteps } from '../src/core/solutions/index.ts';
import { fmt } from '../src/core/numbers.ts';
import { setLang } from '../src/i18n/index.ts';
import { mkTask } from './helpers.ts';
import type { Task } from '../src/types.ts';

for (const id of Object.keys(SUBTYPES)) {
  test(`solutionSteps(${id})`, () => {
    for (let i = 0; i < 300; i++) {
      const t = generate(id);
      const steps = solutionSteps(t);
      const ctx = `${t.prompt} → ${JSON.stringify(steps)}`;
      assert.ok(steps.length >= 3 && steps.length <= 6, `Schrittzahl ${steps.length}: ${ctx}`);
      for (const s of steps) {
        assert.equal(typeof s, 'string');
        assert.ok(s.trim().length > 0, ctx);
        for (const bad of ['NaN', 'undefined', 'Infinity', '[object']) assert.ok(!s.includes(bad), `${bad}: ${ctx}`);
      }
      assert.ok((steps[steps.length - 1] ?? '').includes(t.kind === 'choice' ? (t.choices[t.expected] ?? '') : fmt(t.expected)), `letzter Schritt: ${ctx}`);
    }
  });
}

test('ohne params oder unbekannter Typ → []', () => {
  assert.deepEqual(solutionSteps(mkTask({ subtype: 'mult.2x2', expected: 1 })), []);
  assert.deepEqual(solutionSteps(mkTask({ subtype: 'nope', params: { a: 1 }, expected: 1 })), []);
  assert.deepEqual(solutionSteps(null as unknown as Task), []);
});

test('Lösungswege auf Englisch: alle Typen, ohne deutsche Reste, Ergebnis im letzten Schritt', () => {
  const german = /\b(und|oder|nicht|heißt|zerlegen|Probe|Rest|Ergebnis|Exakt|Nullen|Ziffern|Stück|Jahre|Mio\.|Mrd\.|Tsd\.)(?![\p{L}])/u;
  setLang('en');
  try {
    for (const id of Object.keys(SUBTYPES)) {
      for (const level of [1, 2, 3] as const) {
        for (let i = 0; i < 40; i++) {
          const t = generate(id, Math.random, { level });
          const steps = solutionSteps(t);
          assert.ok(steps.length >= 3 && steps.length <= 6, `${id}: ${steps.length} Schritte`);
          for (const step of steps) assert.ok(!german.test(step), `${id}: deutscher Rest in "${step}"`);
          assert.ok((steps[steps.length - 1] ?? '').includes(t.kind === 'choice' ? (t.choices[t.expected] ?? '') : fmt(t.expected)), `${id}: letzter Schritt ${JSON.stringify(steps)}`);
        }
      }
    }
  } finally {
    setLang('de');
  }
});
