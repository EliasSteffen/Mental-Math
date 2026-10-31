import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docToRow, rowToDoc } from 'offline-sync/supabase';
import { resultToRow, rowToResult, rowToSession, sessionToRow } from '../src/data/remote/mappers.ts';
import type { GameResult, RemoteDoc, SessionStats } from '../src/types.ts';

const U = '00000000-0000-4000-8000-00000000000a';
const meta = { createdAt: 1_700_000_000_123, updatedAt: 1_700_000_005_000, deletedAt: null, deviceId: 'dev-1', rev: 3 };

const session: SessionStats = { ...meta, id: 's123', ts: 1_700_000_000_123, mode: 'all', n: 10, correct: 7, points: 420, avgTimeMs: 2345 };

const minimal: GameResult = {
  ...meta, id: 'r1', ts: 1_700_000_000_500, sessionId: 's123', mode: 'pct', category: 'pct', subtype: 'pct.of',
  prompt: '10% von 50', unit: '', expected: 5, given: null, correct: false, errorType: 'skip',
  timeMs: 1200, targetMs: 4000, weight: 1, points: 0,
};
const full: GameResult = {
  ...minimal, id: 'r2', given: 6, errorType: 'knapp', level: 2, params: { a: 10, b: 'x' }, assisted: true, untimed: false,
  isReview: true, estimate: false, kind: 'choice', choices: ['5', '6'], deletedAt: 1_700_000_009_000,
};

test('session: roundtrip und Rundung', () => {
  const row = sessionToRow(session, U);
  assert.equal(row.score, 420);
  assert.equal(row.duration_ms, 23450);
  assert.equal(row.created_at, '2023-11-14T22:13:20.123Z');
  assert.deepEqual(rowToSession(row), session);
  const odd = sessionToRow({ ...session, n: 3, avgTimeMs: 1000.6 }, U);
  assert.equal(odd.avg_time_ms, 1001);
  assert.equal(odd.duration_ms, 3002);
});

test('session: bigint als String', () => {
  const row = { ...sessionToRow(session, U), updated_at: '1700000005000', deleted_at: '1700000009000', duration_ms: '23450' };
  const back = rowToSession(row);
  assert.equal(back?.updatedAt, 1_700_000_005_000);
  assert.equal(back?.deletedAt, 1_700_000_009_000);
});

test('result: minimal und voll verlustfrei', () => {
  for (const r of [minimal, full]) {
    const row = resultToRow(r, U);
    assert.equal(row.user_id, U);
    assert.deepEqual(rowToResult(JSON.parse(JSON.stringify(row))), r);
  }
  const m = rowToResult(resultToRow(minimal, U));
  assert.ok(m && !('level' in m) && !('params' in m) && !('choices' in m));
  assert.equal(resultToRow(minimal, U).level, null);
  assert.equal(resultToRow(full, U).level, 2);
  assert.ok(!('params' in resultToRow(minimal, U).payload));
});

test('doc: roundtrip', () => {
  const d: RemoteDoc = { name: 'chainBest', data: { 1: 5, nested: { a: [1] } }, updatedAt: 99, deviceId: 'dev-1' };
  assert.deepEqual(rowToDoc(docToRow(d, U)), d);
  assert.equal(docToRow(d, U).user_id, U);
});

test('malformed Zeilen -> null', () => {
  const sr = sessionToRow(session, U);
  assert.equal(rowToSession(null), null);
  assert.equal(rowToSession({ ...sr, id: undefined }), null);
  assert.equal(rowToSession({ ...sr, created_at: 'kaputt' }), null);
  assert.equal(rowToSession({ ...sr, score: 'abc' }), null);
  const rr = resultToRow(full, U);
  assert.equal(rowToResult({ ...rr, payload: null }), null);
  assert.equal(rowToResult({ ...rr, payload: { ...rr.payload, prompt: 5 } }), null);
  assert.equal(rowToResult({ ...rr, error_type: 'bogus' }), null);
  assert.equal(rowToResult({ ...rr, level: 7 }), null);
  assert.equal(rowToResult({ ...rr, correct: 'yes' }), null);
  assert.equal(rowToDoc({ name: 'x', data: [], updated_at: 1, device_id: 'd' }), null);
  assert.equal(rowToDoc({ name: 'x', data: {}, updated_at: 'nope', device_id: 'd' }), null);
});
