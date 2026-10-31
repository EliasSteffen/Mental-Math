// SyncManager: plant SyncEngine-Läufe (Start, online, sichtbar, nach Schreiben, Intervall, Backoff).
import type { RemoteSyncProvider, SyncStatus } from './types.ts';
import type { SyncEngine } from './engine.ts';

export interface SyncEnv {
  isOnline(): boolean;
  isVisible(): boolean;
  on(ev: 'online' | 'offline' | 'visible' | 'hidden', cb: () => void): () => void;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  now(): number;
  random(): number;
  /** null = Lock hält ein anderer Tab */
  lock?: <T>(name: string, fn: () => Promise<T>) => Promise<T | null>;
}

interface LockLike { request(name: string, o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<unknown>): Promise<unknown> }

export function browserSyncEnv(): SyncEnv {
  const locks = (globalThis.navigator as { locks?: LockLike } | undefined)?.locks;
  const env: SyncEnv = {
    isOnline: () => globalThis.navigator?.onLine !== false,
    isVisible: () => globalThis.document?.visibilityState !== 'hidden',
    on(ev, cb) {
      if (ev === 'online' || ev === 'offline') {
        globalThis.addEventListener?.(ev, cb);
        return () => globalThis.removeEventListener?.(ev, cb);
      }
      const h = (): void => {
        const vis = globalThis.document?.visibilityState !== 'hidden';
        if (vis === (ev === 'visible')) cb();
      };
      globalThis.document?.addEventListener('visibilitychange', h);
      return () => globalThis.document?.removeEventListener('visibilitychange', h);
    },
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as number),
    now: () => Date.now(),
    random: () => Math.random(),
  };
  if (locks) {
    env.lock = <T>(name: string, fn: () => Promise<T>): Promise<T | null> =>
      locks.request(name, { ifAvailable: true }, (lock) => (lock ? fn() : Promise.resolve(null))) as Promise<T | null>;
  }
  return env;
}

export type SyncReason = 'start' | 'online' | 'visible' | 'write' | 'manual' | 'interval';

export interface SyncManagerOptions {
  env?: SyncEnv;
  subscribeWrites?: (cb: () => void) => () => void;
  writeDebounceMs?: number;
  intervalMs?: number;
}

const BACKOFF_BASE = 5000;
const BACKOFF_MAX = 300000;

export class SyncManager {
  private readonly engine: SyncEngine;
  private readonly env: SyncEnv;
  private readonly o: SyncManagerOptions;
  private readonly listeners = new Set<(s: SyncStatus) => void>();
  private status: SyncStatus;
  private enabled = false;
  private gen = 0;
  private current: Promise<SyncStatus> | null = null;
  private rerun = false;
  private authBlocked = false;
  private backoffN = 0;
  private writeTimer: unknown = null;
  private retryTimer: unknown = null;
  private intervalTimer: unknown = null;
  private offs: Array<() => void> = [];

  constructor(engine: SyncEngine, o: SyncManagerOptions = {}) {
    this.engine = engine;
    this.o = o;
    this.env = o.env ?? browserSyncEnv();
    this.status = { phase: 'disabled', lastSyncAt: null, lastError: null, pending: 0, pushed: 0, pulled: 0, rejected: 0 };
  }

  getStatus(): SyncStatus { return { ...this.status, pending: this.engine.pendingCount() }; }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private setStatus(s: SyncStatus): void {
    this.status = s;
    for (const cb of [...this.listeners]) {
      try { cb(this.getStatus()); } catch { /* Listener-Fehler ignorieren */ }
    }
  }

  private setPhase(phase: SyncStatus['phase']): void {
    if (this.status.phase !== phase) this.setStatus({ ...this.status, phase });
  }

  enable(provider: RemoteSyncProvider): void {
    this.teardown();
    this.enabled = true;
    this.authBlocked = false;
    this.backoffN = 0;
    this.engine.setProvider(provider);
    this.setStatus({ ...this.status, phase: 'idle', lastError: null });
    this.offs.push(
      this.env.on('online', () => this.request('online')),
      this.env.on('offline', () => { if (this.enabled) this.setPhase('offline'); }),
      this.env.on('visible', () => { this.request('visible'); this.startInterval(); }),
      this.env.on('hidden', () => this.stopInterval()),
    );
    if (this.o.subscribeWrites) this.offs.push(this.o.subscribeWrites(() => this.request('write')));
    this.startInterval();
    this.request('start');
  }

