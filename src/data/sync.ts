// Sync-Vorbereitung: heute ein No-op, später ein RemoteSyncProvider (Firebase, Supabase, eigene API).
import type { ChangeRecord, RemoteSyncProvider, SyncCollection, SyncDocument, SyncMeta } from '../types.ts';
import type { Repository } from './repository.ts';

export interface SyncStatus {
  ok: boolean;
  provider: string;
  /** true, wenn nichts synchronisiert wurde (NoopSyncProvider) */
  skipped: boolean;
  pushed: number;
  pulled: number;
  pending: number;
  at: number;
  error?: string;
}

/** Tut nichts. `pending` bleibt durch das Limit im Repository (max. 2.000) trotzdem begrenzt. */
export class NoopSyncProvider implements RemoteSyncProvider {
  readonly name = 'noop';
  push(): Promise<{ acceptedSeqs: number[] }> { return Promise.resolve({ acceptedSeqs: [] }); }
  pull(): Promise<{ docs: []; serverTime: number }> { return Promise.resolve({ docs: [], serverTime: Date.now() }); }
}

const COLLECTIONS: readonly string[] = ['results', 'sessions'];
const isCollection = (t: string): t is SyncCollection => COLLECTIONS.includes(t);
const isObj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export class SyncEngine {
  private readonly repo: Repository;
  private provider: RemoteSyncProvider;
  constructor(repo: Repository, provider: RemoteSyncProvider = new NoopSyncProvider()) { this.repo = repo; this.provider = provider; }

  setProvider(p: RemoteSyncProvider): void { this.provider = p; }

  private payload(changes: ChangeRecord[]): Record<string, unknown> {
    const docs: Record<string, unknown> = {};
    for (const c of changes) {
      if (c.op !== 'upsert') continue;
      docs[`${c.target}:${c.id}`] = isCollection(c.target)
        ? this.repo.list<SyncMeta>(c.target, true).find((x) => x.id === c.id) ?? null
        : this.repo.getDoc(c.target);
    }
    return docs;
  }

  /** Push der offenen Änderungen, dann Pull. Last-writer-wins über `updatedAt`. */
  async syncNow(): Promise<SyncStatus> {
    const base = { provider: this.provider.name, at: Date.now() };
    if (this.provider instanceof NoopSyncProvider) {
      return { ...base, ok: true, skipped: true, pushed: 0, pulled: 0, pending: this.repo.getSyncState().pending.length };
    }
    try {
      const changes = [...this.repo.getSyncState().pending];
      let pushed = 0;
      if (changes.length) {
        const res = await this.provider.push(changes, this.payload(changes));
        this.repo.ackChanges(res.acceptedSeqs);
        pushed = res.acceptedSeqs.length;
      }
      const pulled = await this.provider.pull(this.repo.getSyncState().lastPulledAt);
      let applied = 0;
      for (const d of pulled.docs) if (this.apply(d.target, d.id, d.op, d.doc)) applied++;
      this.repo.setLastPulledAt(pulled.serverTime);
      return { ...base, ok: true, skipped: false, pushed, pulled: applied, pending: this.repo.getSyncState().pending.length };
    } catch (e) {
      return {
        ...base, ok: false, skipped: false, pushed: 0, pulled: 0, pending: this.repo.getSyncState().pending.length,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private apply(target: SyncCollection | SyncDocument, id: string, op: 'upsert' | 'delete', doc: unknown): boolean {
    if (!isObj(doc)) return false;
    const remoteAt = typeof doc.updatedAt === 'number' ? doc.updatedAt : 0;
    if (isCollection(target)) {
      const local = this.repo.list<SyncMeta>(target, true).find((x) => x.id === id);
      if (local && local.updatedAt >= remoteAt) return false;
      this.repo.upsert(target, doc as unknown as SyncMeta, false);
      return true;
    }
    const local = this.repo.getDoc<Record<string, unknown>>(target);
    const localAt = local && typeof local.updatedAt === 'number' ? local.updatedAt : 0;
    if (local && localAt >= remoteAt) return false;
    void op;
    this.repo.putDoc(target, doc, false);
    return true;
  }
}
