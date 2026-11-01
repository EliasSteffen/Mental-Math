import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageAdapter } from '../src/adapters/local-storage.ts';
import { MemoryAdapter } from '../src/adapters/memory.ts';
import { getDeviceId, newId } from '../src/ids.ts';
import { createMeta, tombstone, touch } from '../src/meta.ts';
import { MAX_PENDING, Repository } from '../src/repository.ts';
import type { StorageAdapter, SyncMeta } from '../src/types.ts';

type Item = SyncMeta & { points?: number };
const mk = (id: string, now = 1, points = 0): Item => ({ ...createMeta(now, 'd', id), points });

function fakeStorage(initial: Record<string, string> = {}): Storage & { raw: Map<string, string> } {
  const raw = new Map(Object.entries(initial));
  return {
    raw,
    get length() { return raw.size; },
    clear() { raw.clear(); },
    key(i: number) { return [...raw.keys()][i] ?? null; },
    getItem(k: string) { return raw.get(k) ?? null; },
    setItem(k: string, v: string) { raw.set(k, String(v)); },
    removeItem(k: string) { raw.delete(k); },
  };
}

test('Adapter: Memory und localStorage (Präfix, keys ohne Präfix)', () => {
  const m = new MemoryAdapter();
  m.set('a:1', 'x');
  m.set('b', 'y');
  assert.equal(m.get('a:1'), 'x');
  assert.deepEqual(m.keys('a:'), ['a:1']);
  m.remove('a:1');
  assert.equal(m.get('a:1'), null);

  const fs = fakeStorage({ other: 'z' });
  (globalThis as { localStorage?: Storage }).localStorage = fs;
  try {
    const a = new LocalStorageAdapter('mm:v3:');
    a.set('doc:x', '1');
    assert.equal(fs.raw.get('mm:v3:doc:x'), '1');
    assert.deepEqual(a.keys(''), ['doc:x']);
    assert.equal(a.get('doc:x'), '1');
    a.remove('doc:x');
    assert.equal(fs.raw.has('mm:v3:doc:x'), false);
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('Adapter: ohne/mit kaputtem localStorage Fallback auf Memory', () => {
  const a = new LocalStorageAdapter('p:');
  a.set('k', 'v');
  assert.equal(a.get('k'), 'v');
  assert.deepEqual(a.keys('k'), ['k']);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } as unknown as Storage;
  (globalThis as { localStorage?: Storage }).localStorage = broken;
  try {
    a.set('k2', 'v2');
    assert.equal(a.get('k2'), 'v2');
    a.remove('k');
    assert.equal(a.get('k'), null);
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('IDs: UUID-Format, deviceId persistent', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(newId(), re);
  assert.notEqual(newId(), newId());
  const crypto = (globalThis as { crypto?: unknown }).crypto;
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    assert.match(newId(), re);
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: crypto, configurable: true });
  }
  const m = new MemoryAdapter();
  const d = getDeviceId(m);
  assert.equal(getDeviceId(m), d);
  assert.equal(m.get('deviceId'), d);
  assert.equal(getDeviceId(m, 'other'), m.get('other'));
});

test('Meta: createMeta, touch, tombstone', () => {
  const m = createMeta(100, 'dev-a', 'id-1');
  assert.deepEqual(m, { id: 'id-1', createdAt: 100, updatedAt: 100, deletedAt: null, deviceId: 'dev-a', rev: 1 });
  assert.match(createMeta(1, 'd').id, /^[0-9a-f-]{36}$/);
  const t = touch(m, 200, 'dev-b');
  assert.deepEqual(t, { ...m, updatedAt: 200, rev: 2, deviceId: 'dev-b' });
  assert.equal(m.rev, 1, 'Original unverändert');
  const d = tombstone(t, 300, 'dev-b');
  assert.equal(d.deletedAt, 300);
  assert.equal(d.rev, 3);
  assert.equal(d.updatedAt, 300);
  assert.equal(d.createdAt, 100);
});

test('Repository: CRUD, Soft-Delete, Cache', () => {
  let reads = 0;
  const mem = new MemoryAdapter();
  const counting: StorageAdapter = { name: 'c', get: (k) => { reads++; return mem.get(k); }, set: (k, v) => mem.set(k, v), remove: (k) => mem.remove(k), keys: (p) => mem.keys(p) };
  let now = 1000;
  const repo = new Repository(counting, { now: () => now });
  assert.equal(repo.getDoc('x'), null);
  repo.putDoc('x', { a: 1 });
  assert.deepEqual(repo.getDoc('x'), { a: 1 });

  repo.upsert('results', mk('r1', now));
  repo.upsert('results', mk('r2', now));
  assert.equal(repo.list('results').length, 2);
  repo.upsert('results', mk('r1', now, 5));
  assert.equal(repo.list<Item>('results').length, 2, 'Upsert ersetzt per id');
  assert.equal(repo.list<Item>('results')[0]?.points, 5);

  now = 2000;
  assert.equal(repo.remove('results', 'r1'), true);
  assert.equal(repo.remove('results', 'r1'), false);
  assert.equal(repo.remove('results', 'nope'), false);
  assert.deepEqual(repo.list<Item>('results').map((x) => x.id), ['r2']);
  const all = repo.list<Item>('results', true);
  assert.equal(all.length, 2);
  const t = all.find((x) => x.id === 'r1');
  assert.equal(t?.deletedAt, 2000);
  assert.equal(t?.rev, 2);

  const before = reads;
  for (let i = 0; i < 20; i++) { repo.list('results'); repo.getDoc('x'); }
  assert.equal(reads, before, 'Lesezugriffe aus dem Cache');

  repo.trim('results', 1);
  assert.deepEqual(repo.list<Item>('results', true).map((x) => x.id), ['r2'], 'Tombstones zuerst entfernt');
  const repo2 = new Repository(mem);
  assert.equal(repo2.list('results').length, 1);
});

test('Repository: Speicherschlüssel doc:/rec:/out:/sync/deviceId, ein Schlüssel je Datensatz und Outbox-Eintrag', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem, { now: () => 9 });
  repo.putDoc('settings', { a: 1 });
  repo.upsert('results', mk('r1'));
  repo.upsert('results', mk('r2'));
  repo.upsert('a:b', mk('x'), false);
  assert.ok(repo.deviceId);
  assert.deepEqual(mem.keys('').sort(), ['deviceId', 'doc:settings', 'out:1', 'out:2', 'out:3', 'rec:a%3Ab:x', 'rec:results:r1', 'rec:results:r2']);
  assert.deepEqual(JSON.parse(mem.get('rec:results:r2') ?? 'null'), [1, mk('r2')], '[Ordnungsnummer, Datensatz]');
  assert.deepEqual(JSON.parse(mem.get('out:3') ?? 'null'), { seq: 3, target: 'results', id: 'r2', op: 'upsert', at: 9 });
  repo.ackChanges([1]);
  assert.deepEqual(JSON.parse(mem.get('sync') ?? 'null'), {
    lastPulledAt: null, lastPushedSeq: 1, nextSeq: 4, pending: [], cursor: null, fullPushNeeded: false, fullPushGen: 0, docClock: {},
  }, 'nur skalare Felder; pending bleibt leer für ältere Versionen');
  assert.equal(mem.get('deviceId'), repo.deviceId);
  assert.deepEqual(new Repository(mem).list('a').length, 0, 'Präfix trifft keine fremde Collection');
});

