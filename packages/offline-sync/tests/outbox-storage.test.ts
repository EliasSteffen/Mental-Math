// Outbox „ein Schlüssel je Eintrag“ (`out:<seq>`): Migration aus `sync.pending`, Abbruchsicherheit, mehrere Tabs, Benchmark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbAdapter } from '../src/adapters/idb.ts';
import type { BroadcastChannelLike } from '../src/adapters/idb.ts';
import { MemoryAdapter } from '../src/adapters/memory.ts';
import { createMeta } from '../src/meta.ts';
import { Repository } from '../src/repository.ts';
import type { ChangeRecord, StorageAdapter, SyncMeta, SyncState } from '../src/types.ts';

type Item = SyncMeta & { points?: number };
const mk = (id: string, now = 1, points = 0): Item => ({ ...createMeta(now, 'd', id), points });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const view = (s: SyncState): string[] => s.pending.map((c) => `${c.seq}:${c.target}:${c.id}:${c.op}`);
const stored = (a: StorageAdapter): Record<string, unknown> => JSON.parse(a.get('sync') ?? 'null') as Record<string, unknown>;

/** Alter Stand: `sync` mit `pending` (Lücken in den Folgenummern, ungültige Einträge) samt erwarteter Outbox. */
function legacySync(n: number) {
  const pending: unknown[] = Array.from({ length: n }, (_, i): ChangeRecord => ({
    seq: 5 + 2 * i, target: i % 3 ? 'results' : 'sessions', id: `r${i}`, op: i % 7 ? 'upsert' : 'delete', at: 100 + i,
  }));
  pending[3] = null;
  pending[Math.floor((n * 2) / 3)] = { seq: 'x', target: 'results', id: 'kaputt', op: 'upsert', at: 1 };
  pending[n - 100] = { seq: 9999, target: 'results', op: 'upsert', at: 1 }; // ohne ID
  const expected = pending.flatMap((x) => {
    const c = x as ChangeRecord | null;
    return c && typeof c.seq === 'number' && typeof c.id === 'string' ? [`${c.seq}:${c.target}:${c.id}:${c.op}`] : [];
  });
  const sync = {
    lastPulledAt: 7, lastPushedSeq: 3, nextSeq: 5 + 2 * n, pending, cursor: 'cur', fullPushNeeded: false, fullPushGen: 4,
    docClock: { best: 500 },
  };
  return { sync, expected };
}

function seed(sync: unknown): MemoryAdapter {
  const mem = new MemoryAdapter();
  mem.set('sync', JSON.stringify(sync));
  return mem;
}

/** Memory-Speicher, der vor dem k-ten schreibenden Aufruf „abstürzt“ (wirft und nichts mehr ändert). */
class CrashAdapter extends MemoryAdapter {
  ops = 0;
  /** Positionen der Schreibzugriffe auf `sync` (Kürzen der Quelle) */
  syncOps: number[] = [];
  private readonly backing: MemoryAdapter;
  private readonly crashAt: number;
  constructor(backing: MemoryAdapter, crashAt = Infinity) {
    super();
    this.backing = backing;
    this.crashAt = crashAt;
  }
  private tick(k: string): void {
    if (k === 'sync') this.syncOps.push(this.ops);
    if (this.ops++ >= this.crashAt) throw new Error('crash');
  }
  override get(k: string) { return this.backing.get(k); }
  override keys(p: string) { return this.backing.keys(p); }
  override set(k: string, v: string): void { this.tick(k); this.backing.set(k, v); }
  override remove(k: string): void { this.tick(k); this.backing.remove(k); }
}

