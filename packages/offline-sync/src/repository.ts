// Repository: typisierter Zugriff auf Dokumente und Collections über einen StorageAdapter,
// mit In-Memory-Cache und Änderungsprotokoll (SyncState) für die Cloud-Synchronisierung.
// Collections liegen pro Datensatz unter `rec:<collection>:<id>`, die Outbox pro Eintrag unter `out:<seq>`; die
// Altformate `col:<collection>` und `sync.pending` werden beim Laden migriert.
import { getDeviceId } from './ids.ts';
import { compareMeta } from './merge.ts';
import { tombstone } from './meta.ts';
import type { ChangeRecord, StorageAdapter, SyncMeta, SyncState } from './types.ts';

export const MAX_PENDING = 2000;
const SYNC_KEY = 'sync';
const WIPE_KEY = 'wipeAt';
/** Schlüssel, die ein Reset immer behält. */
const ALWAYS_KEEP: readonly string[] = ['deviceId', WIPE_KEY];
/** Blockgröße der Altformat-Migrationen; so viel Speicher brauchen sie höchstens zusätzlich zur Endgröße. */
const MIGRATE_CHUNK = 500;
/** Wert im Batch: Schlüssel entfernen. */
const REMOVE = Symbol('remove');

const docKey = (name: string): string => `doc:${name}`;
/** Altformat: ganze Collection als ein JSON-Array. */
const colKey = (c: string): string => `col:${c}`;
/** Präfix der Datensatz-Schlüssel; der Name ist kodiert, damit `rec:a:` nie `rec:a:b:…` trifft. */
const recPrefix = (c: string): string => `rec:${encodeURIComponent(c)}:`;
/** Präfix der Outbox-Einträge: `out:<seq>` → ChangeRecord. */
const OUT_PREFIX = 'out:';
const outKey = (seq: number): string => `${OUT_PREFIX}${seq}`;
const emptySync = (): SyncState => ({
  lastPulledAt: null, lastPushedSeq: 0, nextSeq: 1, pending: [], cursor: null, fullPushNeeded: false, fullPushGen: 0, docClock: {},
});
const isDeleted = (x: { deletedAt?: unknown }): boolean => x.deletedAt !== null && x.deletedAt !== undefined;
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const hasId = (x: unknown): x is SyncMeta => isObj(x) && typeof x.id === 'string';
/** Zusammenfassungs-Schlüssel der Outbox: ein Eintrag je target+id. */
const tid = (c: Pick<ChangeRecord, 'target' | 'id'>): string => `${c.target}\u0000${c.id}`;

/** Gültiger Outbox-Eintrag (Folgenummer ganzzahlig ≥ 1, ggf. genau `seq`) als neues Objekt; sonst null. */
function asChange(x: unknown, seq?: number): ChangeRecord | null {
  if (!isObj(x) || typeof x.target !== 'string' || typeof x.id !== 'string') return null;
  const s = finite(x.seq);
  if (s === null || !Number.isSafeInteger(s) || s < 1 || (seq !== undefined && s !== seq)) return null;
  if (x.op !== 'upsert' && x.op !== 'delete') return null;
  return { seq: s, target: x.target, id: x.id, op: x.op, at: finite(x.at) ?? 0 };
}

/** Folgenummer aus einem Schlüssel `out:<seq>` (nur kanonische Schreibweise); sonst null. */
function outSeq(key: string): number | null {
  const n = Number(key.slice(OUT_PREFIX.length));
  return Number.isSafeInteger(n) && n >= 1 && outKey(n) === key ? n : null;
}

/** Gespeicherter Outbox-Eintrag; null, wenn Schlüssel und Wert nicht zusammenpassen oder der Wert unlesbar ist. */
function parseOut(key: string, raw: string | null): ChangeRecord | null {
  const seq = outSeq(key);
  if (seq === null || raw === null) return null;
  try {
    return asChange(JSON.parse(raw) as unknown, seq);
  } catch {
    return null;
  }
}

