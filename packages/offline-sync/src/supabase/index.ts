// Einstiegspunkt offline-sync/supabase
export { createSupabaseSyncProvider } from './provider.ts';
export { docToRow, rowToDoc } from './docs.ts';
export type { DocRow } from './docs.ts';
export { toSyncError } from './errors.ts';
export type { SupabaseCollectionSpec, SupabaseSyncSchema } from '../types.ts';
