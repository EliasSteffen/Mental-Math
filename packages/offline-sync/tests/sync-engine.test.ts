import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../src/adapters/memory.ts';
import { SyncEngine, WIPE_DOC } from '../src/engine.ts';
import { SyncError } from '../src/errors.ts';
import { compareMeta } from '../src/merge.ts';
import { createMeta } from '../src/meta.ts';
import { Repository } from '../src/repository.ts';
import type { PullPage, RemoteDoc, RemoteSyncProvider, SyncErrorKind, SyncRecord } from '../src/types.ts';
import { testSchema } from './test-schema.ts';

// ---------- FakeServer: bildet die SQL-Semantik nach ----------
type Method = 'upsertRecords' | 'upsertDocs' | 'pull' | 'deleteAll';

class FakeServer implements RemoteSyncProvider {
  readonly name = 'fake';
  counter = 0;
  records = new Map<string, { collection: string; item: SyncRecord; seq: number }>();
  docs = new Map<string, { doc: RemoteDoc; seq: number }>();
  rejectIds = new Set<string>();
  pullCalls = 0;
  private fails: Array<{ kind: SyncErrorKind | 'boom'; method?: Method }> = [];

  failNext(kind: SyncErrorKind | 'boom', method?: Method): void { this.fails.push({ kind, method }); }

  private check(method: Method): void {
    const i = this.fails.findIndex((f) => f.method === undefined || f.method === method);
    if (i < 0) return;
    const [f] = this.fails.splice(i, 1);
    if (f?.kind === 'boom') throw new Error('boom');
    if (f) throw new SyncError(f.kind);
  }

  upsertRecords(collection: string, items: readonly SyncRecord[]): Promise<void> {
    try {
      this.check('upsertRecords');
      if (items.some((i) => this.rejectIds.has(i.id))) throw new SyncError('invalid');
      for (const item of items) {
        const key = `${collection}:${item.id}`;
        const old = this.records.get(key);
        if (old && compareMeta(item, old.item) < 0) continue; // LWW wie der Trigger
        this.records.set(key, { collection, item: structuredClone(item), seq: ++this.counter });
      }
      return Promise.resolve();
    } catch (e) { return Promise.reject(e as Error); }
  }

  upsertDocs(docs: readonly RemoteDoc[]): Promise<void> {
    try {
      this.check('upsertDocs');
      for (const doc of docs) {
        const old = this.docs.get(doc.name);
        if (old && (doc.updatedAt < old.doc.updatedAt || (doc.updatedAt === old.doc.updatedAt && doc.deviceId < old.doc.deviceId))) continue;
        this.docs.set(doc.name, { doc: structuredClone(doc), seq: ++this.counter });
      }
      return Promise.resolve();
    } catch (e) { return Promise.reject(e as Error); }
  }

  pull(cursor: string | null, o: { limit: number; rewind: boolean }): Promise<PullPage> {
    try {
      this.check('pull');
      this.pullCalls++;
      const n = cursor ? (JSON.parse(cursor) as { n: number }).n : 0;
      const since = o.rewind ? Math.max(0, n - 3) : n;
      const all = [
        ...[...this.records.values()].map((r) => ({ seq: r.seq, r })),
        ...[...this.docs.values()].map((d) => ({ seq: d.seq, d })),
      ].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq);
      const take = all.slice(0, o.limit);
      const last = take.at(-1)?.seq ?? n;
      const page: PullPage = {
        records: take.flatMap((x) => ('r' in x ? [{ collection: x.r.collection, item: structuredClone(x.r.item) }] : [])),
        docs: take.flatMap((x) => ('d' in x ? [structuredClone(x.d.doc)] : [])),
        cursor: JSON.stringify({ n: Math.max(n, last) }),
        hasMore: all.length > take.length,
      };
      return Promise.resolve(page);
    } catch (e) { return Promise.reject(e as Error); }
  }

  deleteAll(): Promise<void> {
    try {
      this.check('deleteAll');
      this.records.clear();
      this.docs.clear();
      return Promise.resolve();
    } catch (e) { return Promise.reject(e as Error); }
  }
}

// ---------- Helfer ----------
const clock = { t: 1000 };
type Rec = SyncRecord & { v?: number };

