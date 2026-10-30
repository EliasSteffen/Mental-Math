import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordResult, dueReviews, nextDue } from '../public/js/review.js';

const DAY = 86400000;
const T0 = new Date(2026, 5, 10, 12).getTime();

test('falsch legt Item an, richtig nicht', () => {
  const r0 = {};
  assert.deepEqual(recordResult(r0, { subtype: 'a', correct: true, ts: T0, isReview: false }), {});
  const r1 = recordResult(r0, { subtype: 'a', correct: false, ts: T0, isReview: false });
  assert.deepEqual(r1, { a: { box: 0, dueAt: T0 + DAY, lastTs: T0 } });
  assert.deepEqual(r0, {});
});

test('Review: Box steigt, Intervalle, gemeistert', () => {
  let r = recordResult({}, { subtype: 'a', correct: false, ts: T0 });
  const days = [2, 4, 7, 14];
  let ts = T0;
  days.forEach((d, i) => {
    ts += DAY;
    const prev = r;
    r = recordResult(r, { subtype: 'a', correct: true, ts, isReview: true });
    assert.equal(r.a.box, i + 1);
    assert.equal(r.a.dueAt, ts + d * DAY);
    assert.equal(prev.a.box, i);
  });
  r = recordResult(r, { subtype: 'a', correct: true, ts: ts + 14 * DAY, isReview: true });
  assert.deepEqual(r, {});
});

test('Review falsch → Box 0; nicht-Review falsch setzt zurück', () => {
  let r = { a: { box: 3, dueAt: T0, lastTs: T0 } };
  const w = recordResult(r, { subtype: 'a', correct: false, ts: T0 + 5, isReview: true });
  assert.deepEqual(w.a, { box: 0, dueAt: T0 + 5 + DAY, lastTs: T0 + 5 });
  const w2 = recordResult(r, { subtype: 'a', correct: false, ts: T0 + 5 });
  assert.equal(w2.a.box, 0);
  assert.equal(recordResult(r, { subtype: 'a', correct: true, ts: T0 + 5 }).a.box, 3);
  assert.equal(recordResult({}, { subtype: 'b', correct: false, ts: T0, isReview: true }).b.box, 0);
});

test('dueReviews & nextDue', () => {
  const r = {
    a: { box: 0, dueAt: T0 + 2 * DAY, lastTs: 0 },
    b: { box: 1, dueAt: T0 - DAY, lastTs: 0 },
    c: { box: 2, dueAt: T0, lastTs: 0 },
    d: { box: 0, dueAt: T0 + 9 * DAY, lastTs: 0 },
  };
  assert.deepEqual(dueReviews(r, T0 + 2 * DAY).map((x) => x.subtype), ['b', 'c', 'a']);
  assert.deepEqual(dueReviews(r, T0)[1], { subtype: 'c', box: 2, dueAt: T0 });
  assert.deepEqual(dueReviews({}, T0), []);
  assert.equal(nextDue(r), T0 - DAY);
  assert.equal(nextDue({}), null);
});
