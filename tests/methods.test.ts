import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METHODS, getMethod } from '../src/core/methods.ts';
import { SUBTYPES } from '../src/core/generators/index.ts';

const filled = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;

test('jeder Subtyp hat eine Methode, keine überzähligen Schlüssel', () => {
  const ids = Object.keys(SUBTYPES).sort();
  assert.equal(ids.length, 45);
  assert.deepEqual(Object.keys(METHODS).sort(), ids);
});

test('Methoden sind vollständig', () => {
  for (const [id, m] of Object.entries(METHODS)) {
    assert.ok(filled(m.idea), `${id}: idea`);
    assert.ok(filled(m.trick), `${id}: trick`);
    assert.ok(Array.isArray(m.steps) && m.steps.length >= 3 && m.steps.length <= 5, `${id}: steps 3-5`);
    assert.ok(m.steps.every(filled), `${id}: steps non-empty`);
    assert.ok(Array.isArray(m.pitfalls) && m.pitfalls.length >= 1 && m.pitfalls.length <= 3, `${id}: pitfalls 1-3`);
    assert.ok(m.pitfalls.every(filled), `${id}: pitfalls non-empty`);
  }
});

test('getMethod liefert Methode oder null', () => {
  assert.equal(getMethod('pct.reverse'), METHODS['pct.reverse']);
  assert.equal(getMethod('gibt.es.nicht'), null);
  assert.equal(getMethod(undefined as unknown as string), null);
});