/** Skalare Felder aus dem gespeicherten `sync`, fehlende/ungültige (alte Stände) aufgefüllt; `pending` bleibt leer. */
function syncFrom(v: unknown): SyncState {
  const s = emptySync();
  if (!isObj(v)) return s;
  s.lastPulledAt = finite(v.lastPulledAt);
  s.lastPushedSeq = finite(v.lastPushedSeq) ?? 0;
  s.nextSeq = finite(v.nextSeq) ?? 1;
  if (typeof v.cursor === 'string') s.cursor = v.cursor;
  if (typeof v.fullPushNeeded === 'boolean') s.fullPushNeeded = v.fullPushNeeded;
  s.fullPushGen = finite(v.fullPushGen) ?? 0;
  if (isObj(v.docClock)) s.docClock = v.docClock as Record<string, number>;
  return s;
}

/**
 * Geladene Collection in Speicherreihenfolge (`ords` aufsteigend, Gleichstand: ID). `items[i]` ist null, wenn der
 * gespeicherte Wert unlesbar ist: Der Platzhalter ist für Lesezugriffe unsichtbar, `trim` entfernt ihn zuerst.
 */
interface Col {
  items: Array<SyncMeta | null>;
  ids: string[];
  ords: number[];
  byId: Map<string, number>;
  /** nächste freie Ordnungsnummer (neue IDs kommen ans Ende) */
  next: number;
  /** gecachte Sicht ohne Tombstones */
  live: SyncMeta[] | null;
}

const emptyCol = (): Col => ({ items: [], ids: [], ords: [], byId: new Map(), next: 0, live: null });

function append(s: Col, id: string, item: SyncMeta | null, ord: number = s.next): number {
  const i = s.items.length;
  s.byId.set(id, i);
  s.items.push(item);
  s.ids.push(id);
  s.ords.push(ord);
  s.next = Math.max(s.next, ord + 1);
  return i;
}

/** Gespeicherter Wert `[ord, record]`; unlesbar → Platzhalter (ord −1, also vorne). */
function parseEntry(id: string, raw: string | null): { ord: number; item: SyncMeta | null } {
  try {
    const v = raw === null ? null : (JSON.parse(raw) as unknown);
    const ord = Array.isArray(v) ? finite(v[0]) : null;
    if (Array.isArray(v) && ord !== null) return { ord, item: hasId(v[1]) && v[1].id === id ? v[1] : null };
  } catch {
    /* Platzhalter */
  }
  return { ord: -1, item: null };
}

export interface RepositoryOptions {
  now?: () => number;
  maxPending?: number;
}

