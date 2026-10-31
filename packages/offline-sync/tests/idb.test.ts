import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAdapter } from '../src/adapters/idb.ts';
import type { BroadcastChannelLike } from '../src/adapters/idb.ts';
import { initStorageAdapter } from '../src/adapters/init.ts';
import { LocalStorageAdapter } from '../src/adapters/local-storage.ts';
import { MemoryAdapter } from '../src/adapters/memory.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hub() {
  const members = new Set<BroadcastChannelLike>();
  return (_name: string): BroadcastChannelLike => {
    const ch: BroadcastChannelLike = {
      onmessage: null,
      postMessage(m) {
        for (const o of members) if (o !== ch) { const f = o.onmessage; if (f) queueMicrotask(() => f({ data: m })); }
      },
      close() { members.delete(ch); },
    };
    members.add(ch);
    return ch;
  };
}

/** Zählt/steuert db.transaction auf dem Fake-IDB-Prototyp. */
async function dbProto(): Promise<object> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = new IDBFactory().open('probe');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return Object.getPrototypeOf(db) as object;
}

async function spyTx(mode: 'readwrite') {
  const proto = (await dbProto()) as { transaction: (...a: unknown[]) => unknown };
  const orig = proto.transaction;
  const st = { writes: 0, failNext: 0 };
  proto.transaction = function (this: unknown, ...a: unknown[]) {
    if (a[1] === mode) {
      st.writes++;
      if (st.failNext > 0) { st.failNext--; throw new Error('boom'); }
    }
    return orig.apply(this, a);
  };
  return { st, restore: () => { proto.transaction = orig; } };
}

const base = (idb: IDBFactory) => ({ idb, channel: null, lifecycle: null, debounceMs: 20 });

test('Roundtrip über Re-Open', async () => {
  const idb = new IDBFactory();
  const a = await IndexedDbAdapter.open(base(idb));
  a.set('x', '1');
  a.set('doc:y', '2');
  await a.flush();
  a.close();
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.get('x'), '1');
  assert.deepEqual(b.keys('doc:'), ['doc:y']);
  b.close();
});

test('viele set() -> genau eine Transaktion, entprellt', async () => {
  const idb = new IDBFactory();
  const a = await IndexedDbAdapter.open(base(idb));
  const spy = await spyTx('readwrite');
  try {
    for (let i = 0; i < 50; i++) a.set(`k${i}`, String(i));
    await sleep(5);
    assert.equal(spy.st.writes, 0);
    await sleep(80);
    assert.equal(spy.st.writes, 1);
  } finally { spy.restore(); }
  a.close();
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.keys('k').length, 50);
  b.close();
});

test('remove wird persistiert', async () => {
  const idb = new IDBFactory();
  const a = await IndexedDbAdapter.open(base(idb));
  a.set('x', '1');
  await a.flush();
  a.remove('x');
  await a.flush();
  a.close();
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.get('x'), null);
  b.close();
});

test('pagehide löst flush aus', async () => {
  const idb = new IDBFactory();
  const lifecycle = new EventTarget();
  const a = await IndexedDbAdapter.open({ ...base(idb), lifecycle, debounceMs: 60000 });
  a.set('x', '1');
  lifecycle.dispatchEvent(new Event('pagehide'));
  await sleep(50);
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.get('x'), '1');
  b.close();
  a.close();
});

test('Migration aus Quelle, nicht bei vorhandenen Daten', async () => {
  const idb = new IDBFactory();
  const src = new MemoryAdapter();
  src.set('a', '1');
  src.set('b', '2');
  const a = await IndexedDbAdapter.open({ ...base(idb), migrateFrom: src });
  assert.equal(a.get('a'), '1');
  assert.deepEqual(src.keys(''), []);
  a.close();
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.get('b'), '2');
  b.close();
  const src2 = new MemoryAdapter();
  src2.set('z', '9');
  const c = await IndexedDbAdapter.open({ ...base(idb), migrateFrom: src2 });
  assert.equal(c.get('z'), null);
  assert.deepEqual(src2.keys(''), ['z']);
  c.close();
});

test('zwei Instanzen: externe Änderung, lokal dirty bleibt', async () => {
  const idb = new IDBFactory();
  const ch = hub();
  const o = { idb, channel: ch, lifecycle: null, debounceMs: 20 };
  const a = await IndexedDbAdapter.open(o);
  const b = await IndexedDbAdapter.open(o);
  const got: string[][] = [];
  b.onExternalChange((k) => got.push(k));
  b.onExternalChange(() => { throw new Error('listener'); });
  a.set('x', 'A');
  a.set('y', 'A');
  b.set('y', 'B'); // lokal dirty
  await a.flush();
  await sleep(30);
  assert.equal(b.get('x'), 'A');
  assert.equal(b.get('y'), 'B');
  assert.deepEqual(got[0]?.slice().sort(), ['x', 'y']);
  a.remove('x');
  await a.flush();
  await sleep(30);
  assert.equal(b.get('x'), null);
  a.close();
  b.close();
});

test('initStorageAdapter fällt ohne IndexedDB auf localStorage zurück', async () => {
  assert.equal(globalThis.indexedDB, undefined);
  const a = await initStorageAdapter({ prefix: 'test:', idb: undefined });
  assert.ok(a instanceof LocalStorageAdapter);
  const b = await initStorageAdapter({ prefix: 'test:', idb: new IDBFactory(), channel: null, lifecycle: null });
  assert.equal(b.name, 'indexedDB');
  (b as IndexedDbAdapter).close();
});

test('fehlschlagender flush bleibt dirty, Retry klappt', async () => {
  const idb = new IDBFactory();
  const a = await IndexedDbAdapter.open(base(idb));
  const spy = await spyTx('readwrite');
  try {
    spy.st.failNext = 1;
    a.set('x', '1');
    await a.flush(); // schlägt fehl, wirft nicht
    assert.equal(a.get('x'), '1');
    await a.flush(); // Retry
    assert.equal(spy.st.writes, 2);
  } finally { spy.restore(); }
  a.close();
  const b = await IndexedDbAdapter.open(base(idb));
  assert.equal(b.get('x'), '1');
  b.close();
});

test('initStorageAdapter migriert aus localStorage mit Präfix', async () => {
  const raw = new Map<string, string>([['p:doc:x', '1'], ['other', 'z']]);
  const fs = {
    get length() { return raw.size; },
    key: (i: number) => [...raw.keys()][i] ?? null,
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => { raw.set(k, v); },
    removeItem: (k: string) => { raw.delete(k); },
  } as unknown as Storage;
  (globalThis as { localStorage?: Storage }).localStorage = fs;
  try {
    const a = await initStorageAdapter({ prefix: 'p:', idb: new IDBFactory(), channel: null, lifecycle: null });
    assert.equal(a.get('doc:x'), '1');
    assert.equal(raw.has('p:doc:x'), false);
    assert.equal(raw.has('other'), true);
    (a as IndexedDbAdapter).close();
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
