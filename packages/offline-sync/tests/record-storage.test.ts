// Speicherformat „ein Schlüssel je Datensatz“: Migration aus `col:<name>`, Abbruchsicherheit, mehrere Tabs, Benchmark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAdapter } from '../src/adapters/idb.ts';
import type { BroadcastChannelLike } from '../src/adapters/idb.ts';
import { LocalStorageAdapter } from '../src/adapters/local-storage.ts';
import { MemoryAdapter } from '../src/adapters/memory.ts';
import { createMeta, touch } from '../src/meta.ts';
import { Repository } from '../src/repository.ts';
import type { SyncMeta } from '../src/types.ts';

type Item = SyncMeta & { points?: number };
const mk = (id: string, now = 1, points = 0): Item => ({ ...createMeta(now, 'd', id), points });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const view = (r: Repository, c = 'c'): string[] => r.list<Item>(c, true).map((x) => `${x.id}:${x.points}:${x.deletedAt ?? '-'}`);

/** Altbestand mit kaputten Einträgen und Duplikaten samt erwarteter Sicht nach der Migration. */
function legacy(n: number): { arr: unknown[]; expected: string[] } {
  const arr: unknown[] = Array.from({ length: n }, (_, i) => mk(`i${i}`, i, i));
  arr[3] = null;
  arr[n - 400] = 42;
  arr[n - 100] = { points: 1 }; // ohne ID
  arr.push({ ...touch(mk('i5', 5, 5), 9999, 'd'), points: 55 }); // neuer → gewinnt, Position bleibt 5
  arr.push(mk('i10', 0, -1)); // älter → verworfen
  const expected = arr.slice(0, n).flatMap((x) => {
    const it = x as Item | null;
    if (!it || typeof it !== 'object' || typeof it.id !== 'string') return [];
    return [`${it.id}:${it.id === 'i5' ? 55 : it.points}:-`];
  });
  return { arr, expected };
}

/** Memory-Speicher, der vor dem k-ten schreibenden Aufruf „abstürzt“ (wirft und nichts mehr ändert). */
class CrashAdapter extends MemoryAdapter {
  ops = 0;
  /** Positionen der Schreibzugriffe auf `col:` (Kürzen bzw. Entfernen der Quelle) */
  colOps: number[] = [];
  private readonly backing: MemoryAdapter;
  private readonly crashAt: number;
  constructor(backing: MemoryAdapter, crashAt = Infinity) {
    super();
    this.backing = backing;
    this.crashAt = crashAt;
  }
  private tick(k: string): void {
    if (k.startsWith('col:')) this.colOps.push(this.ops);
    if (this.ops++ >= this.crashAt) throw new Error('crash');
  }
  override get(k: string) { return this.backing.get(k); }
  override keys(p: string) { return this.backing.keys(p); }
  override set(k: string, v: string): void { this.tick(k); this.backing.set(k, v); }
  override remove(k: string): void { this.tick(k); this.backing.remove(k); }
}

function seed(arr: unknown[]): MemoryAdapter {
  const mem = new MemoryAdapter();
  mem.set('col:c', JSON.stringify(arr));
  mem.set('sync', JSON.stringify({ lastPulledAt: 7, lastPushedSeq: 0, nextSeq: 2, pending: [{ seq: 1, target: 'c', id: 'i1', op: 'upsert', at: 1 }], cursor: 'x' }));
  return mem;
}

test('Migration: col:<name> → ein Schlüssel je Datensatz, gleiche Reihenfolge, Duplikate nach compareMeta, Outbox unberührt', () => {
  const { arr, expected } = legacy(1200);
  const mem = seed(arr);
  const repo = new Repository(mem);
  assert.deepEqual(view(repo), expected);
  assert.equal(mem.get('col:c'), null, 'Altformat entfernt');
  assert.equal(mem.keys('rec:c:').length, expected.length);
  assert.equal(repo.getById<Item>('c', 'i5')?.points, 55);
  assert.deepEqual(repo.getSyncState().pending.map((p) => p.id), ['i1']);
  assert.equal(repo.getSyncState().cursor, 'x');
  assert.deepEqual(view(new Repository(mem)), expected, 'idempotent, nichts erneut zu tun');
  repo.upsert('c', mk('neu', 1, 1));
  assert.equal(view(new Repository(mem)).at(-1), 'neu:1:-', 'neue IDs hinten');
});