export class Repository {
  /** Zählt jede Schreib-/Invalidierungsoperation (für abgeleitete Sichten). */
  revision = 0;
  /** Dokumente, SyncState, Lösch-Marke (Speicherschlüssel → geparster Wert) */
  private cache = new Map<string, unknown>();
  private cols = new Map<string, Col>();

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
    this.put(key, value);
  }

  /** Wert (bzw. `REMOVE`) in den Adapter; im Batch erst beim Verlassen des äußersten Batches. */
  private put(key: string, value: unknown): void {
    this.revision++;
    if (this.batchDepth > 0) this.deferred.set(key, value);
    else this.persist(key, value);
  }

  private persist(key: string, value: unknown): void {
    try {
      if (value === REMOVE) this.adapter.remove(key);
      else this.adapter.set(key, JSON.stringify(value));
    } catch {
      /* Cache bleibt gültig */
    }
  }

  /** Verschachtelungstiefe von batch(); > 0 = Schreibzugriffe auf den Adapter werden gesammelt. */
  private batchDepth = 0;
  /** Im laufenden Batch gesammelte Schreibzugriffe (Schlüssel → letzter Wert bzw. `REMOVE`). */
  private deferred = new Map<string, unknown>();

  private flushDeferred(): void {
    if (!this.deferred.size) return;
    const all = [...this.deferred];
    this.deferred.clear();
    for (const [k, v] of all) this.persist(k, v);
  }

  /**
   * Schreibzugriffe bündeln: Innerhalb von `fn` landen Änderungen sofort im Cache (alle Lesezugriffe
   * dieses Repositorys sehen sie), der Adapter erhält jeden geänderten Schlüssel aber nur einmal am Ende.
   * Ein Datensatz ist ein eigener Schlüssel; Mehrfach-Upserts derselben ID oder Dokument-/SyncState-Schreibzugriffe
   * werden so zu einem. `fn` muss synchron sein; Verschachtelung ist erlaubt, geschrieben wird beim Verlassen des
   * äußersten Batches (auch wenn `fn` wirft).
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
    this.cols.clear();
    this.dev = null;
    this.revision++;
  }

  /** Collection laden (lazy, nach `invalidate` erneut): Altformat migrieren, Datensatz-Schlüssel lesen, sortieren. */
  private col(c: string): Col {
    const hit = this.cols.get(c);
    if (hit) return hit;
    try {
      this.migrateLegacy(c);
    } catch {
      /* Rest bleibt in `col:` und wird beim nächsten Laden migriert */
    }
    const p = recPrefix(c);
    const rows = this.adapter.keys(p).map((k) => {
      const id = k.slice(p.length);
      return { id, ...parseEntry(id, this.adapter.get(k)) };
    });
    rows.sort((a, b) => a.ord - b.ord || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const s = emptyCol();
    for (const r of rows) append(s, r.id, r.item, r.ord);
    this.cols.set(c, s);
    return s;
  }

  /**
   * Altformat `col:<c>` in Einzelschlüssel überführen; schreibt direkt in den Adapter (unabhängig von batch()).
   * Abbruchsicher und idempotent: Nach jedem Adapter-Aufruf liegt jeder Eintrag in `col:` oder mindestens so neu
   * unter `rec:`. Rückwärts in Blöcken; nach jedem dauerhaft geschriebenen Block (`set` ≠ false) wird `col:` auf den
   * Rest davor gekürzt, am Ende entfernt – so braucht die Migration höchstens einen Block zusätzlichen Speicher.
   * Ordnungsnummer = erste Position der ID, Inhalt = neuester Stand (`compareMeta`). Liegt unter `rec:` schon ein
   * gleich neuer oder neuerer Stand (Abbruch, alter Tab hat `col:` erneut geschrieben), bleibt er.
   */
  private migrateLegacy(c: string): void {
    const key = colKey(c);
    const raw = this.adapter.get(key);
    if (raw === null) return;
    let arr: unknown = null;
    try {
      arr = JSON.parse(raw) as unknown;
    } catch {
      /* unlesbar: bisher eine leere Collection */
    }
    if (!Array.isArray(arr)) {
      this.adapter.remove(key);
      return;
    }
    const first = new Map<string, number>();
    const win = new Map<string, number>();
    arr.forEach((x: unknown, i) => {
      if (!hasId(x)) return; // ohne ID unsichtbar für getById und Push
      const w = win.get(x.id);
      if (w === undefined) first.set(x.id, i);
      if (w === undefined || compareMeta(x, arr[w] as SyncMeta) > 0) win.set(x.id, i);
    });
    const parts = arr.map((x: unknown) => JSON.stringify(x));
    const p = recPrefix(c);
    const done = new Set<string>();
    let durable = true;
    for (let end = arr.length; end > 0; end -= MIGRATE_CHUNK) {
      const start = Math.max(0, end - MIGRATE_CHUNK);
      for (let i = end - 1; i >= start; i--) {
        const x: unknown = arr[i];
        if (!hasId(x) || done.has(x.id)) continue;
        done.add(x.id);
        const w = win.get(x.id)!;
        const cur = parseEntry(x.id, this.adapter.get(p + x.id));
        if (cur.item && compareMeta(cur.item, arr[w] as SyncMeta) >= 0) continue;
        const ord = cur.item ? cur.ord : first.get(x.id)!;
        if (this.adapter.set(p + x.id, `[${ord},${parts[w]}]`) === false) durable = false;
      }
      if (!durable) continue; // Quelle nie kürzen, solange das Ziel nur flüchtig liegt
      if (start > 0) this.adapter.set(key, `[${parts.slice(0, start).join(',')}]`);
      else this.adapter.remove(key);
    }
  }

  /** Alle Schlüssel außer `keep` entfernen (Reset); Geräte-ID und Lösch-Marke bleiben immer, mit `sync` die Outbox. */
  clear(keep: readonly string[] = []): void {
    this.flushDeferred();
    const keepOut = keep.includes(SYNC_KEY);
    for (const k of this.adapter.keys('')) {
      if (keep.includes(k) || ALWAYS_KEEP.includes(k) || (keepOut && k.startsWith(OUT_PREFIX))) continue;
      this.adapter.remove(k);
    }
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
  /** Datensatz an Position `i` schreiben: nur dieser eine Schlüssel wird serialisiert. */
  private writeAt(c: string, s: Col, i: number): void {
    s.live = null;
    this.put(recPrefix(c) + s.ids[i], [s.ords[i], s.items[i]]);
  }

  /** Einträge einer Collection (ohne Tombstones, außer `includeDeleted`). */
  list<T extends SyncMeta>(collection: string, includeDeleted = false): T[] {
    const s = this.col(collection);
    if (includeDeleted) return s.items.filter((x) => x !== null) as T[];
    return (s.live ??= s.items.filter((x): x is SyncMeta => x !== null && !isDeleted(x))) as T[];
  }

  /** Eintrag per ID über den Index (inkl. Tombstones); null, wenn es ihn nicht gibt. */
  getById<T extends SyncMeta>(collection: string, id: string): T | null {
    const s = this.col(collection);
    const i = s.byId.get(id);
    return i === undefined ? null : ((s.items[i] ?? null) as T | null);
  }

  upsert<T extends SyncMeta>(collection: string, item: T, track = true): T {
    const s = this.col(collection);
    const i = s.byId.get(item.id);
    if (i === undefined) this.writeAt(collection, s, append(s, item.id, item));
    else {
      s.items[i] = item;
      this.writeAt(collection, s, i);
    }
    if (track) this.log(collection, item.id, 'upsert');
    return item;
  }

  /** Soft-Delete (Tombstone). Gibt false zurück, wenn es den Eintrag nicht (mehr) gibt. */
  remove(collection: string, id: string): boolean {
    const s = this.col(collection);
    const i = s.byId.get(id);
    const cur = i === undefined ? null : s.items[i];
    if (i === undefined || !cur || isDeleted(cur)) return false;
    s.items[i] = tombstone(cur, this.now(), this.deviceId);
    this.writeAt(collection, s, i);
    this.log(collection, id, 'delete');
    return true;
  }

  /**
   * Ganze Collection ersetzen (Migration, Import). Doppelte IDs: erste Position, neuester Stand (`compareMeta`).
   * Gebündelt (batch): Jeder Datensatz- und Outbox-Schlüssel erreicht den Adapter höchstens einmal.
   */
  replaceCollection<T extends SyncMeta>(collection: string, items: T[], track = true): void {
    this.batch(() => {
      const old = this.col(collection);
      const s = emptyCol();
      for (const it of items) {
        if (!hasId(it)) continue;
        const i = s.byId.get(it.id);
        if (i === undefined) append(s, it.id, it);
        else if (compareMeta(it, s.items[i]!) > 0) s.items[i] = it;
      }
      const p = recPrefix(collection);
      for (const id of old.ids) if (!s.byId.has(id)) this.put(p + id, REMOVE);
      this.cols.set(collection, s);
      for (let i = 0; i < s.items.length; i++) this.writeAt(collection, s, i);
      this.revision++;
      if (track) for (const it of items) if (hasId(it)) this.log(collection, it.id, 'upsert');
    });
  }

  /**
   * Auf `max` Einträge kürzen (physisch, kein Sync-Delete). Genau `length − max` Opfer nach dem Schlüssel
   * [Tombstone ? 0 : 1, sicher ? 0 : 1, createdAt] (aufsteigend = zuerst weg; Gleichstand: Position).
   * Sicher = nicht in der Outbox und – bei ausstehendem Vollabgleich – nicht vom eigenen Gerät; so fallen noch
   * nicht hochgeladene Einträge zuletzt weg, auch wenn der Pull fremde Datensätze hinten angehängt hat.
   * Die Reihenfolge der übrigen bleibt; geschrieben wird nur das Entfernen der Opfer-Schlüssel.
   */
  trim(collection: string, max: number): void {
    const s = this.col(collection);
    const n = s.items.length;
    if (n <= max) return; // Fast-Path: läuft nach jedem Upsert der App
    const st = this.getSyncState();
    const pending = new Set<string>();
    for (const c of st.pending) if (c.target === collection) pending.add(c.id);
    const own = st.fullPushNeeded ? this.deviceId : null;
    const k1 = new Uint8Array(n);
    const k2 = new Uint8Array(n);
    const k3 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = s.items[i];
      if (!x) continue; // unlesbare Einträge zuerst
      k1[i] = isDeleted(x) ? 0 : 1;
      const safe = !pending.has(s.ids[i]!) && (own === null || x.deviceId !== own);
      k2[i] = safe ? 0 : 1;
      k3[i] = finite(x.createdAt) ?? finite(x.updatedAt) ?? 0;
    }
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => k1[a]! - k1[b]! || k2[a]! - k2[b]! || k3[a]! - k3[b]! || a - b);
    const drop = new Set(order.slice(0, n - max));
    const p = recPrefix(collection);
    const keep = emptyCol();
    for (let i = 0; i < n; i++) {
      if (drop.has(i)) this.put(p + s.ids[i], REMOVE);
      else append(keep, s.ids[i]!, s.items[i]!, s.ords[i]);
    }
    keep.next = Math.max(keep.next, s.next);
    this.cols.set(collection, keep);
  }

  // ----- Änderungsprotokoll -----
  /**
   * SyncState (lazy, nach `invalidate` erneut): skalare Felder aus `sync`, die Outbox aus den Schlüsseln `out:<seq>`
   * aufsteigend nach `seq`. Das Altformat `sync.pending` wird vorher migriert. `nextSeq` liegt über dem höchsten
   * Outbox-Schlüssel, auch wenn `sync` einen älteren Wert hat. Je target+id bleibt nur der neueste Eintrag; ein
   * unlesbarer Eintrag wird entfernt und fordert einen Vollabgleich an, weil die Änderung sonst nie hochginge.
   */
  getSyncState(): SyncState {
    const hit = this.cache.get(SYNC_KEY) as SyncState | undefined;
    if (hit) return hit;
    try {
      this.migrateOutbox();
    } catch {
      /* Rest bleibt in `sync.pending` und wird beim nächsten Laden migriert */
    }
    let v: unknown = null;
    try {
      const raw = this.adapter.get(SYNC_KEY);
      v = raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      /* unlesbar: leerer Zustand (wie bisher) */
    }
    const s = syncFrom(v);
    const latest = new Map<string, ChangeRecord>();
    let top = 0;
    let lost = false;
    for (const k of this.adapter.keys(OUT_PREFIX)) {
      top = Math.max(top, outSeq(k) ?? 0);
      const c = parseOut(k, this.adapter.get(k));
      if (!c) lost = true;
      const prev = c ? latest.get(tid(c)) : undefined;
      if (!c || (prev && prev.seq > c.seq)) this.persist(k, REMOVE);
      else {
        if (prev) this.persist(outKey(prev.seq), REMOVE);
        latest.set(tid(c), c);
      }
    }
    s.pending = [...latest.values()].sort((a, b) => a.seq - b.seq);
    s.nextSeq = Math.max(s.nextSeq, top + 1, s.lastPushedSeq + 1);
    this.cache.set(SYNC_KEY, s);
    if (lost) this.markFullPush();
    return s;
  }

  /**
   * Altformat `sync.pending` in Einzelschlüssel `out:<seq>` überführen; schreibt direkt in den Adapter (unabhängig von
   * batch()). Abbruchsicher und idempotent wie `migrateLegacy`: Nach jedem Adapter-Aufruf liegt jeder Eintrag in
   * `sync.pending` oder mit derselben target+id unter `out:`. Rückwärts in Blöcken; nach jedem dauerhaft geschriebenen
   * Block (`set` ≠ false) wird `pending` auf den Rest davor gekürzt, am Ende bleibt `pending: []`. Liegt target+id schon
   * unter `out:` (Abbruch, alter Tab hat `sync` erneut geschrieben), bleibt dieser Eintrag; ist nur die Folgenummer
   * vergeben, bekommt der Eintrag eine neue über allen bekannten.
   */
  private migrateOutbox(): void {
    const raw = this.adapter.get(SYNC_KEY);
    if (raw === null) return;
    let v: unknown = null;
    try {
      v = JSON.parse(raw) as unknown;
    } catch {
      return; // unlesbar: getSyncState beginnt leer (wie bisher)
    }
    if (!isObj(v) || !Array.isArray(v.pending) || v.pending.length === 0) return;
    const legacy: unknown[] = v.pending;
    const taken = new Set<string>();
    const used = new Set<number>();
    let next = finite(v.nextSeq) ?? 1;
    for (const k of this.adapter.keys(OUT_PREFIX)) {
      const seq = outSeq(k);
      if (seq === null) continue;
      used.add(seq);
      next = Math.max(next, seq + 1);
      const c = parseOut(k, this.adapter.get(k));
      if (c) taken.add(tid(c));
    }
    for (const x of legacy) next = Math.max(next, (asChange(x)?.seq ?? 0) + 1);
    let durable = true;
    for (let end = legacy.length; end > 0; end -= MIGRATE_CHUNK) {
      const start = Math.max(0, end - MIGRATE_CHUNK);
      for (let i = end - 1; i >= start; i--) {
        const c = asChange(legacy[i]);
        if (!c || taken.has(tid(c))) continue; // ungültig (bisher verwaist quittiert) bzw. schon migriert
        taken.add(tid(c));
        if (used.has(c.seq)) c.seq = next++;
        used.add(c.seq);
        if (this.adapter.set(outKey(c.seq), JSON.stringify(c)) === false) durable = false;
      }
      if (!durable) continue; // Quelle nie kürzen, solange das Ziel nur flüchtig liegt
      this.adapter.set(SYNC_KEY, JSON.stringify({ ...v, nextSeq: next, pending: legacy.slice(0, start) }));
    }
  }

  /**
   * Skalare Felder nach `sync`; die Outbox liegt in eigenen Schlüsseln. `pending: []` bleibt stehen, damit eine ältere
   * Version (Tab, der beim Update offen ist) den Wert weiter als gültigen SyncState liest.
   */
  private saveSync(): void {
    this.put(SYNC_KEY, { ...this.getSyncState(), pending: [] });
  }

  private listeners = new Set<(target: string, id: string) => void>();

  /** Meldet protokollierte (lokale) Änderungen; angewendete Remote-Daten lösen nichts aus. */
  onTrackedChange(cb: (target: string, id: string) => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /**
   * Änderung protokollieren; je target+id zusammengefasst; bei Überlauf → Vollabgleich. Geschrieben wird nur der neue
   * Eintrag `out:<seq>` (und das Entfernen des bisherigen derselben target+id), nicht `sync`: `nextSeq` ergibt sich beim
   * Laden aus dem höchsten Outbox-Schlüssel. `sync` folgt nur, wenn Einträge ohne Nachfolger wegfallen.
   */
  private log(target: string, id: string, op: 'upsert' | 'delete'): void {
    const s = this.getSyncState();
    const rec: ChangeRecord = { seq: s.nextSeq++, target, id, op, at: this.now() };
    this.put(outKey(rec.seq), rec); // erst der neue Eintrag, dann den alten entfernen
    const i = s.pending.findIndex((c) => c.target === target && c.id === id);
    if (i >= 0) this.put(outKey(s.pending.splice(i, 1)[0]!.seq), REMOVE);
    s.pending.push(rec);
    if (s.pending.length > this.maxPending) {
      s.fullPushNeeded = true;
      s.fullPushGen++; // ein laufender Vollabgleich darf das Flag danach nicht löschen
      const dropped = s.pending;
      s.pending = [];
      this.saveSync(); // Flag dauerhaft, bevor die Einträge verschwinden
      for (const c of dropped) this.put(outKey(c.seq), REMOVE);
    }
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

  /** Vom Provider bestätigte Änderungen entfernen (je Eintrag ein Schlüssel; `sync` merkt `lastPushedSeq`, `nextSeq`). */
  ackChanges(seqs: number[]): void {
    if (!seqs.length) return;
    const s = this.getSyncState();
    const set = new Set(seqs);
    const rest: ChangeRecord[] = [];
    for (const c of s.pending) {
      if (set.has(c.seq)) this.put(outKey(c.seq), REMOVE);
      else rest.push(c);
    }
    s.pending = rest;
    s.lastPushedSeq = Math.max(s.lastPushedSeq, ...seqs);
    this.saveSync();
  }

  setLastPulledAt(t: number): void {
    this.getSyncState().lastPulledAt = t;
    this.saveSync();
  }
}
