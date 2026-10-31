import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAdapter } from '../src/adapters/memory.ts';
import { SyncEngine } from '../src/engine.ts';
import { SyncError } from '../src/errors.ts';
import { SyncManager } from '../src/manager.ts';
import type { SyncEnv } from '../src/manager.ts';
import { Repository } from '../src/repository.ts';
import type { PullPage, RemoteSyncProvider, SyncErrorKind, SyncStatus } from '../src/types.ts';
import { testSchema } from './test-schema.ts';

type Ev = 'online' | 'offline' | 'visible' | 'hidden';
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

class FakeEnv implements SyncEnv {
  online = true;
  visible = true;
  t = 0;
  rnd = 0.5;
  lockResult: 'pass' | 'null' = 'pass';
  withLock = false;
  private handlers = new Map<Ev, Set<() => void>>();
  timers: Array<{ id: number; at: number; cb: () => void }> = [];
  private nextId = 1;

  isOnline(): boolean { return this.online; }
  isVisible(): boolean { return this.visible; }
  on(ev: Ev, cb: () => void): () => void {
    const set = this.handlers.get(ev) ?? new Set();
    set.add(cb);
    this.handlers.set(ev, set);
    return () => { set.delete(cb); };
  }
  emit(ev: Ev): void { for (const cb of [...(this.handlers.get(ev) ?? [])]) cb(); }
  setTimeout(cb: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + ms, cb });
    return id;
  }
  clearTimeout(h: unknown): void { this.timers = this.timers.filter((x) => x.id !== h); }
  now(): number { return this.t; }
  random(): number { return this.rnd; }
  get lock(): SyncEnv['lock'] {
    if (!this.withLock) return undefined;
    return <T>(_n: string, fn: () => Promise<T>): Promise<T | null> => (this.lockResult === 'null' ? Promise.resolve(null) : fn());
  }

  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next);
      this.t = next.at;
      next.cb();
      await flush();
    }
    this.t = target;
    await flush();
  }
}

class FakeProvider implements RemoteSyncProvider {
  readonly name = 'fake';
  runs = 0;
  fail: SyncErrorKind | null = null;
  gate: Promise<void> | null = null;
  async upsertRecords(): Promise<void> { /* leer */ }
  async upsertDocs(): Promise<void> { /* leer */ }
  async deleteAll(): Promise<void> { /* leer */ }
  async pull(): Promise<PullPage> {
    this.runs++;
    if (this.gate) await this.gate;
    if (this.fail) throw new SyncError(this.fail);
    return { records: [], docs: [], cursor: null, hasMore: false };
  }
}

function setup(o: { intervalMs?: number; writeDebounceMs?: number } = {}) {
  const env = new FakeEnv();
  const provider = new FakeProvider();
  const repo = new Repository(new MemoryAdapter());
  const engine = new SyncEngine(repo, { schema: testSchema, deviceId: () => 'd' });
  let writeCb: (() => void) | null = null;
  const mgr = new SyncManager(engine, {
    env, intervalMs: o.intervalMs ?? 1e9, writeDebounceMs: o.writeDebounceMs,
    subscribeWrites: (cb) => { writeCb = cb; return () => { writeCb = null; }; },
  });
  return { env, provider, repo, engine, mgr, write: () => writeCb?.() };
}

test('disabled: Anfragen werden ignoriert', async () => {
  const { mgr, provider } = setup();
  mgr.request('manual');
  await flush();
  assert.equal(mgr.getStatus().phase, 'disabled');
  assert.equal((await mgr.syncNow()).phase, 'disabled');
  assert.equal(provider.runs, 0);
});