interface Dev { repo: Repository; engine: SyncEngine; id: string }
function device(server: RemoteSyncProvider | null, o: { pageSize?: number; chunkSize?: number; onRemoteWipe?: (at: number) => void } = {}): Dev {
  const repo = new Repository(new MemoryAdapter(), { now: () => clock.t });
  const id = repo.deviceId;
  const engine = new SyncEngine(repo, { schema: testSchema, deviceId: () => id, now: () => clock.t, ...o });
  engine.setProvider(server);
  return { repo, engine, id };
}
const add = (d: Dev, col: string, id: string, v = 1): void => {
  d.repo.upsert<Rec>(col, { v, ...createMeta(clock.t, d.id, id) });
};
const ids = (d: Dev, c: string): string[] => d.repo.list(c, true).map((x) => x.id).sort();

test('zwei Geräte konvergieren (Records, LWW-Dokument, perDevice-Dokument)', async () => {
  const server = new FakeServer();
  const a = device(server);
  const b = device(server);
  add(a, 'a', 'r1'); add(a, 'a', 'r2'); add(a, 'b', 's1');
  add(b, 'a', 'r3'); add(b, 'b', 's2');
  a.repo.putDoc('prefs', { theme: 'neon', keypad: 'on', ver: '1', updatedAt: 100 });
  b.repo.putDoc('prefs', { theme: 'oled', keypad: 'off', ver: '2', updatedAt: 200 });
  a.repo.putDoc('time', { d1: 1000 });
  b.repo.putDoc('time', { d1: 500 });

  for (let i = 0; i < 2; i++) {
    assert.equal((await a.engine.syncNow()).phase, 'idle');
    assert.equal((await b.engine.syncNow()).phase, 'idle');
  }
  for (const d of [a, b]) {
    assert.deepEqual(ids(d, 'a'), ['r1', 'r2', 'r3']);
    assert.deepEqual(ids(d, 'b'), ['s1', 's2']);
    assert.equal(d.engine.pendingCount(), 0);
    assert.equal(d.repo.getDoc<{ theme: string }>('prefs')?.theme, 'oled');
  }
  assert.equal(a.repo.getDoc<{ keypad: string }>('prefs')?.keypad, 'on');
  assert.equal(b.repo.getDoc<{ keypad: string }>('prefs')?.keypad, 'off');
  assert.deepEqual(a.repo.getDoc('time'), { d1: 1000 });
  assert.deepEqual(b.repo.getDoc('time'), { d1: 500 });
  assert.deepEqual(a.repo.getDoc('timeRemote'), { [b.id]: { d1: 500 } });
  assert.deepEqual(b.repo.getDoc('timeRemote'), { [a.id]: { d1: 1000 } });
  assert.ok(!('keypad' in (server.docs.get('prefs')?.doc.data ?? {})));
  assert.ok(server.docs.has(`time:${a.id}`) && server.docs.has(`time:${b.id}`));

  // Ruhezustand: nichts mehr zu tun
  const again = await a.engine.syncNow();
  assert.equal(again.pushed, 0);
  assert.equal(again.pulled, 0); // idempotenter Re-Pull (Rewind) ändert nichts
});

test('Tombstone wird propagiert', async () => {
  const server = new FakeServer();
  const a = device(server);
  const b = device(server);
  add(a, 'a', 'r1');
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.equal(b.repo.list('a').length, 1);
  clock.t += 1000;
  a.repo.remove('a', 'r1');
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.equal(b.repo.list('a').length, 0);
  const item = b.repo.list('a', true)[0];
  assert.ok(item && item.deletedAt !== null);
});

test('offline: pending bleibt, nächster Lauf klappt', async () => {
  const server = new FakeServer();
  const a = device(server);
  add(a, 'a', 'r1');
  server.failNext('offline');
  let st = await a.engine.syncNow();
  assert.equal(st.phase, 'offline');
  assert.equal(st.lastError, 'offline');
  assert.equal(st.pending, 1);
  server.failNext('offline', 'upsertRecords');
  st = await a.engine.syncNow();
  assert.equal(st.phase, 'offline');
  assert.equal(a.engine.pendingCount(), 1);
  st = await a.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(st.lastError, null);
  assert.equal(st.pending, 0);
  assert.ok(st.lastSyncAt !== null);
  assert.equal(server.records.size, 1);
});

test('auth und server/unbekannte Fehler → phase error', async () => {
  const server = new FakeServer();
  const a = device(server);
  add(a, 'a', 'r1');
  server.failNext('auth');
  let st = await a.engine.syncNow();
  assert.deepEqual([st.phase, st.lastError, st.pending], ['error', 'auth', 1]);
  server.failNext('boom', 'upsertRecords');
  st = await a.engine.syncNow();
  assert.deepEqual([st.phase, st.lastError, st.pending], ['error', 'server', 1]);
  server.failNext('invalid', 'pull');
  st = await a.engine.syncNow();
  assert.deepEqual([st.phase, st.lastError], ['error', 'invalid']);
});

