// Adapter-Auswahl: IndexedDB (mit Migration aus localStorage), sonst localStorage
import type { StorageAdapter } from '../types.ts';
import { IndexedDbAdapter } from './idb.ts';
import type { IdbOptions } from './idb.ts';
import { LocalStorageAdapter } from './local-storage.ts';

/** IndexedDB (einmalige Migration aus `LocalStorageAdapter(prefix)`), sonst `LocalStorageAdapter(prefix)`. */
export async function initStorageAdapter(o: IdbOptions & { prefix: string }): Promise<StorageAdapter> {
  const { prefix, ...rest } = o;
  const idb = rest.idb ?? globalThis.indexedDB;
  if (!idb) return new LocalStorageAdapter(prefix);
  try {
    return await IndexedDbAdapter.open({ migrateFrom: new LocalStorageAdapter(prefix), ...rest, idb });
  } catch (e) {
    console.warn('IndexedDB nicht nutzbar, verwende localStorage', e);
    return new LocalStorageAdapter(prefix);
  }
}
