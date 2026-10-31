// SyncEngine: Pull (Merge) dann Push (Outbox) gegen einen RemoteSyncProvider, gesteuert durch ein SyncSchema.
import { isSyncError } from './errors.ts';
import { compareMeta, stableEqual } from './merge.ts';
import type { Repository } from './repository.ts';
import type {
  ChangeRecord, DocSpec, RemoteDoc, RemoteSyncProvider, SyncErrorKind, SyncMeta, SyncRecord, SyncSchema, SyncStatus,
} from './types.ts';

export interface SyncEngineOptions {
  schema: SyncSchema;
  deviceId: () => string;
  now?: () => number;
  pageSize?: number;
  chunkSize?: number;
}

const MAX_PAGES = 200;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x);

type Unit =
  | { kind: 'rec'; collection: string; item: SyncRecord }
  | { kind: 'doc'; doc: RemoteDoc };
interface Entry { unit: Unit; seqs: number[] }

interface Counters { pushed: number; pulled: number; rejected: number }

export class SyncEngine {
  private readonly repo: Repository;
  private readonly o: SyncEngineOptions;
  private readonly collections = new Map<string, number | undefined>();
  private readonly docs: DocSpec[];
  private provider: RemoteSyncProvider | null = null;
  private lastSyncAt: number | null = null;
  private lastError: SyncErrorKind | null = null;
  private inflight: Promise<SyncStatus> | null = null;
  private last: Counters = { pushed: 0, pulled: 0, rejected: 0 };

  constructor(repo: Repository, o: SyncEngineOptions) {
    this.repo = repo;
    this.o = o;
    for (const c of o.schema.collections) this.collections.set(c.name, c.limit);
    this.docs = [...o.schema.docs];
  }

  private now(): number { return (this.o.now ?? Date.now)(); }
  setProvider(p: RemoteSyncProvider | null): void { this.provider = p; }
  hasProvider(): boolean { return this.provider !== null; }
  pendingCount(): number { return this.repo.getSyncState().pending.length; }

  private status(phase: SyncStatus['phase']): SyncStatus {
    return { phase, lastSyncAt: this.lastSyncAt, lastError: this.lastError, pending: this.pendingCount(), ...this.last };
  }

  /** Eine Runde; wirft nie. */
  syncNow(): Promise<SyncStatus> {
    if (!this.provider) return Promise.resolve(this.status('disabled'));
    this.inflight ??= this.run(this.provider).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async wipeRemote(): Promise<void> {
    if (!this.provider) return;
    await this.provider.deleteAll();
    this.repo.setCursor(null);
  }

  private async run(provider: RemoteSyncProvider): Promise<SyncStatus> {
    const c: Counters = { pushed: 0, pulled: 0, rejected: 0 };
    this.last = c;
    try {
      await this.pull(provider, c);
      await this.push(provider, c);
      this.lastSyncAt = this.now();
      this.lastError = null;
      return this.status('idle');
    } catch (e) {
      const kind: SyncErrorKind = isSyncError(e) ? e.kind : 'server';
      this.lastError = kind;
      return this.status(kind === 'offline' ? 'offline' : 'error');
    }
  }

  // ----- Pull -----
  private async pull(provider: RemoteSyncProvider, c: Counters): Promise<void> {
    const limit = this.o.pageSize ?? 500;
    let cursor = this.repo.getSyncState().cursor;
    let first = true;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await provider.pull(cursor, { limit, rewind: first });
      first = false;
      c.pulled += this.applyRecords(page.records);
      for (const d of page.docs) if (this.applyDoc(d)) c.pulled++;
      cursor = page.cursor;
      this.repo.setCursor(cursor);
      if (!page.hasMore) break;
    }
    for (const [name, max] of this.collections) if (max !== undefined) this.repo.trim(name, max);
  }

  private applyRecords(records: Array<{ collection: string; item: SyncRecord }>): number {
    const maps = new Map<string, Map<string, SyncMeta>>();
    let applied = 0;
    for (const { collection, item } of records) {
      if (!this.collections.has(collection) || !isObj(item) || typeof item.id !== 'string') continue;
      let m = maps.get(collection);
      if (!m) {
        m = new Map(this.repo.list<SyncMeta>(collection, true).map((x) => [x.id, x]));
        maps.set(collection, m);
      }
      const local = m.get(item.id);
      if (local && compareMeta(item, local) <= 0) continue;
      this.repo.upsert(collection, item, false);
      m.set(item.id, item);
      applied++;
    }
    return applied;
  }

  /** Passende DocSpec zum Remote-Namen (exakt oder perDevice `${name}:${id}`) samt Geräte-ID. */
  private resolveDoc(remoteName: string): { spec: DocSpec; id: string | null } | null {
    for (const spec of this.docs) {
      if (!spec.perDevice && spec.name === remoteName) return { spec, id: null };
    }
    for (const spec of this.docs) {
      const prefix = `${spec.name}:`;
      if (spec.perDevice && remoteName.startsWith(prefix)) return { spec, id: remoteName.slice(prefix.length) };
    }
    return null;
  }

