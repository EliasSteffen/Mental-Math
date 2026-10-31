// Repository: typisierter Zugriff auf Dokumente und Collections über einen StorageAdapter,
// mit In-Memory-Cache und Änderungsprotokoll (SyncState) für die Cloud-Synchronisierung.
import { getDeviceId } from './ids.ts';
import { tombstone } from './meta.ts';
import type { ChangeRecord, StorageAdapter, SyncMeta, SyncState } from './types.ts';

export const MAX_PENDING = 2000;
const SYNC_KEY = 'sync';

const docKey = (name: string): string => `doc:${name}`;
const colKey = (c: string): string => `col:${c}`;
const emptySync = (): SyncState => ({ lastPulledAt: null, lastPushedSeq: 0, nextSeq: 1, pending: [], cursor: null, fullPushNeeded: false });
const isDeleted = (x: { deletedAt?: unknown }): boolean => x.deletedAt !== null && x.deletedAt !== undefined;

export interface RepositoryOptions {
  now?: () => number;
  maxPending?: number;
}

/** ID-Index einer Collection; gilt nur für genau dieses Array-Objekt. */
interface Index { arr: unknown[]; byId: Map<string, number> }

export class Repository {
  /** Zählt jede Schreib-/Invalidierungsoperation (für abgeleitete Sichten). */
  revision = 0;
  private cache = new Map<string, unknown>();
  private live = new Map<string, unknown[]>();
  private index = new Map<string, Index>();

  readonly adapter: StorageAdapter;
  private readonly now: () => number;
  private readonly maxPending: number;
  constructor(adapter: StorageAdapter, o: RepositoryOptions = {}) {
    this.adapter = adapter;
    this.now = o.now ?? Date.now;
    this.maxPending = o.maxPending ?? MAX_PENDING;
  }

  private dev: string | null = null;
  get deviceId(): string { return (this.dev ??= getDeviceId(this.adapter)); }

  // ----- Low-Level -----
  private read(key: string): unknown {
    if (this.cache.has(key)) return this.cache.get(key);
    let v: unknown = null;
    try {
      const raw = this.adapter.get(key);
      v = raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      v = null;
    }
    this.cache.set(key, v);
    return v;
  }

  private write(key: string, value: unknown): void {
    this.cache.set(key, value);
    this.revision++;
    try {
      this.adapter.set(key, JSON.stringify(value));
    } catch {
      /* Cache bleibt gültig */
    }
  }

  /** Cache verwerfen (externe Änderung, z. B. anderer Tab). */
  invalidate(): void {
    this.cache.clear();
    this.live.clear();
    this.index.clear();
    this.dev = null;
    this.revision++;
  }

  /** Alle Schlüssel außer `keep` entfernen (Reset). */
  clear(keep: readonly string[] = []): void {
    for (const k of this.adapter.keys('')) if (!keep.includes(k)) this.adapter.remove(k);
    this.invalidate();
  }

  // ----- Dokumente -----
  getDoc<T>(name: string): T | null {
    const v = this.read(docKey(name));
    return v === null || v === undefined ? null : (v as T);
  }

  /** Dokument schreiben; `track` protokolliert die Änderung (Outbox) für beliebige Dokumentnamen. */
  putDoc<T>(name: string, value: T, track = true): void {
    this.write(docKey(name), value);
    if (track) this.log(name, name, 'upsert');
  }

  // ----- Collections -----
  private raw<T>(c: string): T[] {
    const v = this.read(colKey(c));
    return Array.isArray(v) ? (v as T[]) : [];
  }

