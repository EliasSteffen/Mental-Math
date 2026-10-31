import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareMeta, keepKeys, lwwByKey, lwwDoc, maxByKey, stableEqual, sumByKey } from '../src/merge.ts';
import type { SyncMeta } from '../src/types.ts';

const meta = (o: Partial<SyncMeta> = {}): SyncMeta => ({ id: 'x', createdAt: 1, updatedAt: 10, deletedAt: null, deviceId: 'a', rev: 1, ...o });

test('stableEqual: Schlüsselreihenfolge egal, Tiefenvergleich', () => {
  assert.ok(stableEqual({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!stableEqual({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(!stableEqual({ a: [1, 2] }, { a: [2, 1] }));
  assert.ok(!stableEqual({ a: 1 }, [1]));
  assert.ok(stableEqual(null, null));
  assert.ok(!stableEqual({ a: undefined }, { b: undefined }));
});

test('compareMeta: updatedAt, rev, deviceId, Gleichstand', () => {
  assert.ok(compareMeta(meta({ updatedAt: 5 }), meta({ updatedAt: 6 })) < 0);
  assert.ok(compareMeta(meta({ rev: 3 }), meta({ rev: 2 })) > 0);
  assert.ok(compareMeta(meta({ deviceId: 'a' }), meta({ deviceId: 'b' })) < 0);
  assert.equal(compareMeta(meta(), meta()), 0);
  assert.ok(compareMeta(meta({ updatedAt: 9, rev: 99 }), meta({ updatedAt: 10, rev: 1 })) < 0);
});

test('maxByKey: Maximum pro Schlüssel, kommutativ, idempotent', () => {
  const a = { x: 3, y: 5 };
  const b = { x: 4, z: 1 };
  assert.deepEqual(maxByKey(a, b), { x: 4, y: 5, z: 1 });
  assert.deepEqual(maxByKey(a, b), maxByKey(b, a));
  assert.deepEqual(maxByKey(a, a), a);
});

test('lwwByKey: größeres Feld gewinnt, Gleichstand behält links', () => {
  const a = { 'x.1': { box: 1, lastTs: 5 }, 'x.2': { box: 2, lastTs: 9 } };
  const b = { 'x.1': { box: 3, lastTs: 7 }, 'x.3': { box: 1, lastTs: 1 } };
  const m = lwwByKey(a, b, 'lastTs');
  assert.equal((m['x.1'] as { box: number }).box, 3);
  assert.equal((m['x.2'] as { box: number }).box, 2);
  assert.ok('x.3' in m);
  assert.deepEqual(lwwByKey(a, b, 'lastTs'), lwwByKey(b, a, 'lastTs'));
  const l = { k: { v: 'l', ts: 1 } };
  const r = { k: { v: 'r', ts: 1 } };
  assert.equal((lwwByKey(l, r, 'ts').k as { v: string }).v, 'l');
  assert.deepEqual(lwwByKey(a, a, 'lastTs'), a);
});

test('lwwDoc: Remote gewinnt nur bei echt neuerem Stand', () => {
  const l = { t: 'l' };
  const r = { t: 'r' };
  assert.deepEqual(lwwDoc(l, r, { localUpdatedAt: 5, remoteUpdatedAt: 9 }), r);
  assert.deepEqual(lwwDoc(l, r, { localUpdatedAt: 9, remoteUpdatedAt: 9 }), l);
  assert.deepEqual(lwwDoc(l, r, { localUpdatedAt: 20, remoteUpdatedAt: 9 }), l);
  assert.deepEqual(lwwDoc(l, r, { localUpdatedAt: null, remoteUpdatedAt: 0 }), r);
  const res = lwwDoc(l, r, { localUpdatedAt: 5, remoteUpdatedAt: 9 });
  assert.notEqual(res, r, 'Kopie, kein Alias');
});

test('keepKeys: lokale Schlüssel bleiben, fehlende werden entfernt', () => {
  const local = { a: 1, keypad: 'on', ver: '1' };
  const merged = { a: 2, keypad: 'off', ver: '2', extra: 1 };
  assert.deepEqual(keepKeys(merged, local, ['keypad', 'ver']), { a: 2, keypad: 'on', ver: '1', extra: 1 });
  assert.deepEqual(keepKeys(merged, { a: 1 }, ['keypad']), { a: 2, ver: '2', extra: 1 });
  assert.deepEqual(merged, { a: 2, keypad: 'off', ver: '2', extra: 1 }, 'Eingabe unverändert');
});

test('sumByKey: Summe über mehrere Maps', () => {
  assert.deepEqual(sumByKey({ d1: 10, d2: 5 }, { d1: 1, d3: 2 }, { d1: 4 }), { d1: 15, d2: 5, d3: 2 });
  assert.deepEqual(sumByKey(null, undefined), {});
  assert.deepEqual(sumByKey(), {});
});

test('kaputte Eingaben werden wie leere Objekte behandelt', () => {
  for (const bad of [null, undefined, 5, 'x', [1, 2]]) {
    assert.deepEqual(maxByKey(bad, { a: 1 }), { a: 1 });
    assert.deepEqual(lwwByKey({ a: { ts: 1 } }, bad, 'ts'), { a: { ts: 1 } });
    assert.deepEqual(lwwByKey(bad, bad, 'ts'), {});
    assert.deepEqual(lwwDoc(bad, bad, { localUpdatedAt: 1, remoteUpdatedAt: 2 }), {});
    assert.deepEqual(keepKeys(bad, bad, ['k']), {});
    assert.deepEqual(sumByKey(bad, { d: 5 }), { d: 5 });
  }
  assert.deepEqual(maxByKey({ a: 'x' }, { a: 2 }), { a: 2 });
  assert.deepEqual(sumByKey({ a: 'x' }, { d: 5 }), { d: 5 });
});