test('Repository: Änderungsprotokoll fasst zusammen, trackt jeden Dokumentnamen, Überlauf → Vollabgleich', () => {
  let now = 1;
  const repo = new Repository(new MemoryAdapter(), { now: () => now });
  repo.upsert('results', mk('a', now));
  now = 2;
  repo.upsert('results', mk('a', now));
  repo.putDoc('settings', { x: 1 });
  repo.putDoc('settings', { x: 2 });
  repo.putDoc('misc', 1); // beliebiger Name wird protokolliert
  repo.putDoc('quiet', 1, false);
  let s = repo.getSyncState();
  assert.deepEqual(s.pending.map((c) => `${c.target}:${c.id}:${c.op}`), ['results:a:upsert', 'settings:settings:upsert', 'misc:misc:upsert']);
  now = 3;
  repo.remove('results', 'a');
  s = repo.getSyncState();
  assert.equal(s.pending.length, 3);
  assert.deepEqual(s.pending.at(-1), { seq: s.nextSeq - 1, target: 'results', id: 'a', op: 'delete', at: 3 });

  for (let i = 0; i < MAX_PENDING + 50; i++) repo.upsert('results', mk(`n${i}`, now));
  s = repo.getSyncState();
  assert.equal(s.fullPushNeeded, true);
  assert.ok(s.pending.length < 60);
  const seqs = s.pending.map((c) => c.seq);
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y));
  assert.equal(repo.list('results').length, MAX_PENDING + 50);

  const before = s.pending.length;
  repo.ackChanges([s.pending[0]?.seq ?? 0]);
  assert.equal(repo.getSyncState().pending.length, before - 1);
});