test('enable startet einen Lauf; Statusereignisse mit frischen Objekten', async () => {
  const { mgr, provider } = setup();
  const seen: SyncStatus[] = [];
  mgr.onStatus((s) => seen.push(s));
  mgr.enable(provider);
  await flush();
  assert.equal(provider.runs, 1);
  assert.deepEqual(seen.map((s) => s.phase), ['idle', 'syncing', 'idle']);
  assert.notEqual(seen[0], seen[2]);
  assert.notEqual(mgr.getStatus(), mgr.getStatus());
  assert.ok(seen[2]?.lastSyncAt !== null);
});

test('Schreibzugriffe werden entprellt (5 s)', async () => {
  const { mgr, provider, env, write } = setup();
  mgr.enable(provider);
  await flush();
  assert.equal(provider.runs, 1);
  write();
  await env.advance(3000);
  write();
  await env.advance(4999);
  assert.equal(provider.runs, 1);
  await env.advance(1);
  assert.equal(provider.runs, 2);
});

test('Single-Flight: genau ein Folgelauf', async () => {
  const { mgr, provider } = setup();
  let release: () => void = () => undefined;
  provider.gate = new Promise<void>((r) => { release = r; });
  mgr.enable(provider);
  await flush();
  assert.equal(provider.runs, 1);
  mgr.request('visible');
  mgr.request('online');
  void mgr.syncNow();
  assert.equal(provider.runs, 1);
  release();
  await flush();
  await flush();
  assert.equal(provider.runs, 2);
  await flush();
  assert.equal(mgr.getStatus().phase, 'idle');
});

test('offline: wartet auf online-Ereignis; manuell versucht es trotzdem', async () => {
  const { mgr, provider, env } = setup({ intervalMs: 1000 });
  env.online = false;
  mgr.enable(provider);
  await flush();
  assert.equal(mgr.getStatus().phase, 'offline');
  await env.advance(5000);
  assert.equal(provider.runs, 0);
  await mgr.syncNow();
  assert.equal(provider.runs, 1);
  env.online = true;
  env.emit('online');
  await flush();
  assert.equal(provider.runs, 2);
  assert.equal(mgr.getStatus().phase, 'idle');
});

test('Offline-Fehler des Providers: Phase offline, keine automatische Wiederholung', async () => {
  const { mgr, provider, env } = setup();
  provider.fail = 'offline';
  mgr.enable(provider);
  await flush();
  assert.equal(mgr.getStatus().phase, 'offline');
  await env.advance(200000);
  assert.equal(provider.runs, 1);
  provider.fail = null;
  env.emit('online');
  await flush();
  assert.equal(mgr.getStatus().phase, 'idle');
});

test('Backoff: 5 s · 2^n, Deckel 300 s, Reset bei Erfolg', async () => {
  const { mgr, provider, env } = setup();
  provider.fail = 'server';
  mgr.enable(provider);
  await flush();
  let runs = 1;
  for (const d of [5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]) {
    await env.advance(d - 1);
    assert.equal(provider.runs, runs, `vor ${d}`);
    await env.advance(1);
    runs++;
    assert.equal(provider.runs, runs, `bei ${d}`);
    assert.equal(mgr.getStatus().phase, 'error');
  }
  provider.fail = null;
  await env.advance(300000);
  assert.equal(mgr.getStatus().phase, 'idle');
  provider.fail = 'server';
  await mgr.syncNow();
  const before = provider.runs;
  await env.advance(4999);
  assert.equal(provider.runs, before);
  await env.advance(1);
  assert.equal(provider.runs, before + 1);
});

test('Backoff-Jitter ±20 %', async () => {
  for (const [rnd, delay] of [[0, 4000], [1, 6000]] as const) {
    const { mgr, provider, env } = setup();
    env.rnd = rnd;
    provider.fail = 'server';
    mgr.enable(provider);
    await flush();
    await env.advance(delay - 1);
    assert.equal(provider.runs, 1);
    await env.advance(1);
    assert.equal(provider.runs, 2);
  }
});

