// SyncMeta-Helfer (Logik im Paket offline-sync; hier mit App-Defaults für now/deviceId)
import type { SyncMeta } from '../types.ts';
import { createMeta as pkgCreate, tombstone as pkgTombstone, touch as pkgTouch } from '../vendor/storage.ts';
import { getDeviceId, newId } from './ids.ts';

export function createMeta(now: number = Date.now(), deviceId: string = getDeviceId(), id: string = newId()): SyncMeta {
  return pkgCreate(now, deviceId, id);
}

/** Änderung markieren: updatedAt, rev+1, deviceId. */
export function touch<T extends SyncMeta>(meta: T, now: number = Date.now(), deviceId: string = getDeviceId()): T {
  return pkgTouch(meta, now, deviceId);
}

/** Soft-Delete: wie `touch`, zusätzlich deletedAt. */
export function tombstone<T extends SyncMeta>(meta: T, now: number = Date.now(), deviceId: string = getDeviceId()): T {
  return pkgTombstone(meta, now, deviceId);
}