  /** Index (id → Position) passend zum aktuellen Array; wird bei neuem Array-Objekt lazy neu gebaut. */
  private idx(c: string, arr: unknown[]): Map<string, number> {
    const cur = this.index.get(c);
    if (cur && cur.arr === arr) return cur.byId;
    const byId = new Map<string, number>();
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i] as { id?: unknown } | null;
      if (x && typeof x === 'object' && typeof x.id === 'string' && !byId.has(x.id)) byId.set(x.id, i);
    }
    this.index.set(c, { arr, byId });
    return byId;
  }

  /** Einträge einer Collection (ohne Tombstones, außer `includeDeleted`). */
  list<T extends SyncMeta>(collection: string, includeDeleted = false): T[] {
    const all = this.raw<T>(collection).filter((x) => x !== null && typeof x === 'object');
    if (includeDeleted) return all;
    let l = this.live.get(collection) as T[] | undefined;
    if (!l) {
      l = all.filter((x) => !isDeleted(x));
      this.live.set(collection, l);
    }
    return l;
  }

  upsert<T extends SyncMeta>(collection: string, item: T, track = true): T {
    const arr = this.raw<T>(collection);
    const byId = this.idx(collection, arr);
    const i = byId.get(item.id);
    if (i !== undefined) arr[i] = item;
    else {
      byId.set(item.id, arr.length);
      arr.push(item);
    }
    this.live.delete(collection);
    this.write(colKey(collection), arr);
    if (track) this.log(collection, item.id, 'upsert');
    return item;
  }

  /** Soft-Delete (Tombstone). Gibt false zurück, wenn es den Eintrag nicht (mehr) gibt. */
  remove(collection: string, id: string): boolean {
    const arr = this.raw<SyncMeta>(collection);
    const i = this.idx(collection, arr).get(id);
    const cur = i === undefined ? undefined : arr[i];
    if (i === undefined || !cur || isDeleted(cur)) return false;
    arr[i] = tombstone(cur, this.now(), this.deviceId);
    this.live.delete(collection);
    this.write(colKey(collection), arr);
    this.log(collection, id, 'delete');
    return true;
  }

  /** Ganze Collection ersetzen (Migration, Import). */
  replaceCollection<T extends SyncMeta>(collection: string, items: T[], track = true): void {
    this.live.delete(collection);
    this.index.delete(collection);
    this.write(colKey(collection), items);
    if (track) {
      for (const it of items) this.log(collection, it.id, 'upsert', false);
      this.saveSync();
    }
  }

  /** Auf `max` Einträge kürzen: zuerst Tombstones, dann die ältesten (physisch, kein Sync-Delete). */
  trim(collection: string, max: number): void {
    let arr = this.raw<SyncMeta>(collection);
    if (arr.length <= max) return;
    let excess = arr.length - max;
    arr = arr.filter((x) => {
      if (excess > 0 && x && isDeleted(x)) {
        excess--;
        return false;
      }
      return true;
    });
    if (excess > 0) arr = arr.slice(excess);
    this.live.delete(collection);
    this.index.delete(collection);
    this.write(colKey(collection), arr);
  }

  // ----- Änderungsprotokoll -----
  getSyncState(): SyncState {
    const v = this.read(SYNC_KEY);
    if (v !== null && typeof v === 'object' && Array.isArray((v as SyncState).pending)) {
      const st = v as SyncState;
      // Felder alter Stände auffüllen
      if (st.cursor === undefined) st.cursor = null;
      if (typeof st.fullPushNeeded !== 'boolean') st.fullPushNeeded = false;
      return st;
    }
    const s = emptySync();
    this.cache.set(SYNC_KEY, s);
    return s;
  }

  private saveSync(): void {
    this.write(SYNC_KEY, this.getSyncState());
  }

  private listeners = new Set<(target: string, id: string) => void>();

  /** Meldet protokollierte (lokale) Änderungen; angewendete Remote-Daten lösen nichts aus. */
  onTrackedChange(cb: (target: string, id: string) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /** Änderung protokollieren; je target+id zusammengefasst; bei Überlauf → Vollabgleich. */
  private log(target: string, id: string, op: 'upsert' | 'delete', save = true): void {
    const s = this.getSyncState();
    const i = s.pending.findIndex((c) => c.target === target && c.id === id);
    if (i >= 0) s.pending.splice(i, 1);
    const rec: ChangeRecord = { seq: s.nextSeq++, target, id, op, at: this.now() };
    s.pending.push(rec);
    if (s.pending.length > this.maxPending) {
      s.fullPushNeeded = true;
      s.pending = [];
    }
    if (save) this.saveSync();
    for (const cb of [...this.listeners]) {
      try { cb(target, id); } catch { /* Listener-Fehler ignorieren */ }
    }
  }

  markFullPush(): void {
    this.getSyncState().fullPushNeeded = true;
    this.saveSync();
  }

  clearFullPush(): void {
    this.getSyncState().fullPushNeeded = false;
    this.saveSync();
  }

  setCursor(c: string | null): void {
    this.getSyncState().cursor = c;
    this.saveSync();
  }

  /** Vom Provider bestätigte Änderungen entfernen. */
  ackChanges(seqs: number[]): void {
    if (!seqs.length) return;
    const s = this.getSyncState();
    const set = new Set(seqs);
    s.pending = s.pending.filter((c) => !set.has(c.seq));
    s.lastPushedSeq = Math.max(s.lastPushedSeq, ...seqs);
    this.saveSync();
  }

  setLastPulledAt(t: number): void {
    this.getSyncState().lastPulledAt = t;
    this.saveSync();
  }
}
