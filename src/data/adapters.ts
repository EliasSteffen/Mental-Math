// Adapter-Auswahl der App (Prefix `mm:v3:`); die Adapter-Klassen selbst liegen im Paket offline-sync.
import type { StorageAdapter } from '../types.ts';
import { LocalStorageAdapter, MemoryAdapter, initStorageAdapter as initPkgAdapter } from '../vendor/storage.ts';
import type { IdbOptions } from 'offline-sync';

export { LocalStorageAdapter, MemoryAdapter };

export const V3_PREFIX = 'mm:v3:';

function ls(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Neuer Standard-Adapter: localStorage, bei Fehlern automatisch Memory. */
export function createDefaultAdapter(): StorageAdapter {
  return new LocalStorageAdapter(V3_PREFIX);
}

let shared: StorageAdapter | null = null;
/** Prozessweiter Standard-Adapter (von storage.ts und ids.ts genutzt). */
export function getDefaultAdapter(): StorageAdapter {
  return (shared ??= createDefaultAdapter());
}

/** Ersetzt den prozessweiten Standard-Adapter. */
export function setDefaultAdapter(a: StorageAdapter): void {
  shared = a;
}

/** IndexedDB (mit Migration aus localStorage), sonst localStorage – jeweils mit dem App-Prefix. */
export function initStorageAdapter(o: IdbOptions = {}): Promise<StorageAdapter> {
  return initPkgAdapter({ prefix: V3_PREFIX, ...o });
}

/** Zugriff auf unpräfixierte Alt-Schlüssel (`kopfrechner.v1`, `.bak`) nur für Migration/Reset. */
export interface LegacyStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createLegacyStore(): LegacyStore {
  return {
    get(key) {
      try {
        return ls()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        ls()?.setItem(key, value);
      } catch {
        /* ignorieren */
      }
    },
    remove(key) {
      try {
        ls()?.removeItem(key);
      } catch {
        /* ignorieren */
      }
    },
  };
}
