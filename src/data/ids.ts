// IDs: UUIDs und die persistente Geräte-ID (Logik im Paket offline-sync; hier mit App-Standardadapter)
import type { StorageAdapter } from '../types.ts';
import { getDeviceId as pkgDeviceId, newId } from '../vendor/storage.ts';
import { getDefaultAdapter } from './adapters.ts';

export { newId };

/** Geräte-ID: wird beim ersten Aufruf erzeugt und im Adapter persistiert (überlebt `resetAll`). */
export function getDeviceId(adapter: StorageAdapter = getDefaultAdapter()): string {
  return pkgDeviceId(adapter);
}