test('Migration: Abbruch an jeder Stelle → nächster Start hat alles, ohne Duplikate', () => {
  const { arr, expected } = legacy(1200);
  const probe = new CrashAdapter(seed(arr));
  new Repository(probe).list('c');
  const total = probe.ops;
  assert.ok(total > expected.length, `${total} Schreibzugriffe`);
  assert.equal(probe.colOps.length, 3, 'zweimal kürzen, einmal entfernen');
  const ks = new Set<number>([0, 1, 2, total - 1]);
  for (const at of probe.colOps) for (let d = -2; d <= 2; d++) if (at + d >= 0 && at + d < total) ks.add(at + d);
  for (let k = 0; k < total; k += 37) ks.add(k);
  for (const k of ks) {
    const mem = seed(arr);
    const crashed = new Repository(new CrashAdapter(mem, k));
    try { crashed.list('c'); } catch { /* Absturz während des Ladens */ }
    for (let restart = 0; restart < 2; restart++) {
      const repo = new Repository(mem);
      assert.deepEqual(view(repo), expected, `Abbruch nach ${k} Schreibzugriffen`);
      assert.equal(mem.get('col:c'), null);
    }
  }
});

test('Migration: localStorage nahe Quota – kürzt die Quelle schrittweise; was nur flüchtig liegt, bleibt in col:', () => {
  const { arr, expected } = legacy(5000); // Block = 10 % der Collection
  const raw = new Map<string, string>();
  let quota = Infinity;
  let peak = 0;
  let used = 0; // Zeichen in Schlüsseln und Werten
  const len = (k: string): number => { const v = raw.get(k); return v === undefined ? 0 : k.length + v.length; };
  const size = (): number => used;
  const fs = {
    get length() { return raw.size; },
    key: (i: number) => [...raw.keys()][i] ?? null,
    getItem: (k: string) => raw.get(k) ?? null,
    setItem(k: string, v: string) {
      const next = used - len(k) + k.length + v.length;
      if (next > quota) throw new Error('QuotaExceededError');
      used = next;
      raw.set(k, v);
      peak = Math.max(peak, used);
    },
    removeItem: (k: string) => { used -= len(k); raw.delete(k); },
  } as unknown as Storage;
  (globalThis as { localStorage?: Storage }).localStorage = fs;
  try {
    fs.setItem('p:col:c', JSON.stringify(arr));
    const before = size();
    assert.deepEqual(view(new Repository(new LocalStorageAdapter('p:'))), expected);
    const after = size();
    // Quota knapp über der größeren Fassung: doppelte Collection passt nicht, ein Block zusätzlich schon
    raw.clear();
    used = 0;
    fs.setItem('p:col:c', JSON.stringify(arr));
    quota = Math.ceil(Math.max(before, after) * 1.25);
    peak = 0;
    assert.ok(before + after > quota, 'naives Kopieren würde die Quota sprengen');
    assert.deepEqual(view(new Repository(new LocalStorageAdapter('p:'))), expected);
    assert.equal(raw.has('p:col:c'), false);
    assert.ok(peak <= quota);
    assert.deepEqual(view(new Repository(new LocalStorageAdapter('p:'))), expected, 'alles dauerhaft');

    // Quota reicht nicht für alle Datensätze: Rest nur im Memory-Fallback → Quelle bleibt, nach Neustart nichts verloren
    raw.clear();
    used = 0;
    quota = Infinity;
    fs.setItem('p:col:c', JSON.stringify(arr));
    quota = size() + 20_000;
    assert.deepEqual(view(new Repository(new LocalStorageAdapter('p:'))), expected, 'in dieser Sitzung vollständig');
    assert.ok(raw.has('p:col:c'), 'Quelle nicht entfernt');
    quota = Infinity;
    assert.deepEqual(view(new Repository(new LocalStorageAdapter('p:'))), expected, 'Neustart ohne Memory-Fallback');
    assert.equal(raw.has('p:col:c'), false, 'jetzt fertig migriert');
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

test('Migration: alter Tab schreibt col: erneut → Zusammenführen per compareMeta, nichts geht verloren', () => {
  const mem = new MemoryAdapter();
  const stale = [mk('a', 1, 1), mk('b', 1, 2), mk('c', 1, 3)];
  mem.set('col:c', JSON.stringify(stale));
  const repo = new Repository(mem, { now: () => 50 });
  repo.list('c');
  repo.remove('c', 'a'); // neue Version: Tombstone (neuer als der Altbestand)
  repo.upsert('c', mk('n1', 40, 9));
  // alte Version (veralteter Cache): ändert b, hängt x an, schreibt die ganze Collection
  mem.set('col:c', JSON.stringify([stale[0], { ...touch(stale[1]!, 60, 'alt'), points: 20 }, stale[2], mk('x', 61, 7)]));
  repo.invalidate();
  // x übernimmt die Array-Position des alten Tabs als Ordnungsnummer; Gleichstand mit n1 → nach ID
  assert.deepEqual(view(repo), ['a:1:50', 'b:20:-', 'c:3:-', 'n1:9:-', 'x:7:-']);
  assert.equal(mem.get('col:c'), null);
});

test('Datensatz-Schlüssel: unlesbarer Wert ist unsichtbar, wird per Upsert überschrieben, trim entfernt ihn zuerst', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  repo.upsert('c', mk('a', 5), false);
  repo.upsert('c', mk('b', 6), false);
  mem.set('rec:c:x', 'kaputt');
  mem.set('rec:c:y', JSON.stringify([9, mk('anders')])); // ID passt nicht zum Schlüssel
  repo.invalidate();
  assert.deepEqual(repo.list('c', true).map((x) => x.id), ['a', 'b']);
  assert.equal(repo.getById('c', 'x'), null);
  repo.upsert('c', mk('y', 7), false);
  assert.deepEqual(new Repository(mem).list('c').map((x) => x.id), ['a', 'b', 'y']);
  repo.trim('c', 3);
  assert.equal(mem.get('rec:c:x'), null, 'Platzhalter zuerst weg');
  assert.deepEqual(new Repository(mem).list('c').map((x) => x.id), ['a', 'b', 'y']);
});

test('replaceCollection: entfernt verwaiste Schlüssel, doppelte IDs nach compareMeta, Reihenfolge = Eingabe', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem);
  for (const id of ['a', 'b', 'c']) repo.upsert('c', mk(id), false);
  repo.replaceCollection('c', [mk('z', 1, 1), mk('b', 1, 2), { ...touch(mk('z', 1, 1), 5, 'd'), points: 3 }], false);
  assert.deepEqual(mem.keys('rec:c:').sort(), ['rec:c:b', 'rec:c:z']);
  assert.deepEqual(view(new Repository(mem)), ['z:3:-', 'b:2:-']);
});

