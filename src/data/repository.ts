// Repository: typisierter Zugriff auf Dokumente und Collections über einen StorageAdapter,
// mit In-Memory-Cache und Änderungsprotokoll (SyncState) für eine spätere Cloud-Synchronisierung.
import type { ChangeRecord, StorageAdapter, SyncCollection, SyncDocument, SyncMeta, SyncState } from '../types.ts';
import { getDeviceId } from './ids.ts';
import { tombstone } from './meta.ts';

export const MAX_PENDING = 2000;
const SYNC_KEY = 'sync';
const DOC_NAMES: readonly string[] = ['profile', 'settings', 'reviews', 'activity', 'dailyResults', 'chainBest', 'parallel'];

const docKey = (name: string): string => `doc:${name}`;
const colKey = (c: string): string => `col:${c}`;
const isDocName = (n: string): n is SyncDocument => DOC_NAMES.includes(n);
const emptySync = (): SyncState => ({ lastPulledAt: null, lastPushedSeq: 0, nextSeq: 1, pending: [] });

export class Repository {
  /** Zählt jede Schreib-/Invalidierungsoperation (für abgeleitete Sichten). */
  revision = 0;
  private cache = new Map<string, unknown>();
  private live = new Map<string, unknown[]>();

  readonly adapter: StorageAdapter;
  private readonly now: () => number;
  constructor(adapter: StorageAdapter, now: () => number = Date.now) { this.adapter = adapter; this.now = now; }

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

  putDoc<T>(name: string, value: T, track = true): void {
    this.write(docKey(name), value);
    if (track && isDocName(name)) this.log(name, name, 'upsert');
  }

  // ----- Collections -----
  private raw<T>(c: string): T[] {
    const v = this.read(colKey(c));
    return Array.isArray(v) ? (v as T[]) : [];
  }

  /** Einträge einer Collection (ohne Tombstones, außer `includeDeleted`). */
  list<T extends SyncMeta>(collection: SyncCollection, includeDeleted = false): T[] {
    const all = this.raw<T>(collection).filter((x) => x !== null && typeof x === 'object');
    if (includeDeleted) return all;
    let l = this.live.get(collection) as T[] | undefined;
    if (!l) {
      l = all.filter((x) => x.deletedAt === null || x.deletedAt === undefined);
      this.live.set(collection, l);
    }
    return l;
  }

  upsert<T extends SyncMeta>(collection: SyncCollection, item: T, track = true): T {
    const arr = this.raw<T>(collection);
    const idx = arr.findIndex((x) => x && x.id === item.id);
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    this.live.delete(collection);
    this.write(colKey(collection), arr);
    if (track) this.log(collection, item.id, 'upsert');
    return item;
  }

  /** Soft-Delete (Tombstone). Gibt false zurück, wenn es den Eintrag nicht (mehr) gibt. */
  remove(collection: SyncCollection, id: string): boolean {
    const arr = this.raw<SyncMeta>(collection);
    const idx = arr.findIndex((x) => x && x.id === id);
    const cur = arr[idx];
    if (!cur || cur.deletedAt !== null && cur.deletedAt !== undefined) return false;
    arr[idx] = tombstone(cur, this.now(), this.deviceId);
    this.live.delete(collection);
    this.write(colKey(collection), arr);
    this.log(collection, id, 'delete');
    return true;
  }

  /** Ganze Collection ersetzen (Migration, Import). */
  replaceCollection<T extends SyncMeta>(collection: SyncCollection, items: T[], track = true): void {
    this.live.delete(collection);
    this.write(colKey(collection), items);
    if (track) {
      for (const it of items) this.log(collection, it.id, 'upsert', false);
      this.saveSync();
    }
  }

  /** Auf `max` Einträge kürzen: zuerst Tombstones, dann die ältesten (physisch, kein Sync-Delete). */
  trim(collection: SyncCollection, max: number): void {
    let arr = this.raw<SyncMeta>(collection);
    if (arr.length <= max) return;
    let excess = arr.length - max;
    arr = arr.filter((x) => {
      if (excess > 0 && x && x.deletedAt !== null && x.deletedAt !== undefined) {
        excess--;
        return false;
      }
      return true;
    });
    if (excess > 0) arr = arr.slice(excess);
    this.live.delete(collection);
    this.write(colKey(collection), arr);
  }

  // ----- Änderungsprotokoll -----
  getSyncState(): SyncState {
    const v = this.read(SYNC_KEY);
    if (v !== null && typeof v === 'object' && Array.isArray((v as SyncState).pending)) return v as SyncState;
    const s = emptySync();
    this.cache.set(SYNC_KEY, s);
    return s;
  }

  private saveSync(): void {
    this.write(SYNC_KEY, this.getSyncState());
  }

  /** Änderung protokollieren; je target+id zusammengefasst, max. MAX_PENDING (älteste fallen weg). */
  private log(target: SyncCollection | SyncDocument, id: string, op: 'upsert' | 'delete', save = true): void {
    const s = this.getSyncState();
    const i = s.pending.findIndex((c) => c.target === target && c.id === id);
    if (i >= 0) s.pending.splice(i, 1);
    const rec: ChangeRecord = { seq: s.nextSeq++, target, id, op, at: this.now() };
    s.pending.push(rec);
    if (s.pending.length > MAX_PENDING) s.pending.splice(0, s.pending.length - MAX_PENDING);
    if (save) this.saveSync();
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
