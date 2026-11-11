// v9 G: Systemschrift → Faktor für --type-scale (src/ui/text-scale.ts, DOM-freier Teil)
import { test } from 'node:test';
import assert from 'node:assert/strict';
// dom.ts greift beim Import auf document zu: minimaler Ersatz davor (wie tests/ui-guards.test.ts)
(globalThis as { document?: unknown }).document = { getElementById: () => null, body: {} };
const { textScaleFrom, LARGE_TEXT_FROM, BASE_APPLE_BODY_PX, BASE_MEDIUM_PX, SCALE_MIN, SCALE_MAX } = await import('../src/ui/text-scale.ts');

test('textScaleFrom: Normalgröße ergibt 1', () => {
  assert.equal(textScaleFrom(17, BASE_APPLE_BODY_PX), 1);
  assert.equal(textScaleFrom(16, BASE_MEDIUM_PX), 1);
});

test('textScaleFrom: Verhältnis, auf 0,01 gerundet', () => {
  assert.equal(textScaleFrom(20, 17), 1.18);
  assert.equal(textScaleFrom(24, 16), 1.5);
  assert.equal(textScaleFrom(19.5, 16), 1.22);
});

test('textScaleFrom: Clamp 0,9–1,5', () => {
  assert.equal(textScaleFrom(10, 17), SCALE_MIN);
  assert.equal(textScaleFrom(60, 17), SCALE_MAX);
  assert.equal(textScaleFrom(0.9 * 16, 16), 0.9);
});

test('textScaleFrom: ungültige Messwerte → 1', () => {
  for (const [p, b] of [[NaN, 17], [17, NaN], [0, 17], [-4, 17], [17, 0], [Infinity, 17]] as const) {
    assert.equal(textScaleFrom(p, b), 1, `${p}/${b}`);
  }
});

test('große Schrift beginnt bei 1,15', () => {
  assert.ok(textScaleFrom(19.6, 17) >= LARGE_TEXT_FROM);
  assert.ok(textScaleFrom(19.4, 17) < LARGE_TEXT_FROM);
});