  disable(): void {
    this.teardown();
    this.enabled = false;
    this.engine.setProvider(null);
    this.setStatus({ ...this.status, phase: 'disabled' });
  }

  dispose(): void {
    this.disable();
    this.listeners.clear();
  }

  private teardown(): void {
    this.gen++;
    this.rerun = false;
    this.current = null;
    for (const t of ['writeTimer', 'retryTimer'] as const) {
      if (this[t] !== null) this.env.clearTimeout(this[t]);
      this[t] = null;
    }
    this.stopInterval();
    for (const off of this.offs) off();
    this.offs = [];
  }

  private startInterval(): void {
    this.stopInterval();
    if (!this.enabled || !this.env.isVisible()) return;
    this.intervalTimer = this.env.setTimeout(() => {
      this.intervalTimer = null;
      this.request('interval');
      this.startInterval();
    }, this.o.intervalMs ?? 300000);
  }

  private stopInterval(): void {
    if (this.intervalTimer !== null) this.env.clearTimeout(this.intervalTimer);
    this.intervalTimer = null;
  }

  request(reason: SyncReason): void {
    if (!this.enabled) return;
    if (reason === 'write') {
      if (this.writeTimer !== null) this.env.clearTimeout(this.writeTimer);
      this.writeTimer = this.env.setTimeout(() => {
        this.writeTimer = null;
        void this.go('write');
      }, this.o.writeDebounceMs ?? 5000);
      return;
    }
    void this.go(reason);
  }

  syncNow(): Promise<SyncStatus> {
    return this.go('manual');
  }

  private go(reason: SyncReason): Promise<SyncStatus> {
    if (!this.enabled) return Promise.resolve(this.getStatus());
    if (this.authBlocked && reason !== 'manual') return Promise.resolve(this.getStatus());
    if (!this.env.isOnline() && reason !== 'manual') {
      this.setPhase('offline');
      return Promise.resolve(this.getStatus());
    }
    if (this.current) {
      this.rerun = true;
      return this.current;
    }
    if (this.retryTimer !== null) {
      this.env.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.authBlocked = false;
    const p = this.run();
    this.current = p;
    return p;
  }

  private async run(): Promise<SyncStatus> {
    const gen = this.gen;
    const before = this.status;
    this.setStatus({ ...this.status, phase: 'syncing' });
    let res: SyncStatus | null;
    try {
      res = this.env.lock ? await this.env.lock('mm-sync', () => this.engine.syncNow()) : await this.engine.syncNow();
    } catch {
      res = { ...before, phase: 'error', lastError: 'server' };
    }
    if (gen !== this.gen) return this.getStatus(); // zwischenzeitlich deaktiviert
    this.current = null;
    if (res === null) {
      // anderer Tab synchronisiert: Status unverändert, nächster Intervall versucht es erneut
      this.rerun = false;
      this.setStatus(before);
      return this.getStatus();
    }
    this.setStatus(res);
    let follow = false;
    if (res.phase === 'idle') {
      this.backoffN = 0;
      follow = this.rerun;
    } else if (res.phase === 'error') {
      if (res.lastError === 'auth') this.authBlocked = true;
      else this.scheduleRetry();
    }
    this.rerun = false;
    if (follow) void this.go('write');
    return this.getStatus();
  }

  private scheduleRetry(): void {
    const base = Math.min(BACKOFF_BASE * 2 ** this.backoffN, BACKOFF_MAX);
    this.backoffN++;
    // Jitter ±20 %, aber nie über dem Deckel
    const delay = Math.min(BACKOFF_MAX, Math.round(base * (1 + (this.env.random() * 2 - 1) * 0.2)));
    this.retryTimer = this.env.setTimeout(() => {
      this.retryTimer = null;
      void this.go('interval');
    }, delay);
  }
}
