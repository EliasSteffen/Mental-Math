// IndexedDB-Adapter: alle Daten liegen im Speicher (synchrone Zugriffe), Schreibzugriffe werden gebündelt in IndexedDB persistiert.
import type { PersistentAdapter, StorageAdapter } from '../types.ts';

export interface BroadcastChannelLike { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null; close(): void }

export interface IdbOptions {
  dbName?: string;
  idb?: IDBFactory;
  channel?: ((name: string) => BroadcastChannelLike | null) | null;
  migrateFrom?: StorageAdapter | null;
  debounceMs?: number;
  lifecycle?: EventTarget | null;
  isHidden?: () => boolean;
}

const STORE = 'kv';
const BACKOFF_START = 1000;
const BACKOFF_MAX = 30000;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

function openDb(idb: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = idb.open(name, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB open failed'));
    r.onblocked = () => reject(new Error('IDB open blocked'));
  });
}

function defaultChannel(name: string): BroadcastChannelLike | null {
  const BC = (globalThis as { BroadcastChannel?: new (n: string) => BroadcastChannelLike }).BroadcastChannel;
  return typeof BC === 'function' ? new BC(name) : null;
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class IndexedDbAdapter implements PersistentAdapter {
  readonly name = 'indexedDB';
  private readonly map: Map<string, string>;
  private readonly db: IDBDatabase;
  private readonly dirty = new Map<string, number>(); // Schlüssel -> Version des letzten Schreibens
  private version = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private backoff = 0;
  private readonly debounceMs: number;
  private readonly id = randomId();
  private readonly channel: BroadcastChannelLike | null;
  private readonly listeners = new Set<(keys: string[]) => void>();
  private readonly cleanups: Array<() => void> = [];
  private closed = false;

  private constructor(db: IDBDatabase, map: Map<string, string>, o: IdbOptions) {
    this.db = db;
    this.map = map;
    this.debounceMs = o.debounceMs ?? 150;
    const mk = o.channel === undefined ? defaultChannel : o.channel;
    let ch: BroadcastChannelLike | null = null;
    try { ch = mk ? mk('mm-data') : null; } catch { ch = null; }
    this.channel = ch;
    if (ch) ch.onmessage = (e) => { void this.onMessage(e.data); };
    this.setupLifecycle(o);
  }

  static async open(o: IdbOptions = {}): Promise<IndexedDbAdapter> {
    const idb = o.idb ?? globalThis.indexedDB;
    if (!idb) throw new Error('IndexedDB nicht verfügbar');
    const db = await openDb(idb, o.dbName ?? 'mental-math');
    const map = new Map<string, string>();
    try {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const [vals, keys] = await Promise.all([req(st.getAll()), req(st.getAllKeys())]);
      keys.forEach((k, i) => { if (typeof k === 'string' && typeof vals[i] === 'string') map.set(k, vals[i] as string); });
    } catch (e) {
      db.close();
      throw e;
    }
    const a = new IndexedDbAdapter(db, map, o);
    const src = o.migrateFrom;
    if (src && map.size === 0) await a.migrate(src);
    return a;
  }

  private async migrate(src: StorageAdapter): Promise<void> {
    const keys = src.keys('');
    if (keys.length === 0) return;
    const copy = new Map<string, string>();
    for (const k of keys) {
      const v = src.get(k);
      if (v !== null) copy.set(k, v);
    }
    if (copy.size === 0) return;
    for (const [k, v] of copy) this.map.set(k, v);
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const [k, v] of copy) st.put(v, k);
      await txDone(tx);
    } catch (e) {
      // Quelle bleibt unberührt; später erneut persistieren
      console.warn('IndexedDB-Migration fehlgeschlagen', e);
      for (const k of copy.keys()) this.dirty.set(k, ++this.version);
      this.schedule(this.debounceMs);
      return;
    }
    for (const k of copy.keys()) {
      try { src.remove(k); } catch { /* ignorieren */ }
    }
  }

  private setupLifecycle(o: IdbOptions): void {
    const hidden = o.isHidden ?? (() => (globalThis as { document?: { visibilityState?: string } }).document?.visibilityState === 'hidden');
    const onHide = () => { void this.flush(); };
    const onVis = () => { if (hidden()) void this.flush(); };
    const add = (t: EventTarget | null | undefined, type: string, fn: () => void) => {
      if (t && typeof t.addEventListener === 'function') {
        t.addEventListener(type, fn);
        this.cleanups.push(() => t.removeEventListener(type, fn));
      }
    };
    if (o.lifecycle !== undefined && o.lifecycle !== null) {
      add(o.lifecycle, 'pagehide', onHide);
      add(o.lifecycle, 'visibilitychange', onVis);
    } else if (o.lifecycle === undefined) {
      add(globalThis as unknown as EventTarget, 'pagehide', onHide);
      add((globalThis as { document?: EventTarget }).document, 'visibilitychange', onVis);
    }
  }

  get(key: string): string | null { return this.map.get(key) ?? null; }

  set(key: string, value: string): void {
    this.map.set(key, value);
    this.mark(key);
  }

  remove(key: string): void {
    this.map.delete(key);
    this.mark(key);
  }

  keys(prefix: string): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }

  private mark(key: string): void {
    this.dirty.set(key, ++this.version);
    this.schedule(this.debounceMs);
  }

  private schedule(ms: number): void {
    if (this.closed || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  flush(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    if (this.inflight) return this.inflight.then(() => this.flush());
    if (this.dirty.size === 0) return Promise.resolve();
    const p = this.doFlush().finally(() => { if (this.inflight === p) this.inflight = null; });
    this.inflight = p;
    return p;
  }

  private async doFlush(): Promise<void> {
    const snap = [...this.dirty].map(([k, v]) => ({ k, v, val: this.map.get(k) }));
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const s of snap) {
        if (s.val === undefined) st.delete(s.k);
        else st.put(s.val, s.k);
      }
      await txDone(tx);
    } catch {
      this.backoff = this.backoff === 0 ? BACKOFF_START : Math.min(this.backoff * 2, BACKOFF_MAX);
      this.schedule(this.backoff);
      return;
    }
    this.backoff = 0;
    for (const s of snap) if (this.dirty.get(s.k) === s.v) this.dirty.delete(s.k);
    try { this.channel?.postMessage({ type: 'mm-data', from: this.id, keys: snap.map((s) => s.k) }); } catch { /* ignorieren */ }
    if (this.dirty.size > 0) this.schedule(this.debounceMs);
  }

  onExternalChange(cb: (keys: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private async onMessage(data: unknown): Promise<void> {
    if (this.closed || typeof data !== 'object' || data === null) return;
    const m = data as { type?: unknown; from?: unknown; keys?: unknown };
    if (m.type !== 'mm-data' || m.from === this.id || !Array.isArray(m.keys)) return;
    const keys = m.keys.filter((k): k is string => typeof k === 'string');
    try {
      const tx = this.db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const vals = await Promise.all(keys.map((k) => req(st.get(k))));
      keys.forEach((k, i) => {
        if (this.dirty.has(k)) return;
        const v = vals[i];
        if (typeof v === 'string') this.map.set(k, v);
        else this.map.delete(k);
      });
    } catch {
      return;
    }
    for (const cb of [...this.listeners]) {
      try { cb(keys); } catch { /* Listener-Fehler ignorieren */ }
    }
  }

  close(): void {
    if (this.closed) return;
    const last = this.flush().catch(() => undefined);
    this.closed = true;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.listeners.clear();
    if (this.channel) { this.channel.onmessage = null; try { this.channel.close(); } catch { /* ignorieren */ } }
    void last.then(() => { try { this.db.close(); } catch { /* ignorieren */ } });
  }
}