test('ohne Provider: disabled', async () => {
  const a = device(null);
  assert.equal(a.engine.hasProvider(), false);
  add(a, 'a', 'r1');
  const st = await a.engine.syncNow();
  assert.equal(st.phase, 'disabled');
  assert.equal(st.pending, 1);
});

test('invalid-Paket: Einzelversuch, schlechter Datensatz wird abgelehnt und bestätigt', async () => {
  const server = new FakeServer();
  const a = device(server);
  add(a, 'a', 'good1'); add(a, 'a', 'bad'); add(a, 'a', 'good2');
  server.rejectIds.add('bad');
  const st = await a.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(st.rejected, 1);
  assert.equal(st.pushed, 2);
  assert.equal(st.pending, 0);
  assert.deepEqual([...server.records.keys()].sort(), ['a:good1', 'a:good2']);
});

test('Überlauf → fullPushNeeded → Vollabgleich lädt alles hoch', async () => {
  const server = new FakeServer();
  const a = device(server);
  for (let i = 0; i < 2100; i++) add(a, 'b', `r${i}`);
  assert.equal(a.repo.getSyncState().fullPushNeeded, true);
  assert.ok(a.engine.pendingCount() < 200);
  a.repo.upsert('a', { v: 1, ...createMeta(clock.t, a.id, 'x0') }, false);
  a.repo.putDoc('best', { '1': 4 }, false);
  a.repo.putDoc('notInSchema', { z: 1 }, false);
  const st = await a.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(a.repo.getSyncState().fullPushNeeded, false);
  assert.equal(a.engine.pendingCount(), 0);
  assert.equal([...server.records.values()].filter((r) => r.collection === 'b').length, 2100);
  assert.ok(server.records.has('a:x0'));
  assert.ok(server.docs.has('best'));
  assert.ok(!server.docs.has('notInSchema'));
});

test('Vollabgleich bleibt bei Fehler erhalten', async () => {
  const server = new FakeServer();
  const a = device(server);
  a.repo.upsert('a', { v: 1, ...createMeta(1, a.id, 'x') }, false);
  a.repo.markFullPush();
  server.failNext('offline', 'upsertRecords');
  assert.equal((await a.engine.syncNow()).phase, 'offline');
  assert.equal(a.repo.getSyncState().fullPushNeeded, true);
  await a.engine.syncNow();
  assert.equal(a.repo.getSyncState().fullPushNeeded, false);
  assert.ok(server.records.has('a:x'));
});

test('Dokument/Target außerhalb des Schemas wird nie hochgeladen, aber bestätigt', async () => {
  const server = new FakeServer();
  const a = device(server);
  a.repo.putDoc('profile', { displayName: 'x' });
  a.repo.putDoc('timeRemote', { q: { d: 1 } });
  a.repo.upsert('unknown', { ...createMeta(1, a.id, 'u1') });
  assert.equal(a.engine.pendingCount(), 3);
  await a.engine.syncNow();
  assert.equal(a.engine.pendingCount(), 0);
  assert.equal(server.docs.size, 0);
  assert.equal(server.records.size, 0);
  a.repo.markFullPush();
  await a.engine.syncNow();
  assert.equal(server.docs.size, 0);
  assert.equal(server.records.size, 0);
});

test('unbekannte Remote-Dokumente und -Collections werden ignoriert', async () => {
  const server = new FakeServer();
  const a = device(server);
  await server.upsertDocs([
    { name: 'mystery', data: { x: 1 }, updatedAt: 1, deviceId: 'o' },
    { name: 'time', data: { x: 1 }, updatedAt: 1, deviceId: 'o' }, // perDevice braucht `:id`
    { name: 'best:x', data: { x: 1 }, updatedAt: 1, deviceId: 'o' }, // nicht perDevice
  ]);
  await server.upsertRecords('zzz', [{ ...createMeta(1, 'o', 'z1') }]);
  const st = await a.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(st.pulled, 0);
  assert.equal(a.repo.getDoc('mystery'), null);
  assert.equal(a.repo.getDoc('best'), null);
  assert.equal(a.repo.getDoc('timeRemote'), null);
  assert.equal(a.repo.list('zzz', true).length, 0);
});

