import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStorageAdapter, MemoryAdapter, createDefaultAdapter } from '../src/data/adapters.ts';
import { getDeviceId, newId } from '../src/data/ids.ts';
import { createMeta, tombstone, touch } from '../src/data/meta.ts';
import { MAX_PENDING, Repository } from '../src/data/repository.ts';
import { NoopSyncProvider, SyncEngine } from '../src/data/sync.ts';
import { migrateV1 } from '../src/data/migrate.ts';
import { createLegacyStore } from '../src/data/adapters.ts';
import {
  addAttempt, addSession, exportJSON, getAttempts, getProfile, getSessions, getSettings, getSyncState, invalidateCache,
  resetAll, setSettings, updateProfile, DEFAULT_SETTINGS, getReviews, setReviews,
} from '../src/data/storage.ts';
import type { Attempt, GameResult, RemoteSyncProvider, Session } from '../src/types.ts';

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

function withLS(fs: Storage, fn: () => void): void {
  resetAll();
  (globalThis as { localStorage?: Storage }).localStorage = fs;
  invalidateCache();
  try {
    fn();
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetAll();
  }
}

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 1000, targetMs: 2000, weight: 1, points: 100, ...o,
});

// ---------- Adapter ----------
test('Adapter: Memory und localStorage (Prefix mm:v3:, keys ohne Prefix)', () => {
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
    const a = new LocalStorageAdapter();
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
  const a = createDefaultAdapter();
  a.set('k', 'v'); // kein localStorage vorhanden
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

// ---------- IDs & Meta ----------
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
});

test('Meta: createMeta, touch, tombstone', () => {
  const m = createMeta(100, 'dev-a', 'id-1');
  assert.deepEqual(m, { id: 'id-1', createdAt: 100, updatedAt: 100, deletedAt: null, deviceId: 'dev-a', rev: 1 });
  const t = touch(m, 200, 'dev-b');
  assert.deepEqual(t, { ...m, updatedAt: 200, rev: 2, deviceId: 'dev-b' });
  assert.equal(m.rev, 1, 'Original unverändert');
  const d = tombstone(t, 300, 'dev-b');
  assert.equal(d.deletedAt, 300);
  assert.equal(d.rev, 3);
  assert.equal(d.updatedAt, 300);
  assert.equal(d.createdAt, 100);
});

// ---------- Repository ----------
test('Repository: CRUD, Soft-Delete, Cache', () => {
  let reads = 0;
  const mem = new MemoryAdapter();
  const counting = { name: 'c', get: (k: string) => { reads++; return mem.get(k); }, set: (k: string, v: string) => mem.set(k, v), remove: (k: string) => mem.remove(k), keys: (p: string) => mem.keys(p) };
  let now = 1000;
  const repo = new Repository(counting, () => now);
  assert.equal(repo.getDoc('x'), null);
  repo.putDoc('x', { a: 1 });
  assert.deepEqual(repo.getDoc('x'), { a: 1 });

  const mk = (id: string): GameResult => ({ ...att(), ...createMeta(now, repo.deviceId, id) });
  repo.upsert('results', mk('r1'));
  repo.upsert('results', mk('r2'));
  assert.equal(repo.list('results').length, 2);
  repo.upsert('results', { ...mk('r1'), points: 5 });
  assert.equal(repo.list<GameResult>('results').length, 2, 'Upsert ersetzt per id');
  assert.equal(repo.list<GameResult>('results')[0]?.points, 5);

  now = 2000;
  assert.equal(repo.remove('results', 'r1'), true);
  assert.equal(repo.remove('results', 'r1'), false);
  assert.equal(repo.remove('results', 'nope'), false);
  assert.deepEqual(repo.list<GameResult>('results').map((x) => x.id), ['r2']);
  const all = repo.list<GameResult>('results', true);
  assert.equal(all.length, 2);
  const t = all.find((x) => x.id === 'r1');
  assert.equal(t?.deletedAt, 2000);
  assert.equal(t?.rev, 2);

  const before = reads;
  for (let i = 0; i < 20; i++) { repo.list('results'); repo.getDoc('x'); }
  assert.equal(reads, before, 'Lesezugriffe aus dem Cache');

  repo.trim('results', 1);
  assert.deepEqual(repo.list<GameResult>('results', true).map((x) => x.id), ['r2'], 'Tombstones zuerst entfernt');
  // persistiert
  const repo2 = new Repository(mem);
  assert.equal(repo2.list('results').length, 1);
});