function hub() {
  const members = new Set<BroadcastChannelLike>();
  return (_name: string): BroadcastChannelLike => {
    const ch: BroadcastChannelLike = {
      onmessage: null,
      postMessage(m) { for (const o of members) if (o !== ch) { const f = o.onmessage; if (f) queueMicrotask(() => f({ data: m })); } },
      close() { members.delete(ch); },
    };
    members.add(ch);
    return ch;
  };
}

test('IndexedDB: Migration im Speicherabbild, zwei Tabs per BroadcastChannel ohne verlorene Datensätze', async () => {
  const idb = new IDBFactory();
  const ch = hub();
  const o = { idb, channel: ch, lifecycle: null, debounceMs: 10 };
  const { arr, expected } = legacy(1200);
  const init = await IndexedDbAdapter.open(o);
  init.set('col:c', JSON.stringify(arr));
  await init.flush();
  init.close();

  const a = await IndexedDbAdapter.open(o);
  const b = await IndexedDbAdapter.open(o);
  const ra = new Repository(a);
  const rb = new Repository(b);
  a.onExternalChange(() => ra.invalidate());
  b.onExternalChange(() => rb.invalidate());
  assert.deepEqual(view(ra), expected);
  assert.deepEqual(view(rb), expected, 'zweiter Tab migriert sein Abbild identisch');
  await Promise.all([a.flush(), b.flush()]);
  await sleep(20);
  // beide Tabs legen gleichzeitig an, ohne den anderen zu kennen – früher gewann der letzte Schreiber der Collection
  ra.upsert('c', mk('vonA', 1, 1));
  rb.upsert('c', mk('vonB', 1, 2));
  await Promise.all([a.flush(), b.flush()]);
  await sleep(20);
  assert.equal(ra.getById('c', 'vonB')?.id, 'vonB');
  assert.equal(rb.getById('c', 'vonA')?.id, 'vonA');
  a.close();
  b.close();
  await sleep(20);
  const c = await IndexedDbAdapter.open({ ...o, channel: null });
  assert.equal(c.get('col:c'), null);
  const rc = new Repository(c);
  assert.equal(rc.list('c').length, expected.length + 2);
  assert.deepEqual(view(rc).slice(0, expected.length), expected);
  c.close();
});

