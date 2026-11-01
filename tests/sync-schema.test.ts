import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter, Repository, SyncEngine, compareMeta, sumByKey } from '../src/vendor/storage.ts';
import { APP_SYNC_SCHEMA, DEVICE_LOCAL_SETTINGS, stripDeviceLocal } from '../src/data/sync-schema.ts';
import { createMeta } from '../src/data/meta.ts';
import type { PullPage, RemoteDoc, RemoteSyncProvider, SyncRecord } from '../src/types.ts';

type Obj = Record<string, unknown>;
const doc = (name: string): { merge: (l: Obj, r: Obj, c: { localUpdatedAt: number | null; remoteUpdatedAt: number }) => Obj } => {
  const d = APP_SYNC_SCHEMA.docs.find((x) => x.name === name);
  if (!d) throw new Error(name);
  return d;
};
const ctx = { localUpdatedAt: 0, remoteUpdatedAt: 0 };

test('Schema: Collections mit Limits, profile nicht enthalten', () => {
  assert.deepEqual(APP_SYNC_SCHEMA.collections, [{ name: 'results', limit: 5000 }, { name: 'sessions', limit: 500 }]);
  assert.ok(!APP_SYNC_SCHEMA.docs.some((d) => d.name === 'profile'));
  assert.equal(APP_SYNC_SCHEMA.docs.find((d) => d.name === 'activity')?.perDevice, true);
});

test('settings: LWW, geräte-lokale Schlüssel bleiben, updatedAt des Gewinners', () => {
  const m = doc('settings').merge;
  const local = { sessionLength: 10, keypad: 'phone', lastSeenVersion: '1.0', updatedAt: 100 };
  const remoteNew = { sessionLength: 30, theme: 'neon', keypad: 'desk', updatedAt: 200 };
  const r1 = m(local, remoteNew, ctx);
  assert.deepEqual(r1, { sessionLength: 30, theme: 'neon', keypad: 'phone', lastSeenVersion: '1.0', updatedAt: 200 });
  const r2 = m(local, { ...remoteNew, updatedAt: 50 }, ctx);
  assert.equal(r2.sessionLength, 10);
  assert.equal(r2.updatedAt, 100);
  assert.equal(m(local, { ...remoteNew, updatedAt: 100 }, ctx).sessionLength, 10); // Gleichstand → lokal
  assert.ok(!('keypad' in m({ a: 1, updatedAt: 1 }, { a: 2, keypad: 'x', updatedAt: 2 }, ctx)));
  assert.deepEqual(stripDeviceLocal(local), { sessionLength: 10, updatedAt: 100 });
  const spec = APP_SYNC_SCHEMA.docs.find((d) => d.name === 'settings');
  assert.deepEqual(spec?.toRemote?.(local), { sessionLength: 10, updatedAt: 100 });
  assert.equal(spec?.updatedAt?.(local), 100);
  assert.equal(spec?.updatedAt?.({}), null);
  assert.deepEqual([...DEVICE_LOCAL_SETTINGS], ['keypad', 'lastSeenVersion', 'onboardingDone']);
});

test('dailyResults: mehr Punkte gewinnt, bei Gleichstand früherer ts', () => {
  const m = doc('dailyResults').merge;
  const a = { n: 1, correct: 1, points: 10, timeMs: 1, ts: 5 };
  const b = { n: 2, correct: 2, points: 20, timeMs: 1, ts: 9 };
  assert.deepEqual(m({ d1: a }, { d1: b }, ctx), { d1: b });
  assert.deepEqual(m({ d1: b }, { d1: a }, ctx), { d1: b });
  const c = { ...a, ts: 2 };
  assert.deepEqual(m({ d1: a }, { d1: c }, ctx), { d1: c });
  assert.deepEqual(m({ d1: c }, { d1: a }, ctx), { d1: c });
  assert.deepEqual(m({ d1: a }, { d2: b }, ctx), { d1: a, d2: b });
  assert.deepEqual(m({ d1: a }, { d1: 'kaputt' }, ctx), { d1: a });
});

test('parallel: Maximum, nextStart lokal', () => {
  const m = doc('parallel').merge;
  const l = { nextStart: 3, bestChains: 2, bestCorrectStreak: 5, rounds: 7 };
  const r = { nextStart: 4, bestChains: 4, bestCorrectStreak: 1, rounds: 9 };
  assert.deepEqual(m(l, r, ctx), { nextStart: 3, bestChains: 4, bestCorrectStreak: 5, rounds: 9 });
  assert.deepEqual(m({}, {}, ctx), { bestChains: 0, bestCorrectStreak: 0, rounds: 0, nextStart: 2 });
});

test('chainBest, activity, reviews', () => {
  assert.deepEqual(doc('chainBest').merge({ 1: 5, 2: 3 }, { 2: 8, 3: 1 }, ctx), { 1: 5, 2: 8, 3: 1 });
  assert.deepEqual(doc('activity').merge({ a: 1, b: 9 }, { a: 4 }, ctx), { a: 4, b: 9 });
  const l = { 'pct.of': { box: 1, dueAt: 1, lastTs: 10 }, x: { box: 1, dueAt: 1, lastTs: 5 } };
  const r = { 'pct.of': { box: 2, dueAt: 2, lastTs: 20 } };
  assert.deepEqual(doc('reviews').merge(l, r, ctx), { 'pct.of': r['pct.of'], x: l.x });
});