test('Repository: Änderungsprotokoll fasst zusammen und ist auf 2000 begrenzt', () => {
  let now = 1;
  const repo = new Repository(new MemoryAdapter(), () => now);
  const item = (id: string): GameResult => ({ ...att(), ...createMeta(now, 'd', id) });
  repo.upsert('results', item('a'));
  now = 2;
  repo.upsert('results', item('a'));
  repo.putDoc('settings', { x: 1 });
  repo.putDoc('settings', { x: 2 });
  repo.putDoc('misc', 1); // kein Sync-Dokument → nicht protokolliert
  let s = repo.getSyncState();
  assert.equal(s.pending.length, 2);
  assert.deepEqual(s.pending.map((c) => `${c.target}:${c.id}:${c.op}`), ['results:a:upsert', 'settings:settings:upsert']);
  now = 3;
  repo.remove('results', 'a');
  s = repo.getSyncState();
  assert.equal(s.pending.length, 2);
  assert.deepEqual(s.pending.at(-1), { seq: s.nextSeq - 1, target: 'results', id: 'a', op: 'delete', at: 3 });

  for (let i = 0; i < MAX_PENDING + 50; i++) repo.upsert('results', item(`n${i}`));
  s = repo.getSyncState();
  assert.equal(s.pending.length, MAX_PENDING);
  assert.equal(s.pending.at(-1)?.id, `n${MAX_PENDING + 49}`);
  const seqs = s.pending.map((c) => c.seq);
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y));

  repo.ackChanges([s.pending[0]?.seq ?? 0]);
  assert.equal(repo.getSyncState().pending.length, MAX_PENDING - 1);
});

// ---------- Sync ----------
test('SyncEngine: Noop gibt Status zurück, pending bleibt; Fake-Provider push/pull', async () => {
  const repo = new Repository(new MemoryAdapter());
  repo.upsert('sessions', { ...({ id: 's1', ts: 1, mode: 'all', n: 1, correct: 1, points: 1, avgTimeMs: 1 } satisfies Session), ...createMeta(1, 'd', 's1') });
  const st = await new SyncEngine(repo).syncNow();
  assert.equal(st.ok, true);
  assert.equal(st.skipped, true);
  assert.equal(st.provider, 'noop');
  assert.equal(st.pending, 1);
  assert.equal((await new NoopSyncProvider().push()).acceptedSeqs.length, 0);

  const pushed: number[] = [];
  const remote = { ...createMeta(5000, 'other', 's2'), id: 's2', ts: 2, mode: 'all', n: 1, correct: 0, points: 0, avgTimeMs: 1 };
  const fake: RemoteSyncProvider = {
    name: 'fake',
    push: (changes) => { pushed.push(...changes.map((c) => c.seq)); return Promise.resolve({ acceptedSeqs: changes.map((c) => c.seq) }); },
    pull: () => Promise.resolve({ docs: [{ target: 'sessions', id: 's2', op: 'upsert', doc: remote }], serverTime: 9 }),
  };
  const st2 = await new SyncEngine(repo, fake).syncNow();
  assert.equal(st2.ok, true);
  assert.equal(st2.pushed, 1);
  assert.equal(st2.pulled, 1);
  assert.equal(st2.pending, 0);
  assert.equal(repo.list('sessions').length, 2);
  assert.equal(repo.getSyncState().lastPulledAt, 9);
  const bad: RemoteSyncProvider = { name: 'bad', push: () => Promise.reject(new Error('offline')), pull: () => Promise.reject(new Error('offline')) };
  repo.putDoc('settings', { a: 1 });
  const st3 = await new SyncEngine(repo, bad).syncNow();
  assert.equal(st3.ok, false);
  assert.equal(st3.error, 'offline');
});

// ---------- Migration ----------
const v1Data = {
  version: 1,
  attempts: [att({ ts: 42 }), att({ ts: 43, correct: false })],
  sessions: [{ id: 's1', ts: 10, mode: 'all', n: 10, correct: 8, points: 900, avgTimeMs: 4000 }],
  settings: { sessionLength: 20, theme: 'neon' },
  reviews: { 'pct.of': { box: 1, dueAt: 5, lastTs: 1 } },
  activity: { '2026-06-10': 60000 },
};
const v2Data = { ...v1Data, version: 2, dailyResults: { '2026-06-10': { n: 15, correct: 13, points: 1, timeMs: 2, ts: 3 } }, chainBest: { 2: 7 }, parallel: { nextStart: 3, bestChains: 2, bestCorrectStreak: 4, rounds: 6 } };

