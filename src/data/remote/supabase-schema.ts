// Collection → Tabelle + Mapper für den Supabase-Sync-Provider (docs/PLAN-data.md §6).
import type { SupabaseSyncSchema, SyncRecord } from 'offline-sync';
import type { GameResult, SessionStats } from '../../types.ts';
import { resultToRow, rowToResult, rowToSession, sessionToRow } from './mappers.ts';

// Laufzeit-Prüfung statt Cast: Pflichtfelder der jeweiligen Collection müssen vorhanden sein.
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number';

function asResult(r: SyncRecord): GameResult {
  const ok = [r.sessionId, r.mode, r.category, r.subtype, r.prompt, r.unit].every(isStr)
    && [r.ts, r.timeMs, r.targetMs, r.points, r.expected, r.weight].every(isNum) && typeof r.correct === 'boolean';
  if (!ok) throw new TypeError('Ungültiger Versuch');
  return r as unknown as GameResult;
}
function asSession(r: SyncRecord): SessionStats {
  const ok = isStr(r.mode) && [r.ts, r.n, r.correct, r.points, r.avgTimeMs].every(isNum);
  if (!ok) throw new TypeError('Ungültige Runde');
  return r as unknown as SessionStats;
}

export const APP_SUPABASE_SCHEMA: SupabaseSyncSchema = {
  collections: {
    results: {
      table: 'training_results',
      toRow: (item, userId) => ({ ...resultToRow(asResult(item), userId) }),
      fromRow: (row) => { const x = rowToResult(row); return x === null ? null : { ...x }; },
      initialWindowDays: 365,
    },
    sessions: {
      table: 'training_sessions',
      toRow: (item, userId) => ({ ...sessionToRow(asSession(item), userId) }),
      fromRow: (row) => { const x = rowToSession(row); return x === null ? null : { ...x }; },
    },
  },
  docsTable: 'user_documents',
  deleteAllRpc: 'mm_delete_my_data',
};