// ---------- Ende-zu-Ende: zwei Geräte + Fake-Server ----------
class FakeServer {
  counter = 0;
  recs = new Map<string, { rec: SyncRecord; seq: number }>();
  docs = new Map<string, { doc: RemoteDoc; seq: number }>();
  pushedDocs: string[] = [];
  provider(): RemoteSyncProvider {
    return {
      name: 'fake',
      upsertRecords: (c, items) => {
        for (const it of items) {
          const key = `${c}/${it.id}`;
          const cur = this.recs.get(key);
          if (!cur || compareMeta(it, cur.rec) > 0) this.recs.set(key, { rec: it, seq: ++this.counter });
        }
        return Promise.resolve();
      },
      upsertDocs: (docs) => {
        for (const d of docs) {
          this.pushedDocs.push(d.name);
          const cur = this.docs.get(d.name);
          if (!cur || d.updatedAt > cur.doc.updatedAt || (d.updatedAt === cur.doc.updatedAt && d.deviceId >= cur.doc.deviceId)) {
            this.docs.set(d.name, { doc: d, seq: ++this.counter });
          }
        }
        return Promise.resolve();
      },
      pull: (cursor) => {
        const from = cursor === null ? 0 : Number(cursor);
        const records: PullPage['records'] = [];
        for (const [key, v] of this.recs) if (v.seq > from) records.push({ collection: key.split('/')[0] ?? '', item: v.rec });
        const docs = [...this.docs.values()].filter((v) => v.seq > from).map((v) => v.doc);
        return Promise.resolve({ records, docs, cursor: String(this.counter), hasMore: false });
      },
      deleteAll: () => Promise.resolve(),
    };
  }
}

interface Device { repo: Repository; engine: SyncEngine; id: string }
function device(id: string, server: FakeServer, clock: { t: number }): Device {
  const repo = new Repository(new MemoryAdapter(), { now: () => clock.t });
  repo.adapter.set('deviceId', id);
  const engine = new SyncEngine(repo, { schema: APP_SYNC_SCHEMA, deviceId: () => id, now: () => clock.t });
  engine.setProvider(server.provider());
  return { repo, engine, id };
}
const activityView = (d: Device): Record<string, number> => {
  const remote = d.repo.getDoc<Record<string, Record<string, number>>>('activityRemote') ?? {};
  return sumByKey(d.repo.getDoc('activity'), ...Object.values(remote));
};

test('Zwei Geräte konvergieren (Versuche, Runden, Einstellungen, Aktivität); Profil wird nie hochgeladen', async () => {
  const server = new FakeServer();
  const clock = { t: 1000 };
  const a = device('dev-a', server, clock);
  const b = device('dev-b', server, clock);

  const attempt = (dev: Device, id: string): SyncRecord => ({
    ...createMeta(clock.t, dev.id, id), ts: clock.t, sessionId: 's1', mode: 'all', category: 'pct', subtype: 'pct.of',
    prompt: '', unit: '', expected: 1, given: 1, correct: true, errorType: null, timeMs: 1, targetMs: 2, weight: 1, points: 10,
  });
  a.repo.upsert('results', attempt(a, 'r-a'));
  b.repo.upsert('results', attempt(b, 'r-b'));
  a.repo.upsert('sessions', { ...createMeta(clock.t, 'dev-a', 's-a'), ts: 1, mode: 'all', n: 1, correct: 1, points: 1, avgTimeMs: 1 });
  a.repo.putDoc('profile', { ...createMeta(clock.t, 'dev-a'), displayName: 'Geheim', cloudUserId: null, schemaVersion: 3 });
  a.repo.putDoc('settings', { sessionLength: 10, keypad: 'phone', updatedAt: 1000 });
  clock.t = 2000;
  b.repo.putDoc('settings', { sessionLength: 40, keypad: 'desk', updatedAt: 2000 });
  a.repo.putDoc('activity', { '2026-06-10': 1000 });
  b.repo.putDoc('activity', { '2026-06-10': 500, '2026-06-11': 200 });

  for (let i = 0; i < 3; i++) {
    clock.t += 10;
    await a.engine.syncNow();
    await b.engine.syncNow();
  }

  for (const d of [a, b]) {
    assert.deepEqual(d.repo.list<SyncRecord>('results').map((x) => x.id).sort(), ['r-a', 'r-b']);
    assert.deepEqual(d.repo.list<SyncRecord>('sessions').map((x) => x.id), ['s-a']);
    assert.equal(d.repo.getDoc<Obj>('settings')?.sessionLength, 40);
    assert.deepEqual(activityView(d), { '2026-06-10': 1500, '2026-06-11': 200 });
  }
  // Geräte-lokale Einstellungen bleiben pro Gerät
  assert.equal(a.repo.getDoc<Obj>('settings')?.keypad, 'phone');
  assert.equal(b.repo.getDoc<Obj>('settings')?.keypad, 'desk');
  assert.ok(!('keypad' in (server.docs.get('settings')?.doc.data ?? {})));
  // Eigene Aktivität unverändert, fremde im activityRemote
  assert.deepEqual(a.repo.getDoc('activity'), { '2026-06-10': 1000 });
  assert.deepEqual(a.repo.getDoc('activityRemote'), { 'dev-b': { '2026-06-10': 500, '2026-06-11': 200 } });
  // Profil nie auf dem Server
  assert.ok(!server.pushedDocs.includes('profile'));
  assert.ok(![...server.docs.keys()].some((n) => n.startsWith('profile')));
  assert.equal(a.engine.pendingCount(), 0);
  assert.equal(b.engine.pendingCount(), 0);
});