for (const [label, data] of [['v1', v1Data], ['v2', v2Data]] as const) {
  test(`Migration ${label} → v3: vollständig, idempotent, Backup vorhanden`, () => {
    const fs = fakeStorage({ 'kopfrechner.v1': JSON.stringify(data) });
    withLS(fs, () => {
      const atts = getAttempts();
      assert.equal(atts.length, 2);
      assert.equal(atts[0]?.ts, 42);
      assert.equal(atts[0]?.createdAt, 42);
      assert.equal(atts[0]?.deletedAt, null);
      assert.equal(atts[0]?.rev, 1);
      assert.match(atts[0]?.id ?? '', /^[0-9a-f-]{36}$/);
      assert.notEqual(atts[0]?.id, atts[1]?.id);
      const ses = getSessions();
      assert.equal(ses[0]?.id, 's1', 'Session-ID wird übernommen');
      assert.equal(ses[0]?.createdAt, 10);
      assert.equal(getSettings().sessionLength, 20);
      assert.equal(getSettings().autoFail, false);
      assert.deepEqual(getReviews(), v1Data.reviews);
      const prof = getProfile();
      assert.equal(prof.schemaVersion, 3);
      assert.equal(prof.cloudUserId, null);
      assert.equal(fs.raw.get('kopfrechner.v1.bak'), JSON.stringify(data));
      assert.ok(!fs.raw.has('kopfrechner.v1'));
      if (label === 'v2') {
        const e = JSON.parse(exportJSON()) as Record<string, unknown>;
        assert.deepEqual(e.chainBest, { 2: 7 });
        assert.deepEqual(e.parallel, v2Data.parallel);
        assert.deepEqual(Object.keys(e.dailyResults as object), ['2026-06-10']);
      }

      // Idempotenz: erneuter Lauf ändert nichts; Daten nach Cache-Invalidierung identisch
      const ids = getAttempts().map((a) => a.id);
      invalidateCache();
      assert.deepEqual(getAttempts().map((a) => a.id), ids);
      assert.equal(getSessions().length, 1);
      const repo = new Repository(new LocalStorageAdapter());
      assert.equal(migrateV1(repo, createLegacyStore()), 'none');
      assert.deepEqual(repo.list<GameResult>('results').map((a) => a.id), ids);
    });
  });
}

test('Migration: Wiederholung nach Abbruch (Schlüssel noch da) dupliziert nichts', () => {
  const fs = fakeStorage({ 'kopfrechner.v1': JSON.stringify(v1Data) });
  withLS(fs, () => {
    const repo = new Repository(new LocalStorageAdapter());
    const legacy = createLegacyStore();
    assert.equal(migrateV1(repo, legacy), 'migrated');
    fs.raw.set('kopfrechner.v1', JSON.stringify(v1Data)); // simuliert Abbruch vor dem Entfernen
    assert.equal(migrateV1(repo, legacy), 'migrated');
    assert.equal(repo.list('results').length, 2);
    assert.equal(repo.list('sessions').length, 1);
  });
});

// ---------- öffentliche API ----------
test('API: addAttempt/addSession ergänzen SyncMeta; Limits; Tombstones zuerst', () => {
  resetAll();
  addAttempt(att({ ts: 5 }));
  addSession({ id: 'abc', ts: 6, mode: 'all', n: 1, correct: 1, points: 1, avgTimeMs: 1 });
  const a = getAttempts()[0];
  assert.ok(a && a.id && a.deviceId && a.rev === 1 && a.deletedAt === null);
  assert.equal(getSessions()[0]?.id, 'abc');
  assert.deepEqual(DEFAULT_SETTINGS.autoFail, false);
  assert.equal(getSyncState().pending.length, 2);
  resetAll();
  assert.equal(getSyncState().pending.length, 0);

  for (let i = 0; i < 5003; i++) addAttempt(att({ ts: i }));
  const list = getAttempts();
  assert.equal(list.length, 5000);
  assert.equal(list[0]?.ts, 3);
  for (let i = 0; i < 502; i++) addSession({ id: `s${i}`, ts: i, mode: 'all', n: 1, correct: 1, points: 1, avgTimeMs: 1 });
  assert.equal(getSessions().length, 500);
  resetAll();
});

test('API: Profil, resetAll behält Profil und deviceId, Export v3', () => {
  resetAll();
  const p = getProfile();
  assert.equal(getProfile().id, p.id);
  const u = updateProfile({ displayName: 'Mia' });
  assert.equal(u.displayName, 'Mia');
  assert.equal(u.rev, p.rev + 1);
  assert.equal(u.id, p.id);
  setSettings({ theme: 'oled' });
  addAttempt(att());
  const dev = getAttempts()[0]?.deviceId;
  const ex = JSON.parse(exportJSON()) as { version: number; profile: { displayName: string }; attempts: unknown[]; settings: { theme: string; updatedAt?: number }; deviceId: string };
  assert.equal(ex.version, 3);
  assert.equal(ex.profile.displayName, 'Mia');
  assert.equal(ex.attempts.length, 1);
  assert.equal(ex.deviceId, dev);
  assert.equal(getSettings().theme, 'oled');
  assert.ok(!('updatedAt' in getSettings()));

  resetAll();
  assert.equal(getAttempts().length, 0);
  assert.equal(getSettings().theme, 'system');
  assert.equal(getProfile().id, p.id);
  assert.equal(getProfile().displayName, 'Mia');
  addAttempt(att());
  assert.equal(getAttempts()[0]?.deviceId, dev);
  resetAll();
});

test('API: externe Änderung + invalidateCache (storage-Event-Pfad) aktualisiert Sicht', () => {
  const fs = fakeStorage();
  withLS(fs, () => {
    assert.equal(getSettings().sessionLength, 10);
    fs.raw.set('mm:v3:doc:settings', JSON.stringify({ sessionLength: 33 }));
    assert.equal(getSettings().sessionLength, 10);
    invalidateCache();
    assert.equal(getSettings().sessionLength, 33);
    setReviews({});
  });
});