test('Pagination mit kleiner Seitengröße und Chunking', async () => {
  const server = new FakeServer();
  const a = device(server, { chunkSize: 3 });
  const b = device(server, { pageSize: 2 });
  for (let i = 0; i < 7; i++) add(a, 'b', `r${i}`);
  await a.engine.syncNow();
  server.pullCalls = 0;
  const st = await b.engine.syncNow();
  assert.equal(st.pulled, 7);
  assert.equal(ids(b, 'b').length, 7);
  assert.ok(server.pullCalls >= 4);
  assert.deepEqual(b.repo.getSyncState().cursor, JSON.stringify({ n: server.counter }));
  assert.equal((await b.engine.syncNow()).pulled, 0);
});

test('Collection-Limit: nach dem Pull auf limit gekürzt, Tombstones zuerst', async () => {
  const server = new FakeServer();
  const a = device(server);
  const b = device(server);
  for (let i = 0; i < 60; i++) add(a, 'a', `r${String(i).padStart(2, '0')}`);
  await a.engine.syncNow();
  assert.equal(ids(a, 'a').length, 50, 'auch der Absender kürzt nach dem Pull');
  await b.engine.syncNow();
  assert.equal(ids(b, 'a').length, 50);
  // unbegrenzte Collection bleibt vollständig
  for (let i = 0; i < 60; i++) add(a, 'b', `s${i}`);
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.equal(ids(b, 'b').length, 60);
});

test('LWW auf Records: neuere Remote-Version gewinnt, ältere nicht', async () => {
  const server = new FakeServer();
  const a = device(server);
  const b = device(server);
  add(a, 'a', 'r1');
  await a.engine.syncNow();
  await b.engine.syncNow();
  clock.t += 100;
  const cur = b.repo.list<Rec>('a')[0];
  assert.ok(cur);
  b.repo.upsert<Rec>('a', { ...cur, v: 999, updatedAt: clock.t, rev: cur.rev + 1, deviceId: b.id });
  await b.engine.syncNow();
  await a.engine.syncNow();
  assert.equal(a.repo.list<Rec>('a')[0]?.v, 999);
  const old = { ...cur, v: 1 };
  await server.upsertRecords('a', [old]);
  assert.equal(server.records.get('a:r1')?.item.v, 999);
});

test('wipeRemote leert den Server und setzt den Cursor zurück', async () => {
  const server = new FakeServer();
  const a = device(server);
  add(a, 'a', 'r1');
  await a.engine.syncNow();
  assert.ok(a.repo.getSyncState().cursor !== null);
  await a.engine.wipeRemote();
  assert.equal(server.records.size, 0);
  assert.equal(a.repo.getSyncState().cursor, null);
  server.failNext('auth', 'deleteAll');
  await assert.rejects(() => a.engine.wipeRemote(), (e: unknown) => e instanceof SyncError && e.kind === 'auth');
});

test('Eigenes perDevice-Remote-Dokument wird per merge eingemischt und löst bei Gleichheit keinen Push aus', async () => {
  const server = new FakeServer();
  const a = device(server);
  await server.upsertDocs([{ name: `time:${a.id}`, data: { d1: 50, d2: 7 }, updatedAt: 1, deviceId: a.id }]);
  a.repo.putDoc('time', { d1: 10 }, false);
  const st = await a.engine.syncNow();
  assert.deepEqual(a.repo.getDoc('time'), { d1: 50, d2: 7 });
  assert.equal(st.pending, 0);
  assert.equal(st.pushed, 0);
});

test('Dokument-Push: updatedAt aus spec.updatedAt, sonst now; toRemote entfernt lokale Schlüssel', async () => {
  const server = new FakeServer();
  const a = device(server);
  a.repo.putDoc('prefs', { theme: 'x', keypad: 'on', updatedAt: 42 });
  a.repo.putDoc('best', { l1: 3 });
  await a.engine.syncNow();
  const prefs = server.docs.get('prefs')?.doc;
  assert.deepEqual(prefs?.data, { theme: 'x', updatedAt: 42 });
  assert.equal(prefs?.updatedAt, 42);
  assert.equal(server.docs.get('best')?.doc.updatedAt, clock.t);
  assert.equal(prefs?.deviceId, a.id);
});