test('Repository: maxPending konfigurierbar', () => {
  const repo = new Repository(new MemoryAdapter(), { maxPending: 3 });
  for (let i = 0; i < 4; i++) repo.upsert('c', mk(`i${i}`));
  const s = repo.getSyncState();
  assert.equal(s.fullPushNeeded, true);
  assert.equal(s.pending.length, 0);
  assert.equal(s.fullPushGen, 1, 'Überlauf erhöht die Generation');
});

test('Repository: getSyncState füllt Defaults alter Stände, Sync-Helfer', () => {
  const mem = new MemoryAdapter();
  mem.set('sync', JSON.stringify({ lastPulledAt: null, lastPushedSeq: 0, nextSeq: 5, pending: [] }));
  const repo = new Repository(mem);
  const s = repo.getSyncState();
  assert.equal(s.cursor, null);
  assert.equal(s.fullPushNeeded, false);
  assert.equal(s.fullPushGen, 0);
  assert.deepEqual(s.docClock, {});
  repo.markFullPush();
  assert.equal(repo.getSyncState().fullPushNeeded, true);
  const gen = repo.getSyncState().fullPushGen;
  assert.equal(gen, 1);
  repo.markFullPush(); // erneut angefordert (z. B. während eines laufenden Pushs)
  assert.equal(repo.clearFullPushIf(gen), false, 'veraltete Generation löscht nicht');
  assert.equal(repo.getSyncState().fullPushNeeded, true);
  assert.equal(repo.clearFullPushIf(gen + 1), true);
  assert.equal(repo.getSyncState().fullPushNeeded, false);
  repo.setCursor('c1');
  repo.setLastPulledAt(77);
  const again = new Repository(mem).getSyncState();
  assert.equal(again.cursor, 'c1');
  assert.equal(again.lastPulledAt, 77);
  assert.equal(again.fullPushGen, 2);
  assert.equal(again.fullPushNeeded, false);

  mem.set('sync', JSON.stringify({ lastPulledAt: null, lastPushedSeq: 0, nextSeq: 1, pending: [], fullPushGen: 'x', docClock: [1] }));
  const broken = new Repository(mem).getSyncState();
  assert.equal(broken.fullPushGen, 0);
  assert.deepEqual(broken.docClock, {});
});

test('Repository: Dokument-Uhr merkt den höchsten Remote-Stand, persistiert, clear() setzt zurück', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  assert.equal(repo.getDocClock('best'), 0);
  repo.noteDocClock('best', 500);
  repo.noteDocClock('best', 300); // kleiner: bleibt
  repo.noteDocClock('best', Number.NaN);
  repo.noteDocClock('log', 7);
  assert.equal(repo.getDocClock('best'), 500);
  assert.equal(repo.getDocClock('constructor'), 0, 'nur eigene Felder');
  repo.noteDocClock('__proto__', 9);
  assert.equal(repo.getDocClock('__proto__'), 9);
  assert.equal(Object.getPrototypeOf(repo.getSyncState().docClock), Object.prototype);
  const again = new Repository(mem);
  assert.equal(again.getDocClock('best'), 500);
  assert.equal(again.getDocClock('log'), 7);
  again.clear();
  assert.equal(again.getDocClock('best'), 0);
  assert.deepEqual(again.getSyncState().docClock, {});
});

