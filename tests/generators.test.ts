import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, SUBTYPES, LEVEL_NAMES, LEVEL_WEIGHT, generate, generateForMode } from '../src/core/generators/index.ts';
import { evaluate } from '../src/core/scoring.ts';
import { solutionSteps } from '../src/core/solutions/index.ts';
import { unitFactor, fmt } from '../src/core/numbers.ts';
import type { Level, Subtype, Task } from '../src/types.ts';

const sub = (id: string): Subtype => {
  const s = SUBTYPES[id];
  assert.ok(s, id);
  return s;
};

// Exakte Typen mit legitim nicht-ganzzahliger Antwort (z. B. 12,5 % bzw. 7,5 Mio. €)
const FRACTIONAL_OK = new Set(['pct.change', 'biz.tco']);
const lastOk = (t: Task, steps: string[]): boolean => (steps[steps.length - 1] ?? '').includes(t.kind === 'choice' ? (t.choices[t.expected] ?? '') : fmt(t.expected));

test('12 Kategorien (davon 1 versteckt), jede mit mindestens 2 Typen', () => {
  assert.equal(CATEGORIES.length, 12);
  assert.deepEqual(CATEGORIES.filter((c) => c.hidden).map((c) => c.id), ['custom']);
  for (const c of CATEGORIES) {
    const n = Object.values(SUBTYPES).filter((s) => s.category === c.id).length;
    assert.ok(n >= 2, `${c.id} hat ${n} Typen`);
  }
});

for (const id of Object.keys(SUBTYPES)) {
  test(`generate(${id})`, () => {
    const s = sub(id);
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

test('Level-Konstanten', () => {
  assert.deepEqual(LEVEL_NAMES, { 1: 'Leicht', 2: 'Mittel', 3: 'Schwer' });
  assert.deepEqual(LEVEL_WEIGHT, { 1: 0.75, 2: 1, 3: 1.5 });
});

for (const id of Object.keys(SUBTYPES)) {
  test(`Level 1..3: ${id}`, () => {
    const s = sub(id);
    for (const level of [1, 2, 3] as Level[]) {
      for (let i = 0; i < 200; i++) {
        const t = generate(id, Math.random, { level });
        assert.equal(t.level, level);
        assert.ok(Math.abs(t.weight - s.weight * LEVEL_WEIGHT[level]) < 1e-9);
        assert.equal(t.targetMs, Math.round(s.targetMs * (level === 3 ? 1.3 : 1)));
        const steps = solutionSteps(t);
        const ctx = `L${level} ${t.prompt} → ${JSON.stringify(steps)}`;
        assert.ok(steps.length >= 3 && steps.length <= 6, ctx);
        assert.ok(lastOk(t, steps), ctx);
        assert.equal(evaluate(t, t.expected, 1000).correct, true, ctx);
        assert.doesNotMatch(t.prompt, /NaN|undefined|Infinity/);
      }
    }
  });
}

test('Standard-Level ist 2', () => {
  assert.equal(generate('pct.of').level, 2);
  assert.equal(generate('pct.of', Math.random, { level: 9 as unknown as Level }).level, 2);
});

test('generateForMode: levelFor und review', () => {
  assert.equal(generateForMode('pct.of', {}).level, 2);
  assert.equal(generateForMode('pct.of', { levelFor: () => 3 }).level, 3);
  const seen: string[] = [];
  const t = generateForMode('all', { levelFor: (id) => (seen.push(id), 1) });
  assert.deepEqual(seen, [t.subtype]);
  for (let i = 0; i < 50; i++) {
    const r = generateForMode('review', { reviewSubtypes: [{ subtype: 'biz.roi' }, 'pct.of'] });
    assert.ok(['biz.roi', 'pct.of'].includes(r.subtype));
    assert.equal(r.mode, 'review');
    assert.ok(SUBTYPES[generateForMode('review', {}).subtype]);
  }
});