test('Outbox-Migration: sync.pending → out:<seq>, gleiche Folgenummern und Reihenfolge, Skalare bleiben, idempotent', () => {
  const { sync, expected } = legacySync(1200);
  const mem = seed(sync);
  const repo = new Repository(mem, { now: () => 99 });
  const st = repo.getSyncState();
  assert.deepEqual(view(st), expected);
  assert.equal(mem.keys('out:').length, expected.length);
  assert.deepEqual(JSON.parse(mem.get('out:7') ?? 'null'), { seq: 7, target: 'results', id: 'r1', op: 'upsert', at: 101 });
  assert.deepEqual(stored(mem).pending, [], 'Quelle geleert, pending bleibt als leere Liste');
  assert.deepEqual(
    [st.lastPulledAt, st.lastPushedSeq, st.nextSeq, st.cursor, st.fullPushNeeded, st.fullPushGen, st.docClock],
    [7, 3, sync.nextSeq, 'cur', false, 4, { best: 500 }],
  );
  assert.deepEqual(view(new Repository(mem).getSyncState()), expected, 'idempotent, nichts erneut zu tun');

  // getrackte Änderung an einem migrierten Ziel: neuer Eintrag, der alte Schlüssel verschwindet
  repo.upsert('results', mk('r1'));
  assert.equal(mem.get('out:7'), null);
  assert.deepEqual(JSON.parse(mem.get(`out:${sync.nextSeq}`) ?? 'null'), { seq: sync.nextSeq, target: 'results', id: 'r1', op: 'upsert', at: 99 });
  repo.ackChanges([5, sync.nextSeq]);
  assert.equal(mem.get('out:5'), null);
  const again = new Repository(mem).getSyncState();
  assert.equal(again.pending.length, expected.length - 2);
  assert.equal(again.nextSeq, sync.nextSeq + 1);
  assert.equal(again.lastPushedSeq, sync.nextSeq);
});

test('Outbox-Migration: Abbruch an jeder Stelle → nächster Start hat alle Einträge, ohne Duplikate', () => {
  const { sync, expected } = legacySync(1200);
  const probe = new CrashAdapter(seed(sync));
  new Repository(probe).getSyncState();
  const total = probe.ops;
  assert.equal(total, expected.length + 3, 'ein Schreibzugriff je Eintrag plus dreimal sync');
  assert.equal(probe.syncOps.length, 3, 'zweimal kürzen, am Ende pending: []');
  const ks = new Set<number>([0, 1, 2, total - 1]);
  for (const at of probe.syncOps) for (let d = -2; d <= 2; d++) if (at + d >= 0 && at + d < total) ks.add(at + d);
  for (let k = 0; k < total; k += 37) ks.add(k);
  for (const k of ks) {
    const mem = seed(sync);
    new Repository(new CrashAdapter(mem, k)).getSyncState(); // Absturz während des Ladens
    for (let restart = 0; restart < 2; restart++) {
      const st = new Repository(mem).getSyncState();
      assert.deepEqual(view(st), expected, `Abbruch nach ${k} Schreibzugriffen`);
      assert.equal(st.nextSeq, sync.nextSeq);
      assert.equal(st.cursor, 'cur');
      assert.deepEqual(stored(mem).pending, []);
      assert.equal(mem.keys('out:').length, expected.length);
    }
  }
});

/**
 * localStorage nahe der Quota: Nach `budget` Outbox-Einträgen landet jeder weitere nur flüchtig (`set` → false);
 * kleinere Werte wie das gekürzte `sync` passen weiterhin dauerhaft.
 */
class VolatileAdapter implements StorageAdapter {
  readonly name = 'volatile';
  readonly volatile = new Map<string, string>();
  private readonly durable: MemoryAdapter;
  private budget: number;
  constructor(durable: MemoryAdapter, budget = Infinity) {
    this.durable = durable;
    this.budget = budget;
  }
  get(k: string) { return this.durable.get(k) ?? this.volatile.get(k) ?? null; }
  set(k: string, v: string): boolean {
    if (!k.startsWith('out:') || this.budget-- > 0) {
      this.durable.set(k, v);
      this.volatile.delete(k);
      return true;
    }
    this.volatile.set(k, v);
    return false;
  }
  remove(k: string) { this.durable.remove(k); this.volatile.delete(k); }
  keys(p: string) { return [...new Set([...this.durable.keys(p), ...[...this.volatile.keys()].filter((k) => k.startsWith(p))])]; }
}

