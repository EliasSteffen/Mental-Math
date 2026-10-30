import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitFactor, parseAnswer, fmt, fmtSeconds, round, randInt, pick } from '../public/js/numbers.js';

test('parseAnswer', () => {
  const cases = [
    ['1.200', 1200], ['2.025', 2025], ['37,5', 37.5], ['37.5', 37.5], ['0,09', 0.09],
    ['-4', -4], ['−4', -4], ['1.234,5', 1234.5], ['15 %', 15], ['120 €', 120],
    ['', null], ['abc', null], ['  ', null],
  ];
  for (const [input, out] of cases) assert.equal(parseAnswer(input), out, `parseAnswer(${JSON.stringify(input)})`);
});

test('fmt', () => {
  assert.equal(fmt(1234.5), '1.234,5');
  assert.equal(fmt(-4), '−4');
  assert.equal(fmt(0.09), '0,09');
  assert.equal(fmt(2025), '2.025');
  assert.equal(fmt(1000000), '1.000.000');
  assert.equal(fmt(3.14159), '3,14');
});

test('fmtSeconds', () => {
  assert.equal(fmtSeconds(4230), '4,2 s');
});

test('round, randInt, pick', () => {
  assert.equal(round(1.00005, 4), 1.0001);
  assert.equal(round(2.5), 3);
  for (let i = 0; i < 200; i++) {
    const v = randInt(3, 5);
    assert.ok(v >= 3 && v <= 5 && Number.isInteger(v));
  }
  assert.equal(randInt(1, 6, () => 0.999999), 6);
  assert.equal(pick(['a', 'b'], () => 0), 'a');
});

test('unitFactor', () => {
  assert.equal(unitFactor('Tsd.'), 1e3);
  assert.equal(unitFactor('Mio. €'), 1e6);
  assert.equal(unitFactor('Mrd.'), 1e9);
  assert.equal(unitFactor('min'), 1);
  assert.equal(unitFactor(''), 1);
  assert.equal(unitFactor(undefined), 1);
});

test('parseAnswer Größen-Suffixe', () => {
  const cases = [
    ['40 Tsd', 40000], ['40 Tsd.', 40000], ['1,5 Mio', 1500000], ['2 Mrd.', 2000000000],
    ['30k', 30000], ['3 bn', 3000000000], ['12 Mio. €', 12000000], ['2 Tausend', 2000],
    ['1,5 Millionen', 1500000], ['2 Milliarden', 2000000000], ['5 MIO', 5000000],
    ['5 min', null], ['5 m', null],
  ];
  for (const [input, out] of cases) assert.equal(parseAnswer(input), out, `parseAnswer(${JSON.stringify(input)})`);
});