/** Zählt geschriebene Zeichen je Schlüssel-Art. */
class MeterAdapter extends MemoryAdapter {
  chars = new Map<string, number>();
  override set(k: string, v: string): void {
    const kind = k.startsWith('rec:') ? 'rec' : k;
    this.chars.set(kind, (this.chars.get(kind) ?? 0) + v.length);
    super.set(k, v);
  }
}

test('Benchmark: Upsert (+ trim am Limit wie addAttempt) bei 5.000 Einträgen schreibt nur den einen Datensatz', (t) => {
  const N = 5000;
  const ROUNDS = 300;
  const mem = new MeterAdapter();
  const fill = new Repository(mem);
  const rec = (i: number): Item => ({ ...mk(`id-${String(i).padStart(6, '0')}-${'x'.repeat(24)}`, i, i), prompt: '17 · 23', given: 391, timeMs: 3456 }) as Item;
  fill.batch(() => { for (let i = 0; i < N; i++) fill.upsert('results', rec(i), false); });
  const collectionChars = JSON.stringify(fill.list('results', true)).length;

  const t0 = performance.now();
  const repo = new Repository(mem);
  assert.equal(repo.list('results').length, N);
  const hydrateMs = performance.now() - t0;

  mem.chars.clear();
  const t1 = performance.now();
  for (let i = 0; i < ROUNDS; i++) {
    repo.upsert('results', rec(N + i)); // getrackt wie addAttempt
    repo.trim('results', N);
  }
  const perOpMs = (performance.now() - t1) / ROUNDS;
  const recChars = (mem.chars.get('rec') ?? 0) / ROUNDS;
  const syncChars = (mem.chars.get('sync') ?? 0) / ROUNDS;
  const oneRecord = JSON.stringify([N + ROUNDS, rec(N)]).length;

  t.diagnostic(`Altformat: ${collectionChars} Zeichen je Upsert, dazu nochmals je trim`);
  t.diagnostic(`je Upsert+trim: Datensatz ${recChars.toFixed(0)} Zeichen, Outbox ${syncChars.toFixed(0)} Zeichen, ${perOpMs.toFixed(3)} ms`);
  t.diagnostic(`Laden von ${N} Einträgen: ${hydrateMs.toFixed(1)} ms`);

  assert.equal(repo.list('results').length, N);
  assert.ok(recChars <= oneRecord, `nur der eine Datensatz: ${recChars} > ${oneRecord}`);
  assert.ok(recChars * 1000 < collectionChars, 'mindestens drei Größenordnungen weniger als das Altformat');
  assert.ok(perOpMs < 20, `zu langsam: ${perOpMs.toFixed(2)} ms je Upsert+trim`);
  assert.ok(hydrateMs < 2000, `Laden zu langsam: ${hydrateMs.toFixed(0)} ms`);
  assert.deepEqual(view(new Repository(mem), 'results'), view(repo, 'results'), 'Neuladen ergibt denselben Stand');
});