  private applyDoc(d: RemoteDoc): boolean {
    if (!isObj(d) || typeof d.name !== 'string') return false;
    const hit = this.resolveDoc(d.name);
    if (!hit) return false;
    const { spec, id } = hit;
    const data = isObj(d.data) ? d.data : {};
    if (id !== null && id !== this.o.deviceId()) {
      // Dokument eines anderen Geräts: lokal ablegen, ohne Tracking
      const rname = `${spec.name}Remote`;
      const cur = this.repo.getDoc<Obj>(rname) ?? {};
      if (stableEqual(cur[id], data)) return false;
      this.repo.putDoc(rname, { ...cur, [id]: data }, false);
      return true;
    }
    const local = this.repo.getDoc<Obj>(spec.name) ?? {};
    const merged = spec.merge(local, data, { localUpdatedAt: spec.updatedAt?.(local) ?? null, remoteUpdatedAt: d.updatedAt });
    if (stableEqual(merged, local)) return false;
    const toRemote = spec.toRemote ?? ((x: Obj) => x);
    this.repo.putDoc(spec.name, merged, !stableEqual(toRemote(merged), data));
    return true;
  }

  // ----- Push -----
  private docUnit(spec: DocSpec): RemoteDoc | null {
    const local = this.repo.getDoc<Obj>(spec.name);
    if (!isObj(local)) return null;
    const dev = this.o.deviceId();
    return {
      name: spec.perDevice ? `${spec.name}:${dev}` : spec.name,
      data: (spec.toRemote ?? ((x: Obj) => x))(local),
      updatedAt: spec.updatedAt?.(local) ?? this.now(),
      deviceId: dev,
    };
  }

  private unitFor(t: Pick<ChangeRecord, 'target' | 'id'>): Unit | null {
    if (this.collections.has(t.target)) {
      const item = this.repo.list<SyncMeta>(t.target, true).find((x) => x.id === t.id);
      return item ? { kind: 'rec', collection: t.target, item: item as SyncRecord } : null;
    }
    const spec = this.docs.find((s) => s.name === t.target);
    const doc = spec ? this.docUnit(spec) : null;
    return doc ? { kind: 'doc', doc } : null;
  }

  private async send(provider: RemoteSyncProvider, units: Unit[]): Promise<void> {
    const first = units[0];
    if (!first) return;
    if (first.kind === 'rec') {
      await provider.upsertRecords(first.collection, units.flatMap((u) => (u.kind === 'rec' ? [u.item] : [])));
    } else {
      await provider.upsertDocs(units.flatMap((u) => (u.kind === 'doc' ? [u.doc] : [])));
    }
  }

  /** Paket senden; bei 'invalid' einzeln wiederholen. Abgelehnte Einheiten zählen als erledigt. */
  private async sendChunk(provider: RemoteSyncProvider, units: Unit[], c: Counters): Promise<void> {
    try {
      await this.send(provider, units);
      c.pushed += units.length;
      return;
    } catch (e) {
      if (!isSyncError(e) || e.kind !== 'invalid') throw e;
    }
    for (const u of units) {
      try {
        await this.send(provider, [u]);
        c.pushed++;
      } catch (e) {
        if (!isSyncError(e) || e.kind !== 'invalid') throw e;
        c.rejected++;
        console.warn('sync: Datensatz abgelehnt', u.kind === 'rec' ? u.item.id : u.doc.name);
      }
    }
  }

  private async push(provider: RemoteSyncProvider, c: Counters): Promise<void> {
    const st = this.repo.getSyncState();
    const full = st.fullPushNeeded;
    const snapshot = [...st.pending];
    const maxSeq = snapshot.reduce((m, p) => Math.max(m, p.seq), 0);
    const items: Entry[] = [];
    if (full) {
      for (const name of this.collections.keys()) {
        for (const item of this.repo.list<SyncMeta>(name, true)) {
          items.push({ unit: { kind: 'rec', collection: name, item: item as SyncRecord }, seqs: [] });
        }
      }
      for (const spec of this.docs) {
        const doc = this.docUnit(spec);
        if (doc) items.push({ unit: { kind: 'doc', doc }, seqs: [] });
      }
    } else {
      const orphanSeqs: number[] = [];
      for (const p of snapshot) {
        const u = this.unitFor(p);
        if (u) items.push({ unit: u, seqs: [p.seq] });
        else orphanSeqs.push(p.seq); // nicht im Schema bzw. nicht mehr vorhanden
      }
      this.repo.ackChanges(orphanSeqs);
    }
    if (full) this.repo.clearFullPush();
    try {
      const size = this.o.chunkSize ?? 200;
      const buckets = new Map<string, Entry[]>();
      for (const e of items) {
        const key = e.unit.kind === 'rec' ? `rec:${e.unit.collection}` : 'doc';
        const b = buckets.get(key);
        if (b) b.push(e);
        else buckets.set(key, [e]);
      }
      for (const g of buckets.values()) {
        for (let i = 0; i < g.length; i += size) {
          const chunk = g.slice(i, i + size);
          await this.sendChunk(provider, chunk.map((x) => x.unit), c);
          if (!full) this.repo.ackChanges(chunk.flatMap((x) => x.seqs));
        }
      }
      if (full) this.repo.ackChanges(snapshot.filter((p) => p.seq <= maxSeq).map((p) => p.seq));
    } catch (e) {
      if (full) this.repo.markFullPush();
      throw e;
    }
  }
}