test('Repository: getById über den Index, inkl. Tombstones', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  assert.equal(repo.getById('c', 'x'), null);
  for (let i = 0; i < 5; i++) repo.upsert('c', mk(`i${i}`, 1, i));
  assert.equal(repo.getById<Item>('c', 'i3')?.points, 3);
  assert.equal(repo.getById('c', 'nope'), null);
  repo.remove('c', 'i1');
  assert.ok(repo.getById('c', 'i1')?.deletedAt, 'Tombstone wird geliefert');
  repo.upsert('c', mk('i3', 2, 33));
  assert.equal(repo.getById<Item>('c', 'i3')?.points, 33);
  repo.replaceCollection('c', [mk('x1')], false);
  assert.equal(repo.getById('c', 'i3'), null);
  assert.equal(repo.getById('c', 'x1')?.id, 'x1');
  new Repository(mem).upsert('c', mk('y1')); // anderer Tab
  repo.invalidate();
  assert.equal(repo.getById('c', 'y1')?.id, 'y1');
  mem.set('col:k', JSON.stringify([null, 5, mk('ok')]));
  repo.invalidate();
  assert.equal(repo.getById('k', 'ok')?.id, 'ok');
});

test('Repository: trim nach Schlüssel – Tombstones, dann sichere (älteste zuerst), Ausstehende zuletzt; Reihenfolge bleibt', () => {
  const repo = new Repository(new MemoryAdapter());
  const ext = (id: string, created: number, deleted = false): Item =>
    ({ ...createMeta(created, 'fremd', id), deletedAt: deleted ? created : null, points: 0 });
  // lokal ausstehend (jung, aber vorne), dann vom Pull angehängte fremde Datensätze
  repo.upsert('c', mk('own1', 900));
  repo.upsert('c', mk('own2', 950));
  repo.batch(() => {
    for (const x of [ext('f1', 100), ext('f2', 300), ext('t1', 50, true), ext('f3', 200), ext('f4', 400)]) repo.upsert('c', x, false);
  });
  const idsOf = (): string[] => repo.list('c', true).map((x) => x.id);
  repo.trim('c', 7);
  assert.deepEqual(idsOf(), ['own1', 'own2', 'f1', 'f2', 't1', 'f3', 'f4'], 'nichts zu tun');
  repo.trim('c', 6);
  assert.deepEqual(idsOf(), ['own1', 'own2', 'f1', 'f2', 'f3', 'f4'], 'Tombstone zuerst');
  repo.trim('c', 4);
  assert.deepEqual(idsOf(), ['own1', 'own2', 'f2', 'f4'], 'dann die ältesten sicheren');
  repo.trim('c', 1);
  assert.deepEqual(idsOf(), ['own2'], 'Ausstehende zuletzt, älteste zuerst');

  // Vollabgleich ausstehend: eigene Datensätze gelten trotz leerer Outbox als unsicher
  const r2 = new Repository(new MemoryAdapter());
  const dev = r2.deviceId;
  r2.batch(() => {
    r2.upsert('c', { ...createMeta(900, dev, 'mine1') }, false);
    r2.upsert('c', { ...createMeta(10, 'fremd', 'f1') }, false);
    r2.upsert('c', { ...createMeta(950, dev, 'mine2') }, false);
    r2.upsert('c', { ...createMeta(20, 'fremd', 'f2') }, false);
  });
  r2.markFullPush();
  r2.trim('c', 2);
  assert.deepEqual(r2.list('c').map((x) => x.id), ['mine1', 'mine2']);
  // ohne Vollabgleich: eigene, bereits hochgeladene sind sicher und nach Alter dran
  r2.clearFullPushIf(r2.getSyncState().fullPushGen);
  r2.upsert('c', { ...createMeta(5, 'fremd', 'f0') }, false);
  r2.trim('c', 2);
  assert.deepEqual(r2.list('c').map((x) => x.id), ['mine1', 'mine2'], 'f0 ist älter');
  r2.trim('c', 1);
  assert.deepEqual(r2.list('c').map((x) => x.id), ['mine2']);

  // kaputte Einträge zuerst; ohne createdAt zählt updatedAt
  const mem = new MemoryAdapter();
  mem.set('col:k', JSON.stringify([{ ...mk('a', 5), createdAt: undefined, updatedAt: 1 }, null, mk('b', 3)]));
  const r3 = new Repository(mem);
  r3.trim('k', 1);
  assert.deepEqual(r3.list('k').map((x) => x.id), ['b']);
});

