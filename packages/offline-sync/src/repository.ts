// Repository: typisierter Zugriff auf Dokumente und Collections über einen StorageAdapter,
// mit In-Memory-Cache und Änderungsprotokoll (SyncState) für die Cloud-Synchronisierung.
import { getDeviceId } from './ids.ts';
import { tombstone } from './meta.ts';
import type { ChangeRecord, StorageAdapter, SyncMeta, SyncState } from './types.ts';

export const MAX_PENDING = 2000;
const SYNC_KEY = 'sync';
const WIPE_KEY = 'wipeAt';
/** Schlüssel, die ein Reset immer behält. */
const ALWAYS_KEEP: readonly string[] = ['deviceId', WIPE_KEY];

const docKey = (name: string): string => `doc:${name}`;
const colKey = (c: string): string => `col:${c}`;
const emptySync = (): SyncState => ({
  lastPulledAt: null, lastPushedSeq: 0, nextSeq: 1, pending: [], cursor: null, fullPushNeeded: false, fullPushGen: 0, docClock: {},
});
const isDeleted = (x: { deletedAt?: unknown }): boolean => x.deletedAt !== null && x.deletedAt !== undefined;
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

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
    if (this.batchDepth > 0) this.deferred.add(key);
    else this.persist(key, value);
  }

  private persist(key: string, value: unknown): void {
    try {
      this.adapter.set(key, JSON.stringify(value));
    } catch {
      /* Cache bleibt gültig */
    }
  }

  /** Verschachtelungstiefe von batch(); > 0 = Schreibzugriffe auf den Adapter werden gesammelt. */
  private batchDepth = 0;
  /** Schlüssel, deren Cache-Stand im laufenden Batch noch nicht im Adapter liegt. */
  private deferred = new Set<string>();

  private flushDeferred(): void {
    if (!this.deferred.size) return;
    const keys = [...this.deferred];
    this.deferred.clear();
    for (const k of keys) this.persist(k, this.cache.get(k));
  }

  /**
   * Schreibzugriffe bündeln: Innerhalb von `fn` landen Änderungen sofort im Cache (alle Lesezugriffe
   * dieses Repositorys sehen sie), der Adapter erhält jeden geänderten Schlüssel aber nur einmal am Ende.
   * Ohne Batch serialisiert jedes upsert() die ganze Collection – n Upserts kosten dann O(n²).
   * `fn` muss synchron sein; Verschachtelung ist erlaubt, geschrieben wird beim Verlassen des äußersten Batches
   * (auch wenn `fn` wirft).
   */
  batch<R>(fn: () => R): R {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      if (--this.batchDepth === 0) this.flushDeferred();
    }
  }

  /** Cache verwerfen (externe Änderung, z. B. anderer Tab). */
  invalidate(): void {
    this.flushDeferred();
    this.cache.clear();
    this.live.clear();
    this.index.clear();
    this.dev = null;
    this.revision++;
  }

  /** Alle Schlüssel außer `keep` entfernen (Reset); Geräte-ID und Lösch-Marke bleiben immer. */
  clear(keep: readonly string[] = []): void {
    this.flushDeferred();
    for (const k of this.adapter.keys('')) if (!keep.includes(k) && !ALWAYS_KEEP.includes(k)) this.adapter.remove(k);
    this.invalidate();
  }

  /** Zeitpunkt der zuletzt angewendeten Lösch-Markierung (0 = keine). */
  getAppliedWipe(): number {
    const v = this.read(WIPE_KEY);
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  }

  setAppliedWipe(at: number): void {
    this.write(WIPE_KEY, at);
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

  /** Eintrag per ID über den Index (inkl. Tombstones); null, wenn es ihn nicht gibt. */
  getById<T extends SyncMeta>(collection: string, id: string): T | null {
    const arr = this.raw<T>(collection);
    const i = this.idx(collection, arr).get(id);
    const x = i === undefined ? undefined : arr[i];
    return x !== null && typeof x === 'object' ? x : null;
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

  /**
   * Auf `max` Einträge kürzen (physisch, kein Sync-Delete). Genau `length − max` Opfer nach dem Schlüssel
   * [Tombstone ? 0 : 1, sicher ? 0 : 1, createdAt] (aufsteigend = zuerst weg; Gleichstand: Array-Position).
   * Sicher = nicht in der Outbox und – bei ausstehendem Vollabgleich – nicht vom eigenen Gerät; so fallen noch
   * nicht hochgeladene Einträge zuletzt weg, auch wenn der Pull fremde Datensätze hinten angehängt hat.
   * Die Reihenfolge der übrigen bleibt.
   */
  trim(collection: string, max: number): void {
    const arr = this.raw<SyncMeta>(collection);
    if (arr.length <= max) return; // Fast-Path: läuft nach jedem Upsert der App
    const s = this.getSyncState();
    const pending = new Set<string>();
    for (const c of s.pending) if (c.target === collection) pending.add(c.id);
    const own = s.fullPushNeeded ? this.deviceId : null;
    const n = arr.length;
    const k1 = new Uint8Array(n);
    const k2 = new Uint8Array(n);
    const k3 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = arr[i] as Partial<SyncMeta> | null;
      if (!isObj(x)) continue; // kaputte Einträge zuerst
      k1[i] = isDeleted(x) ? 0 : 1;
      const safe = !(typeof x.id === 'string' && pending.has(x.id)) && (own === null || x.deviceId !== own);
      k2[i] = safe ? 0 : 1;
      k3[i] = finite(x.createdAt) ?? finite(x.updatedAt) ?? 0;
    }
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => k1[a]! - k1[b]! || k2[a]! - k2[b]! || k3[a]! - k3[b]! || a - b);
    const drop = new Set(order.slice(0, n - max));
    this.live.delete(collection);
    this.index.delete(collection);
    this.write(colKey(collection), arr.filter((_, i) => !drop.has(i)));
  }

  // ----- Änderungsprotokoll -----
  getSyncState(): SyncState {
    const v = this.read(SYNC_KEY);
    if (v !== null && typeof v === 'object' && Array.isArray((v as SyncState).pending)) {
      const st = v as SyncState;
      // Felder alter Stände auffüllen
      if (st.cursor === undefined) st.cursor = null;
      if (typeof st.fullPushNeeded !== 'boolean') st.fullPushNeeded = false;
      if (finite(st.fullPushGen) === null) st.fullPushGen = 0;
      if (!isObj(st.docClock)) st.docClock = {};
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
      s.fullPushGen++; // ein laufender Vollabgleich darf das Flag danach nicht löschen
      s.pending = [];
    }
    if (save) this.saveSync();
    for (const cb of [...this.listeners]) {
      try { cb(target, id); } catch { /* Listener-Fehler ignorieren */ }
    }
  }

  /** Vollabgleich anfordern; erhöht `fullPushGen`. */
  markFullPush(): void {
    const s = this.getSyncState();
    s.fullPushNeeded = true;
    s.fullPushGen++;
    this.saveSync();
  }

  /**
   * Vollabgleich als erledigt markieren – nur, wenn seit Beginn des Pushs (`gen`) kein neuer angefordert wurde.
   * Aufruf erst nach erfolgreichem Senden aller Pakete; ein Abbruch davor lässt das Flag stehen.
   */
  clearFullPushIf(gen: number): boolean {
    const s = this.getSyncState();
    if (s.fullPushGen !== gen) return false;
    s.fullPushNeeded = false;
    this.saveSync();
    return true;
  }

  /** Höchster gesehener Remote-`updatedAt` eines Dokuments (0 = keiner). */
  getDocClock(name: string): number {
    const c = this.getSyncState().docClock;
    return Object.hasOwn(c, name) ? (finite(c[name]) ?? 0) : 0;
  }

  /** Remote-`updatedAt` eines Dokuments merken, wenn er größer ist als der bisher gesehene. */
  noteDocClock(name: string, at: number): void {
    if (!Number.isFinite(at) || at <= this.getDocClock(name)) return;
    const s = this.getSyncState();
    s.docClock = { ...s.docClock, [name]: at }; // berechneter Schlüssel: auch '__proto__' wird eigenes Feld
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
