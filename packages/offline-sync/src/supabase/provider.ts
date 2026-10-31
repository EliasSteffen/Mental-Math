// Generischer RemoteSyncProvider über Supabase/PostgREST (docs/PLAN-data.md §3B, §6).
import type { SupabaseClient } from '@supabase/supabase-js';
import { SyncError } from '../errors.ts';
import type { PullPage, RemoteDoc, RemoteSyncProvider, SupabaseSyncSchema, SyncRecord } from '../types.ts';
import { docToRow, rowToDoc } from './docs.ts';
import { toSyncError } from './errors.ts';

const REWIND_MS = 60_000;
const DAY_MS = 86_400_000;
const DOCS = '$docs';

type Pos = { at: string; id: string };
type Positions = Record<string, Pos>;

/** Cursor v2: { v: 2, p: { [collection]: {at,id}, $docs: {at,id} } }; alles andere zählt als „kein Cursor“. */
function parseCursor(raw: string | null): Positions {
  if (raw === null) return {};
  try {
    const j: unknown = JSON.parse(raw);
    if (typeof j !== 'object' || j === null) return {};
    const o = j as Record<string, unknown>;
    if (o.v !== 2 || typeof o.p !== 'object' || o.p === null) return {};
    const out: Positions = {};
    for (const [k, p] of Object.entries(o.p as Record<string, unknown>)) {
      if (typeof p !== 'object' || p === null) continue;
      const { at, id } = p as Record<string, unknown>;
      if (typeof at === 'string' && typeof id === 'string') out[k] = { at, id };
    }
    return out;
  } catch {
    return {};
  }
}

export function createSupabaseSyncProvider(
  client: SupabaseClient,
  userId: string,
  schema: SupabaseSyncSchema,
  o: { now?: () => number; chunkSize?: number } = {},
): RemoteSyncProvider {
  const now = o.now ?? Date.now;
  const chunk = Math.max(1, o.chunkSize ?? 200);

  async function guarded<T extends { error: unknown; status?: number }>(run: () => PromiseLike<T>): Promise<T> {
    let res: T;
    try {
      res = await run();
    } catch (e) {
      throw toSyncError(e);
    }
    if (res.error) {
      const err = res.error as { code?: string; message?: string };
      throw toSyncError({ status: res.status, code: err.code, message: err.message });
    }
    return res;
  }

  async function upsertChunks(table: string, rows: readonly object[], onConflict: string): Promise<void> {
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      await guarded(() => client.from(table).upsert(part, { onConflict }));
    }
  }

  async function fetchTable(
    table: string, key: 'id' | 'name', pos: Pos | undefined, limit: number, rewind: boolean, windowDays: number | undefined,
  ): Promise<Record<string, unknown>[]> {
    let q = client.from(table).select('*').eq('user_id', userId);
    if (pos) {
      if (rewind) q = q.gte('server_updated_at', new Date(Date.parse(pos.at) - REWIND_MS).toISOString());
      else q = q.or(`server_updated_at.gt."${pos.at}",and(server_updated_at.eq."${pos.at}",${key}.gt."${pos.id}")`);
    } else if (windowDays !== undefined) {
      q = q.gte('created_at', new Date(now() - windowDays * DAY_MS).toISOString());
    }
    const res = await guarded(() => q.order('server_updated_at', { ascending: true }).order(key, { ascending: true }).limit(limit));
    return Array.isArray(res.data) ? (res.data as Record<string, unknown>[]) : [];
  }

  // letzte Zeile mit gültiger Position (kaputte Zeilen blockieren den Cursor nicht)
  const lastPos = (rows: Record<string, unknown>[], key: 'id' | 'name', prev: Pos | undefined): Pos | undefined => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const at = rows[i]?.server_updated_at, id = rows[i]?.[key];
      if (typeof at === 'string' && typeof id === 'string') return { at, id };
    }
    return prev;
  };

  return {
    name: 'supabase',

    async upsertRecords(collection: string, items: readonly SyncRecord[]): Promise<void> {
      const spec = Object.hasOwn(schema.collections, collection) ? schema.collections[collection] : undefined;
      if (!spec) throw new SyncError('invalid', 'invalid (unknown collection)');
      await upsertChunks(spec.table, items.map((i) => spec.toRow(i, userId)), 'user_id,id');
    },

    async upsertDocs(docs: readonly RemoteDoc[]): Promise<void> {
      await upsertChunks(schema.docsTable, docs.map((d) => docToRow(d, userId)), 'user_id,name');
    },

    async pull(cursor, { limit, rewind }): Promise<PullPage> {
      const c = parseCursor(cursor);
      const names = Object.keys(schema.collections);
      const [colRows, dRows] = await Promise.all([
        Promise.all(names.map((n) => {
          const spec = schema.collections[n]!;
          return fetchTable(spec.table, 'id', c[n], limit, rewind, spec.initialWindowDays);
        })),
        fetchTable(schema.docsTable, 'name', c[DOCS], limit, rewind, undefined),
      ]);
      const records: PullPage['records'] = [];
      const p: Positions = {};
      let hasMore = dRows.length >= limit;
      names.forEach((n, i) => {
        const rows = colRows[i] ?? [];
        const spec = schema.collections[n]!;
        for (const row of rows) {
          const item = spec.fromRow(row);
          if (item) records.push({ collection: n, item });
        }
        const pos = lastPos(rows, 'id', c[n]);
        if (pos) p[n] = pos;
        if (rows.length >= limit) hasMore = true;
      });
      const docs: RemoteDoc[] = [];
      for (const row of dRows) {
        const d = rowToDoc(row);
        if (d) docs.push(d);
      }
      const dp = lastPos(dRows, 'name', c[DOCS]);
      if (dp) p[DOCS] = dp;
      return { records, docs, cursor: Object.keys(p).length > 0 ? JSON.stringify({ v: 2, p }) : null, hasMore };
    },

    async deleteAll(): Promise<void> {
      await guarded(() => client.rpc(schema.deleteAllRpc));
    },
  };
}