test('Merge-Ergebnis gleich Remote löst keinen Rück-Upload aus (kein Ping-Pong)', async () => {
  const server = new FakeServer();
  const a = device(server);
  const b = device(server);
  a.repo.putDoc('log', { k1: { ts: 5, v: 'a' } });
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.deepEqual(b.repo.getDoc('log'), { k1: { ts: 5, v: 'a' } });
  assert.equal(b.engine.pendingCount(), 0, 'angewendet ohne Tracking');
  clock.t += 10; // sonst entscheidet die zufällige Geräte-ID über den Server-Stand
  b.repo.putDoc('log', { k1: { ts: 5, v: 'a' }, k2: { ts: 1, v: 'b' } });
  await b.engine.syncNow();
  await a.engine.syncNow();
  assert.deepEqual(a.repo.getDoc('log'), { k1: { ts: 5, v: 'a' }, k2: { ts: 1, v: 'b' } });
  assert.equal(a.engine.pendingCount(), 0);
});

// ---------- Lösch-Markierung ----------
function wipeDevice(server: FakeServer, o: { pageSize?: number; throws?: boolean } = {}): Dev & { wipes: number[] } {
  const wipes: number[] = [];
  let d: Dev | null = null;
  d = device(server, {
    pageSize: o.pageSize,
    onRemoteWipe: (at) => {
      wipes.push(at);
      if (o.throws) throw new Error('reset failed');
      d?.repo.clear();
    },
  });
  return { ...d, wipes };
}

test('Löschen auf allen Geräten: B setzt zurück, Ausstehendes wird nicht hochgeladen', async () => {
  const server = new FakeServer();
  const a = wipeDevice(server);
  const b = wipeDevice(server);
  add(a, 'a', 'r1');
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.deepEqual(ids(b, 'a'), ['r1']);
  add(b, 'a', 'offline1'); // B offline: ausstehend
  clock.t += 10;
  await a.engine.wipeRemote();
  assert.deepEqual([...server.docs.keys()], [WIPE_DOC]);
  assert.equal(server.records.size, 0);
  const at = a.repo.getAppliedWipe();
  assert.equal(at, clock.t);
  await a.engine.syncNow();
  assert.equal(a.wipes.length, 0, 'eigene Marke löst keinen Reset aus');

  const st = await b.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.deepEqual(b.wipes, [at]);
  assert.deepEqual(ids(b, 'a'), []);
  assert.equal(server.records.size, 0, 'Altes nicht hochgeladen');
  assert.equal(b.repo.getAppliedWipe(), at);
  assert.ok(st.pulled >= 1);

  // (b) neue Daten von A erreichen B ohne erneuten Reset
  clock.t += 10;
  add(a, 'a', 'neu');
  await a.engine.syncNow();
  await b.engine.syncNow();
  assert.deepEqual(ids(b, 'a'), ['neu']);
  assert.equal(b.wipes.length, 1);
});

test('Löschen: neues Gerät mit gesetzter Marke behält seine Daten', async () => {
  const server = new FakeServer();
  const a = wipeDevice(server);
  await a.engine.wipeRemote();
  const c = wipeDevice(server);
  add(c, 'a', 'mine');
  c.repo.setAppliedWipe(Date.now() + 1000);
  const st = await c.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(c.wipes.length, 0);
  assert.deepEqual(ids(c, 'a'), ['mine']);
  assert.ok(server.records.has('a:mine'));
});

test('Löschen: Fehler im onRemoteWipe -> Status error, nichts hochgeladen', async () => {
  const server = new FakeServer();
  const a = wipeDevice(server);
  await a.engine.wipeRemote();
  const b = wipeDevice(server, { throws: true });
  add(b, 'a', 'x');
  const st = await b.engine.syncNow();
  assert.equal(st.phase, 'error');
  assert.equal(st.lastError, 'server');
  assert.equal(server.records.size, 0);
  assert.equal(b.repo.getAppliedWipe(), 0);
});

test('Löschen: Marke auf späterer Seite -> Reset und korrektes Neuladen', async () => {
  const server = new FakeServer();
  const a = wipeDevice(server);
  const b = wipeDevice(server, { pageSize: 2 });
  for (let i = 0; i < 4; i++) add(b, 'a', `old${i}`);
  await b.engine.syncNow();
  clock.t += 10;
  await a.engine.wipeRemote();
  clock.t += 10;
  for (let i = 0; i < 3; i++) add(a, 'a', `n${i}`); // Marke hat kleinere seq als diese
  await a.engine.syncNow();
  const seqWipe = server.docs.get(WIPE_DOC)?.seq ?? 0;
  assert.ok(seqWipe < server.counter);
  const st = await b.engine.syncNow();
  assert.equal(st.phase, 'idle');
  assert.equal(b.wipes.length, 1);
  assert.deepEqual(ids(b, 'a'), ['n0', 'n1', 'n2']);
  assert.equal((await b.engine.syncNow()).pulled, 0);
});