test('Outbox-Migration: Ziel nur flüchtig (set → false) → Quelle ab da nicht weiter gekürzt, nach Neustart nichts verloren', () => {
  const { sync, expected } = legacySync(1200);
  const mem = seed(sync);
  // erster Block (498 gültige Einträge) dauerhaft, vom zweiten nur ein Teil
  const first = new VolatileAdapter(mem, 600);
  assert.deepEqual(view(new Repository(first).getSyncState()), expected, 'in dieser Sitzung vollständig');
  assert.ok(first.volatile.size > 0);
  assert.equal((stored(mem).pending as unknown[]).length, 700, 'nur nach dem dauerhaften Block gekürzt');
  // Neustart: Memory-Fallback weg, Speicher wieder frei
  const st = new Repository(new VolatileAdapter(mem)).getSyncState();
  assert.deepEqual(view(st), expected);
  assert.deepEqual(stored(mem).pending, []);
  assert.equal(mem.keys('out:').length, expected.length);
});

test('Outbox: alter Tab schreibt sync.pending erneut → zusammengeführt, Folgenummern eindeutig, alter Leser sieht gültigen Stand', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem, { now: () => 5 });
  repo.upsert('c', mk('a')); // out:1
  repo.upsert('c', mk('b')); // out:2
  repo.setCursor('neu');
  // Lesart der alten Version: gültiger SyncState mit leerer Outbox und aktuellen Skalaren
  const old = stored(mem);
  assert.ok(Array.isArray(old.pending));
  assert.equal(old.cursor, 'neu');
  // alter Tab protokolliert mit seinem veralteten Zähler: Folgenummer 1 ist vergeben, c:b liegt schon unter out:
  mem.set('sync', JSON.stringify({ ...old, pending: [
    { seq: 1, target: 'c', id: 'x', op: 'upsert', at: 6 },
    { seq: 2, target: 'c', id: 'b', op: 'upsert', at: 6 },
  ] }));
  repo.invalidate();
  assert.deepEqual(view(repo.getSyncState()), ['1:c:a:upsert', '2:c:b:upsert', '3:c:x:upsert']);
  assert.equal(repo.getSyncState().cursor, 'neu');
  assert.deepEqual(stored(mem).pending, []);
  repo.upsert('c', mk('y'));
  assert.deepEqual(view(new Repository(mem).getSyncState()).at(-1), '4:c:y:upsert');
});

test('Outbox: unlesbare Einträge entfernt + Vollabgleich, doppelte target+id → nur der neueste, nextSeq über allen Schlüsseln', () => {
  const mem = new MemoryAdapter();
  mem.set('sync', JSON.stringify({ lastPulledAt: null, lastPushedSeq: 0, nextSeq: 2, pending: [] }));
  mem.set('out:4', 'kaputt');
  mem.set('out:abc', '{}');
  mem.set('out:12', JSON.stringify({ seq: 11, target: 'c', id: 'z', op: 'upsert', at: 1 })); // Nummer passt nicht
  mem.set('out:9', JSON.stringify({ seq: 9, target: 'c', id: 'a', op: 'delete', at: 2 }));
  mem.set('out:7', JSON.stringify({ seq: 7, target: 'c', id: 'a', op: 'upsert', at: 1 }));
  const st = new Repository(mem).getSyncState();
  assert.deepEqual(view(st), ['9:c:a:delete']);
  assert.deepEqual(mem.keys('out:'), ['out:9']);
  assert.equal(st.nextSeq, 13);
  assert.equal(st.fullPushNeeded, true, 'verlorene Änderung → alles hochladen');
  assert.equal(st.fullPushGen, 1);
  const again = new Repository(mem).getSyncState();
  assert.deepEqual([again.fullPushNeeded, again.fullPushGen, again.nextSeq], [true, 1, 13], 'einmalig, persistiert');
});

test('Outbox: Folgenummern bleiben nach Neuladen eindeutig (Zusammenfassen, Quittieren, Überlauf)', () => {
  const mem = new MemoryAdapter();
  const repo = new Repository(mem, { maxPending: 3 });
  repo.upsert('c', mk('a')); // 1
  repo.upsert('c', mk('b')); // 2
  repo.upsert('c', mk('a')); // 3, entfernt out:1
  assert.deepEqual(mem.keys('out:').sort(), ['out:2', 'out:3']);
  assert.equal(mem.get('sync'), null, 'getrackte Upserts schreiben sync nicht');
  assert.equal(new Repository(mem).getSyncState().nextSeq, 4);
  repo.ackChanges([2, 3]);
  assert.deepEqual(mem.keys('out:'), []);
  const after = new Repository(mem).getSyncState();
  assert.deepEqual([after.nextSeq, after.lastPushedSeq, after.pending.length], [4, 3, 0]);
  for (let i = 0; i < 4; i++) repo.upsert('c', mk(`n${i}`)); // 4..7, Überlauf beim vierten
  assert.deepEqual(mem.keys('out:'), []);
  const full = new Repository(mem).getSyncState();
  assert.deepEqual([full.fullPushNeeded, full.fullPushGen, full.nextSeq, full.pending.length], [true, 1, 8, 0]);
});