test('Repository: onTrackedChange meldet nur protokollierte Änderungen', () => {
  const repo = new Repository(new MemoryAdapter());
  const got: string[] = [];
  const off = repo.onTrackedChange((t, id) => got.push(`${t}:${id}`));
  repo.onTrackedChange(() => { throw new Error('listener'); });
  repo.upsert('results', mk('a'));
  repo.upsert('results', mk('b'), false);
  repo.putDoc('prefs', { x: 1 });
  repo.putDoc('prefs', { x: 2 }, false);
  repo.remove('results', 'a');
  assert.deepEqual(got, ['results:a', 'prefs:prefs', 'results:a']);
  off();
  repo.upsert('results', mk('c'));
  assert.equal(got.length, 3);
});

test('Repository: Index bleibt nach trim/replace/invalidate korrekt', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  for (let i = 0; i < 6; i++) repo.upsert('c', mk(`i${i}`, 1, i));
  repo.trim('c', 3); // i3, i4, i5 bleiben
  assert.deepEqual(repo.list<Item>('c', true).map((x) => x.id), ['i3', 'i4', 'i5']);
  repo.upsert('c', mk('i4', 2, 99));
  repo.upsert('c', mk('i9', 2, 9));
  assert.deepEqual(repo.list<Item>('c', true).map((x) => `${x.id}:${x.points}`), ['i3:3', 'i4:99', 'i5:5', 'i9:9']);
  assert.equal(repo.remove('c', 'i5'), true);
  assert.equal(repo.remove('c', 'i0'), false, 'getrimmt');

  repo.replaceCollection('c', [mk('x1'), mk('x2')]);
  assert.equal(repo.remove('c', 'i3'), false);
  repo.upsert('c', mk('x2', 3, 7));
  assert.deepEqual(repo.list<Item>('c', true).map((x) => `${x.id}:${x.points}`), ['x1:0', 'x2:7']);
  assert.equal(repo.remove('c', 'x1'), true);

  // externe Änderung (anderer Tab) + invalidate
  const other = new Repository(mem);
  other.upsert('c', mk('y1'));
  repo.invalidate();
  assert.equal(repo.remove('c', 'y1'), true);
  repo.upsert('c', mk('y1', 5, 1));
  assert.equal(repo.list<Item>('c', true).filter((x) => x.id === 'y1').length, 1);
  assert.equal(repo.list<Item>('c').find((x) => x.id === 'y1')?.deletedAt ?? null, null);
});

test('Repository: clear(keep) und invalidate', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  const dev = repo.deviceId;
  repo.putDoc('a', 1);
  repo.upsert('c', mk('1'));
  const rev = repo.revision;
  repo.clear(['deviceId']);
  assert.ok(repo.revision > rev);
  assert.deepEqual(mem.keys(''), ['deviceId']);
  assert.equal(repo.getDoc('a'), null);
  assert.equal(repo.list('c').length, 0);
  assert.equal(repo.deviceId, dev);
});

/** MemoryAdapter, der Schreibzugriffe je Schlüssel zählt. */
class CountingAdapter extends MemoryAdapter {
  sets = new Map<string, number>();
  override set(key: string, value: string): void {
    this.sets.set(key, (this.sets.get(key) ?? 0) + 1);
    super.set(key, value);
  }
}

test('Repository: 5.000 Upserts neuer IDs im batch() bleiben schnell (Index statt O(n)-Suche, ein Schreibzugriff je Datensatz)', () => {
  const mem = new CountingAdapter();
  const repo = new Repository(mem);
  const t0 = performance.now();
  repo.batch(() => {
    for (let i = 0; i < 5000; i++) repo.upsert('c', mk(`id${i}`), false);
  });
  const ms = performance.now() - t0;
  assert.equal(mem.sets.size, 5000);
  assert.ok([...mem.sets].every(([k, n]) => k.startsWith('rec:c:') && n === 1), 'jeder Datensatz genau einmal');
  assert.equal(repo.list('c', true).length, 5000);
  assert.deepEqual(new Repository(mem).list('c').map((x) => x.id), repo.list('c').map((x) => x.id), 'Reihenfolge übersteht Neuladen');
  assert.ok(ms < 2000, `zu langsam: ${Math.round(ms)} ms`);
  for (let i = 0; i < 100; i++) assert.equal(repo.remove('c', `id${i * 50}`), true);
});

