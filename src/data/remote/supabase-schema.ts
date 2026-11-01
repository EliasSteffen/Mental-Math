// Collection → Tabelle + Mapper für den Supabase-Sync-Provider (docs/PLAN-data.md §6).
import type { SupabaseSyncSchema, SyncRecord } from 'offline-sync';
import type { GameResult, SessionStats } from '../../types.ts';
import { isValidAttempt, isValidSession } from '../schema.ts';
import { resultToRow, rowToResult, rowToSession, sessionToRow } from './mappers.ts';

// Laufzeit-Prüfung statt Cast: dieselben Pflichtfelder wie bei Import und Migration (schema.ts).
function asResult(r: SyncRecord): GameResult {
  if (!isValidAttempt(r)) throw new TypeError('Ungültiger Versuch');
  return r as unknown as GameResult;
}
function asSession(r: SyncRecord): SessionStats {
  if (!isValidSession(r)) throw new TypeError('Ungültige Runde');
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
