// Öffentliche API von offline-sync (Supabase-Adapter: Subpfad `offline-sync/supabase`)
export type * from './types.ts';
export { SyncError, isSyncError } from './errors.ts';
export { newId, getDeviceId } from './ids.ts';
export { createMeta, touch, tombstone } from './meta.ts';
export { MemoryAdapter } from './adapters/memory.ts';
export { LocalStorageAdapter } from './adapters/local-storage.ts';
export { IndexedDbAdapter } from './adapters/idb.ts';
export type { IdbOptions, BroadcastChannelLike } from './adapters/idb.ts';
export { initStorageAdapter } from './adapters/init.ts';
export { Repository, MAX_PENDING } from './repository.ts';
export type { RepositoryOptions } from './repository.ts';
export { stableEqual, compareMeta, maxByKey, lwwByKey, lwwDoc, keepKeys, sumByKey } from './merge.ts';
export { SyncEngine, WIPE_DOC } from './engine.ts';
export type { SyncEngineOptions } from './engine.ts';
export { SyncManager, browserSyncEnv } from './manager.ts';
export type { SyncEnv, SyncReason, SyncManagerOptions } from './manager.ts';