test('Repository: batch() schreibt jeden Schlüssel einmal am Ende; Lesezugriffe sehen Änderungen sofort', () => {
  const mem = new CountingAdapter();
  const repo = new Repository(mem);
  const idsOf = (r: Repository, c = 'c'): string[] => r.list(c).map((x) => x.id);

  // ohne Batch: jeder Aufruf schreibt sofort
  repo.upsert('c', mk('a'), false);
  repo.upsert('c', mk('b'), false);
  assert.equal(mem.sets.get('rec:c:a'), 1);
  assert.equal(mem.sets.get('rec:c:b'), 1);

  const rev = repo.revision;
  const n = repo.batch(() => {
    repo.upsert('c', mk('x'), false);
    repo.batch(() => repo.upsert('c', mk('y'), false)); // verschachtelt: erst der äußere Batch schreibt
    repo.upsert('c', mk('a', 2), false);
    repo.putDoc('d', 1, false);
    assert.deepEqual(idsOf(repo), ['a', 'b', 'x', 'y']);
    assert.equal(repo.getDoc('d'), 1);
    assert.equal(mem.get('rec:c:x'), null, 'im Batch noch nicht geschrieben');
    assert.equal(mem.sets.get('rec:c:a'), 1);
    assert.equal(mem.get('doc:d'), null);
    return 42;
  });
  assert.equal(n, 42);
  assert.ok(repo.revision > rev);
  assert.deepEqual(['a', 'b', 'x', 'y'].map((id) => mem.sets.get(`rec:c:${id}`)), [2, 1, 1, 1], 'je Schlüssel einmal am Ende');
  assert.equal(mem.sets.get('doc:d'), 1);
  assert.deepEqual(idsOf(new Repository(mem)), ['a', 'b', 'x', 'y']);

  // wirft fn, wird der bis dahin geänderte Stand trotzdem geschrieben
  assert.throws(() => repo.batch(() => {
    repo.upsert('c', mk('z'), false);
    throw new Error('kaputt');
  }), /kaputt/);
  assert.equal(new Repository(mem).list('c').length, 5);

  // invalidate() im Batch verliert nichts
  repo.batch(() => {
    repo.upsert('c', mk('i'), false);
    repo.invalidate();
    assert.equal(repo.list('c').length, 6);
  });
  assert.equal(new Repository(mem).list('c').length, 6);

  // clear() im Batch: Gesammeltes wird mitgelöscht, spätere Schreibzugriffe bleiben
  repo.batch(() => {
    repo.upsert('c', mk('j'), false);
    repo.clear();
    repo.upsert('e', mk('k'), false);
  });
  assert.deepEqual(mem.keys('rec:c:'), []);
  assert.deepEqual(idsOf(new Repository(mem), 'e'), ['k']);
});

test('Repository: angewendete Lösch-Marke persistiert und überlebt clear()', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  assert.equal(repo.getAppliedWipe(), 0);
  repo.setAppliedWipe(1234);
  assert.equal(repo.getAppliedWipe(), 1234);
  assert.equal(mem.get('wipeAt'), '1234');
  assert.equal(new Repository(mem).getAppliedWipe(), 1234);
  mem.set('wipeAt', 'kaputt');
  assert.equal(new Repository(mem).getAppliedWipe(), 0);
  repo.setAppliedWipe(99);
  const dev = repo.deviceId;
  repo.putDoc('a', 1);
  repo.clear();
  assert.deepEqual([...mem.keys('')].sort(), ['deviceId', 'wipeAt']);
  assert.equal(repo.getAppliedWipe(), 99);
  assert.equal(repo.deviceId, dev);
});