test('auth: keine automatischen Wiederholungen bis manual oder enable', async () => {
  const { mgr, provider, env } = setup({ intervalMs: 1000 });
  provider.fail = 'auth';
  mgr.enable(provider);
  await flush();
  assert.equal(mgr.getStatus().phase, 'error');
  assert.equal(mgr.getStatus().lastError, 'auth');
  await env.advance(600000);
  mgr.request('visible');
  mgr.request('online');
  await flush();
  assert.equal(provider.runs, 1);
  provider.fail = null;
  mgr.request('manual');
  await flush();
  assert.equal(provider.runs, 2);
  assert.equal(mgr.getStatus().phase, 'idle');
  provider.fail = 'auth';
  await mgr.syncNow();
  provider.fail = null;
  mgr.enable(provider);
  await flush();
  assert.equal(mgr.getStatus().phase, 'idle');
});

test('Intervall nur bei sichtbarer Seite', async () => {
  const { mgr, provider, env } = setup({ intervalMs: 1000 });
  mgr.enable(provider);
  await flush();
  await env.advance(1000);
  assert.equal(provider.runs, 2);
  env.visible = false;
  env.emit('hidden');
  await env.advance(10000);
  assert.equal(provider.runs, 2);
  env.visible = true;
  env.emit('visible');
  await flush();
  assert.equal(provider.runs, 3);
  await env.advance(1000);
  assert.equal(provider.runs, 4);
});

test('Lock: null = von anderem Tab gehalten → übersprungen, Status unverändert', async () => {
  const { mgr, provider, env } = setup({ intervalMs: 1000 });
  env.withLock = true;
  env.lockResult = 'null';
  mgr.enable(provider);
  await flush();
  assert.equal(provider.runs, 0);
  assert.equal(mgr.getStatus().phase, 'idle');
  assert.equal(mgr.getStatus().lastSyncAt, null);
  env.lockResult = 'pass';
  await env.advance(1000);
  assert.equal(provider.runs, 1);
  assert.ok(mgr.getStatus().lastSyncAt !== null);
});

test('disable stoppt alles', async () => {
  const { mgr, provider, env, write } = setup({ intervalMs: 1000 });
  mgr.enable(provider);
  await flush();
  write();
  mgr.disable();
  assert.equal(env.timers.length, 0);
  assert.equal(mgr.getStatus().phase, 'disabled');
  assert.equal(provider.runs, 1);
  await env.advance(100000);
  mgr.request('manual');
  env.emit('online');
  await flush();
  assert.equal(provider.runs, 1);
  assert.equal(mgr.getStatus().phase, 'disabled');
  mgr.dispose();
});

test('disable während laufendem Lauf: Ergebnis wird verworfen', async () => {
  const { mgr, provider } = setup();
  let release: () => void = () => undefined;
  provider.gate = new Promise<void>((r) => { release = r; });
  mgr.enable(provider);
  await flush();
  mgr.disable();
  release();
  await flush();
  assert.equal(mgr.getStatus().phase, 'disabled');
});

test('pending im Status stammt aus der Engine', async () => {
  const { mgr, provider, repo } = setup();
  repo.putDoc('prefs', { a: 1 });
  assert.equal(mgr.getStatus().pending, 1);
  mgr.enable(provider);
  await flush();
  assert.equal(mgr.getStatus().pending, 0);
});

test('Backoff-Jitter überschreitet den Deckel von 300 s nie', async () => {
  const { mgr, provider, env } = setup();
  env.rnd = 1; // maximaler Jitter nach oben
  provider.fail = 'server';
  mgr.enable(provider);
  await flush();
  // bis zum Deckel hochlaufen: 6 s, 12 s, 24 s, 48 s, 96 s, 192 s, dann 300 s (nicht 360 s)
  for (const d of [6000, 12000, 24000, 48000, 96000, 192000, 300000, 300000]) {
    const before = provider.runs;
    await env.advance(d - 1);
    assert.equal(provider.runs, before, `vor ${d}`);
    await env.advance(1);
    assert.equal(provider.runs, before + 1, `bei ${d}`);
  }
});
