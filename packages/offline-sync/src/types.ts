// Vertrag des Pakets offline-sync (siehe docs/PLAN-data.md §6). Änderungen nur durch den Architekten.
// Generisch: keine Kenntnis von Kopfrechen-Begriffen. Fachregeln kommen per SyncSchema aus der App.

// ---------- Datensätze & Änderungsprotokoll ----------
/** Metadaten jedes synchronisierbaren Datensatzes (Konflikt: höchstes (updatedAt, rev, deviceId) gewinnt). */
export interface SyncMeta {
  id: string;               // global eindeutig (UUID oder eigene stabile ID, max. 64 Zeichen)
  createdAt: number;        // Epoch-ms
  updatedAt: number;        // Epoch-ms, bei jeder Änderung gesetzt
  deletedAt: number | null; // Soft-Delete (Tombstone)
  deviceId: string;         // Gerät der letzten Änderung
  rev: number;              // +1 je Änderung
}
/** Ein Datensatz einer Collection. */
export type SyncRecord = SyncMeta & Record<string, unknown>;

export interface ChangeRecord {
  seq: number;              // lokal fortlaufend
  target: string;           // Collection- oder Dokumentname
  id: string;               // Datensatz-ID bzw. Dokumentname
  op: 'upsert' | 'delete';
  at: number;               // Epoch-ms
}

export interface SyncState {
  lastPulledAt: number | null;
  lastPushedSeq: number;
  nextSeq: number;
  pending: ChangeRecord[];  // max. maxPending; bei Überlauf → fullPushNeeded
  cursor: string | null;    // opaker Pull-Cursor des Providers
  fullPushNeeded: boolean;  // nächste Runde lädt alle lokalen Daten hoch
}

// ---------- Lokaler Speicher ----------
/** Schlüssel/Wert-Speicher (synchron). */
export interface StorageAdapter {
  readonly name: string;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}
/** Persistenter Adapter (IndexedDB): liest synchron aus dem Speicherabbild, schreibt verzögert. */
export interface PersistentAdapter extends StorageAdapter {
  flush(): Promise<void>;
  /** Änderungen anderer Tabs; die Schlüssel sind beim Aufruf bereits nachgeladen. */
  onExternalChange(cb: (keys: string[]) => void): () => void;
  close(): void;
}

// ---------- Fachregeln der App ----------
export interface CollectionSpec {
  name: string;
  /** lokal höchstens so viele Einträge (älteste zuerst entfernt, kein Sync-Delete); ohne = unbegrenzt */
  limit?: number;
}

export interface MergeContext { localUpdatedAt: number | null; remoteUpdatedAt: number }

export interface DocSpec {
  /** lokaler Dokumentname (Repository: getDoc/putDoc) */
  name: string;
  /** Zusammenführen lokal + remote → neues lokales Dokument. Muss kommutativ/idempotent sein, wo möglich. */
  merge(local: Record<string, unknown>, remote: Record<string, unknown>, ctx: MergeContext): Record<string, unknown>;
  /** Daten für den Upload (z. B. geräte-lokale Felder entfernen). Default: unverändert. */
  toRemote?(local: Record<string, unknown>): Record<string, unknown>;
  /** updatedAt des lokalen Dokuments (z. B. aus einem Feld); null → beim Push gilt „jetzt“. Default: null */
  updatedAt?(local: Record<string, unknown>): number | null;
  /**
   * Pro Gerät: Remote-Name `${name}:${deviceId}`. Das eigene Remote-Dokument wird per merge zurückgeführt;
   * Dokumente anderer Geräte landen lokal (ohne Tracking) in `${name}Remote` als { [deviceId]: data }.
   */
  perDevice?: boolean;
}

/** Was synchronisiert wird. Dokumente, die nicht im Schema stehen, werden nie hochgeladen (ihre Änderungen sofort quittiert). */
export interface SyncSchema {
  collections: CollectionSpec[];
  docs: DocSpec[];
}

// ---------- Remote ----------
export interface RemoteDoc { name: string; data: Record<string, unknown>; updatedAt: number; deviceId: string }

export interface PullPage {
  records: Array<{ collection: string; item: SyncRecord }>;
  docs: RemoteDoc[];
  /** opak, gehört dem Provider; die Engine speichert ihn nur */
  cursor: string | null;
  hasMore: boolean;
}

export type SyncErrorKind = 'offline' | 'auth' | 'invalid' | 'server';

/** Cloud-Gegenstück. Wirft ausschließlich SyncError (errors.ts). */
export interface RemoteSyncProvider {
  readonly name: string;
  upsertRecords(collection: string, items: readonly SyncRecord[]): Promise<void>;
  upsertDocs(docs: readonly RemoteDoc[]): Promise<void>;
  /** rewind: Positionen um 60 s zurücksetzen (erste Seite einer Runde) */
  pull(cursor: string | null, o: { limit: number; rewind: boolean }): Promise<PullPage>;
  deleteAll(): Promise<void>;
}

// ---------- Status ----------
export type SyncPhase = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  phase: SyncPhase;
  lastSyncAt: number | null;
  lastError: SyncErrorKind | null;
  pending: number;
  /** Zähler der letzten Runde */
  pushed: number;
  pulled: number;
  rejected: number;
}

// ---------- Supabase-Adapter (offline-sync/supabase) ----------
export interface SupabaseCollectionSpec {
  table: string;
  /** Datensatz → Zeile (user_id setzt der Mapper) */
  toRow(item: SyncRecord, userId: string): Record<string, unknown>;
  /** Zeile → Datensatz; null bei ungültiger Zeile (wird übersprungen) */
  fromRow(row: unknown): SyncRecord | null;
  /** erster Pull (ohne Cursor) nur Zeilen mit created_at jünger als so viele Tage */
  initialWindowDays?: number;
}
export interface SupabaseSyncSchema {
  /** Collection-Name → Tabelle + Mapper */
  collections: Record<string, SupabaseCollectionSpec>;
  /** Tabelle mit (user_id, name, data jsonb, updated_at bigint, device_id, server_updated_at) */
  docsTable: string;
  /** RPC ohne Parameter, die alle Zeilen des Nutzers löscht */
  deleteAllRpc: string;
}
