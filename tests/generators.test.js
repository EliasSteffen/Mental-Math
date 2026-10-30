import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, SUBTYPES, generate, generateForMode } from '../public/js/generators.js';
import { evaluate } from '../public/js/scoring.js';
import { unitFactor } from '../public/js/numbers.js';

// Exakte Typen mit legitim nicht-ganzzahliger Antwort (z. B. 12,5 % bzw. 7,5 Mio. €)
const FRACTIONAL_OK = new Set(['pct.change', 'biz.tco']);

test('8 Kategorien, jede mit mindestens 2 Typen', () => {
  assert.equal(CATEGORIES.length, 8);
  for (const c of CATEGORIES) {
    const n = Object.values(SUBTYPES).filter((s) => s.category === c.id).length;
    assert.ok(n >= 2, `${c.id} hat ${n} Typen`);
  }
});

for (const id of Object.keys(SUBTYPES)) {
  test(`generate(${id})`, () => {
    const s = SUBTYPES[id];
    for (let i = 0; i < 500; i++) {
      const t = generate(id);
      assert.ok(Number.isFinite(t.expected), `${id} expected`);
      assert.equal(typeof t.prompt, 'string');
      assert.ok(t.prompt.length > 0);
      assert.doesNotMatch(t.prompt, /NaN|undefined|Infinity/);
      assert.equal(typeof t.unit, 'string');
      assert.equal(typeof t.hint, 'string');
      assert.ok(t.targetMs > 0 && t.weight > 0);
      assert.equal(t.category, s.category);
      assert.equal(t.subtype, id);
      assert.equal(typeof t.id, 'string');
      assert.equal(evaluate(t, t.expected, 1000).correct, true, `${id}: ${t.prompt}`);
      if (t.tolerance.abs === 0 && t.tolerance.rel === 0 && !FRACTIONAL_OK.has(id)) {
        assert.ok(Number.isInteger(t.expected), `${id}: ${t.prompt} -> ${t.expected}`);
      }
    }
  });
}

test('generateForMode', () => {
  for (const c of CATEGORIES) {
    for (let i = 0; i < 50; i++) assert.equal(generateForMode(c.id).category, c.id);
  }
  for (let i = 0; i < 50; i++) {
    assert.ok(SUBTYPES[generateForMode('all').subtype]);
    assert.ok(SUBTYPES[generateForMode('weak').subtype]);
    assert.ok(SUBTYPES[generateForMode('weak', { weakSubtypes: [] }).subtype]);
    assert.ok(['pct.of', 'biz.roi'].includes(generateForMode('weak', { weakSubtypes: ['pct.of', 'biz.roi'] }).subtype));
  }
});

for (const id of Object.keys(SUBTYPES)) {
  test(`params + generateForMode(${id})`, () => {
    for (let i = 0; i < 100; i++) {
      const t = generateForMode(id);
      assert.equal(t.subtype, id);
      assert.ok(t.params && Object.keys(t.params).length > 0, 'params leer');
      assert.deepEqual(JSON.parse(JSON.stringify(t.params)), t.params);
      for (const v of Object.values(t.params)) assert.ok(typeof v === 'string' || Number.isFinite(v));
    }
  });
}

for (const id of Object.keys(SUBTYPES)) {
  test(`volle Zahl wird akzeptiert bei Größeneinheit (${id})`, () => {
    for (let i = 0; i < 300; i++) {
      const task = generate(id);
      const F = unitFactor(task.unit);
      if (F <= 1) return;
      assert.equal(evaluate(task, task.expected * F, 1000).correct, true, `${task.prompt} ${task.unit}`);
    }
  });
}