/** Protokolliert schreibende Aufrufe. */
class CountingAdapter extends MemoryAdapter {
  sets: string[] = [];
  override set(k: string, v: string): void { this.sets.push(k); super.set(k, v); }
}

test('Outbox: batch() schreibt jeden Schlüssel einmal, clear() entfernt die Outbox, clear([sync]) behält sie', () => {
  const mem = new CountingAdapter();
  const repo = new Repository(mem);
  repo.upsert('c', mk('a')); // out:1
  mem.sets = [];
  repo.batch(() => {
    for (let i = 0; i < 5; i++) repo.upsert('c', mk('a', 1, i)); // 2..6
    repo.upsert('c', mk('b')); // 7
  });
  assert.deepEqual(mem.sets.sort(), ['out:6', 'out:7', 'rec:c:a', 'rec:c:b']);
  assert.deepEqual(mem.keys('out:').sort(), ['out:6', 'out:7']);
  assert.deepEqual(view(repo.getSyncState()), ['6:c:a:upsert', '7:c:b:upsert']);

  repo.replaceCollection('c', [mk('a'), mk('b'), mk('c'), mk('a')]);
  assert.deepEqual(view(new Repository(mem).getSyncState()), ['9:c:b:upsert', '10:c:c:upsert', '11:c:a:upsert']);

  repo.setCursor('k');
  repo.clear(['sync']);
  assert.deepEqual(view(repo.getSyncState()), ['9:c:b:upsert', '10:c:c:upsert', '11:c:a:upsert'], 'Outbox gehört zu sync');
  assert.equal(repo.getSyncState().cursor, 'k');
  repo.clear();
  assert.deepEqual(mem.keys('out:'), []);
  const empty = repo.getSyncState();
  assert.deepEqual([empty.pending.length, empty.nextSeq, empty.cursor], [0, 1, null]);
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

test('IndexedDB: Migration im Speicherabbild, zwei Tabs sehen Outbox-Einträge und Quittungen des anderen', async () => {
  const idb = new IDBFactory();
  const ch = hub();
  const o = { idb, channel: ch, lifecycle: null, debounceMs: 10 };
  const { sync, expected } = legacySync(300);
  const init = await IndexedDbAdapter.open(o);
  init.set('sync', JSON.stringify(sync));
  await init.flush();
  init.close();

  const a = await IndexedDbAdapter.open(o);
  const b = await IndexedDbAdapter.open(o);
  const ra = new Repository(a);
  const rb = new Repository(b);
  a.onExternalChange(() => ra.invalidate());
  b.onExternalChange(() => rb.invalidate());
  assert.deepEqual(view(ra.getSyncState()), expected);
  assert.deepEqual(view(rb.getSyncState()), expected, 'zweiter Tab migriert sein Abbild identisch');
  await Promise.all([a.flush(), b.flush()]);
  await sleep(20);

  const n = sync.nextSeq;
  ra.upsert('results', mk('vonA'));
  await a.flush();
  await sleep(20);
  assert.equal(rb.getSyncState().pending.at(-1)?.id, 'vonA');
  rb.upsert('results', mk('vonB'));
  rb.ackChanges([5, n]);
  await b.flush();
  await sleep(20);
  const sa = ra.getSyncState();
  assert.deepEqual(view(sa).at(-1), `${n + 1}:results:vonB:upsert`);
  assert.equal(sa.pending.length, expected.length, 'zwei quittiert, zwei neu');
  assert.ok(!sa.pending.some((c) => c.seq === 5 || c.seq === n));
  a.close();
  b.close();
  await sleep(20);
  const c = await IndexedDbAdapter.open({ ...o, channel: null });
  const st = new Repository(c).getSyncState();
  assert.deepEqual(view(st), view(sa));
  assert.equal(st.nextSeq, n + 2);
  c.close();
});

/** Zählt geschriebene Zeichen je Schlüssel-Art. */
class MeterAdapter extends MemoryAdapter {
  chars = new Map<string, number>();
  override set(k: string, v: string): void {
    const kind = k.startsWith('rec:') ? 'rec' : k.startsWith('out:') ? 'out' : k;
    this.chars.set(kind, (this.chars.get(kind) ?? 0) + v.length);
    super.set(k, v);
  }
}

test('Benchmark: getrackter Upsert bei 1.700 offenen Einträgen schreibt nur Datensatz und einen Outbox-Eintrag', (t) => {
  const OPEN = 1700;
  const ROUNDS = 250; // bleibt unter MAX_PENDING (2000)
  const mem = new MeterAdapter();
  const fill = new Repository(mem);
  const rec = (i: number): Item => ({ ...mk(`id-${String(i).padStart(6, '0')}-${'x'.repeat(24)}`, i, i), prompt: '17 · 23', given: 391, timeMs: 3456 }) as Item;
  fill.batch(() => { for (let i = 0; i < OPEN; i++) fill.upsert('results', rec(i)); });
  const legacyChars = JSON.stringify(fill.getSyncState()).length; // so viel schrieb das Altformat je getracktem Upsert

  const t0 = performance.now();
  const repo = new Repository(mem);
  assert.equal(repo.getSyncState().pending.length, OPEN);
  const loadMs = performance.now() - t0;

  const measure = (ids: number[]): { out: number; sync: number; rec: number; ms: number } => {
    mem.chars.clear();
    const t1 = performance.now();
    for (const i of ids) {
      repo.upsert('results', rec(i)); // getrackt wie addAttempt
      repo.trim('results', 5000);
    }
    const ms = (performance.now() - t1) / ids.length;
    const per = (k: string): number => (mem.chars.get(k) ?? 0) / ids.length;
    return { out: per('out'), sync: per('sync'), rec: per('rec'), ms };
  };
  const fresh = measure(Array.from({ length: ROUNDS }, (_, i) => OPEN + i)); // neue IDs
  const again = measure(Array.from({ length: ROUNDS }, (_, i) => i)); // offene IDs: fasst zusammen
  const oneChange = JSON.stringify({ seq: 99999, target: 'results', id: rec(0).id, op: 'upsert', at: Date.now() }).length;

  t.diagnostic(`Altformat: Outbox ${legacyChars} Zeichen je getracktem Upsert`);
  t.diagnostic(`neue ID: Datensatz ${fresh.rec.toFixed(0)}, Outbox ${fresh.out.toFixed(0)}, sync ${fresh.sync.toFixed(0)} Zeichen, ${fresh.ms.toFixed(3)} ms`);
  t.diagnostic(`offene ID: Datensatz ${again.rec.toFixed(0)}, Outbox ${again.out.toFixed(0)}, sync ${again.sync.toFixed(0)} Zeichen, ${again.ms.toFixed(3)} ms`);
  t.diagnostic(`Laden von ${OPEN} Outbox-Einträgen: ${loadMs.toFixed(1)} ms`);

  for (const m of [fresh, again]) {
    assert.ok(m.out <= oneChange, `nur der eine Outbox-Eintrag: ${m.out} > ${oneChange}`);
    assert.equal(m.sync, 0, 'sync wird nicht geschrieben');
    assert.ok(m.out * 500 < legacyChars, 'mindestens zweieinhalb Größenordnungen weniger als das Altformat');
    assert.ok(m.ms < 20, `zu langsam: ${m.ms.toFixed(2)} ms je Upsert+trim`);
  }
  assert.ok(loadMs < 2000, `Laden zu langsam: ${loadMs.toFixed(0)} ms`);
  const st = repo.getSyncState();
  assert.equal(st.pending.length, OPEN + ROUNDS);
  assert.deepEqual(view(new Repository(mem).getSyncState()), view(st), 'Neuladen ergibt dieselbe Outbox');
});
