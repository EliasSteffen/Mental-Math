import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBTYPES, generate } from '../public/js/generators.js';
import { solutionSteps } from '../public/js/solutions.js';
import { fmt } from '../public/js/numbers.js';

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
      assert.ok(steps[steps.length - 1].includes(fmt(t.expected)), `letzter Schritt: ${ctx}`);
    }
  });
}

test('ohne params oder unbekannter Typ → []', () => {
  assert.deepEqual(solutionSteps({ subtype: 'mult.2x2', expected: 1 }), []);
  assert.deepEqual(solutionSteps({ subtype: 'nope', params: { a: 1 }, expected: 1 }), []);
  assert.deepEqual(solutionSteps(null), []);
});
