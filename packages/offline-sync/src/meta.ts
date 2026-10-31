// SyncMeta-Helfer (reine Funktionen, geben neue Objekte zurück)
import { newId } from './ids.ts';
import type { SyncMeta } from './types.ts';

export function createMeta(now: number, deviceId: string, id: string = newId()): SyncMeta {
  return { id, createdAt: now, updatedAt: now, deletedAt: null, deviceId, rev: 1 };
}

/** Änderung markieren: updatedAt, rev+1, deviceId. */
export function touch<T extends SyncMeta>(meta: T, now: number, deviceId: string): T {
  return { ...meta, updatedAt: now, rev: meta.rev + 1, deviceId };
}

/** Soft-Delete: wie `touch`, zusätzlich deletedAt. */
export function tombstone<T extends SyncMeta>(meta: T, now: number, deviceId: string): T {
  return { ...touch(meta, now, deviceId), deletedAt: now };
}
