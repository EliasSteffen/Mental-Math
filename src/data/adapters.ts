// Low-Level-Speicher hinter dem Repository. Alles synchron (localStorage); das StorageAdapter-Interface
// erlaubt später einen asynchronen/IndexedDB-Adapter hinter demselben Repository (dann mit Preload in den Cache).
import type { StorageAdapter } from '../types.ts';

export const V3_PREFIX = 'mm:v3:';

function ls(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Reiner In-Memory-Speicher (Tests, Fallback). */
export class MemoryAdapter implements StorageAdapter {
  readonly name = 'memory';
  private map = new Map<string, string>();
  get(key: string): string | null { return this.map.get(key) ?? null; }
  set(key: string, value: string): void { this.map.set(key, value); }
  remove(key: string): void { this.map.delete(key); }
  keys(prefix: string): string[] { return [...this.map.keys()].filter((k) => k.startsWith(prefix)); }
}

/**
 * localStorage mit Prefix `mm:v3:`. Greift bei jedem Zugriff auf `globalThis.localStorage` zu und fällt bei Fehlern
 * (fehlt, Quota, Privatmodus) pro Schlüssel auf einen internen Memory-Speicher zurück.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage';
  private fallback = new Map<string, string>();
  private readonly prefix: string;
  constructor(prefix: string = V3_PREFIX) { this.prefix = prefix; }

  get(key: string): string | null {
    const s = ls();
    if (s) {
      try {
        const v = s.getItem(this.prefix + key);
        if (v !== null) return v;
      } catch {
        /* Fallback unten */
      }
    }
    return this.fallback.get(key) ?? null;
  }

  set(key: string, value: string): void {
    const s = ls();
    if (s) {
      try {
        s.setItem(this.prefix + key, value);
        this.fallback.delete(key);
        return;
      } catch {
        /* Fallback unten */
      }
    }
    this.fallback.set(key, value);
  }

  remove(key: string): void {
    this.fallback.delete(key);
    try {
      ls()?.removeItem(this.prefix + key);
    } catch {
      /* ignorieren */
    }
  }

  keys(prefix: string): string[] {
    const out = new Set<string>(this.fallback.keys());
    const s = ls();
    if (s) {
      try {
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k !== null && k.startsWith(this.prefix)) out.add(k.slice(this.prefix.length));
        }
      } catch {
        /* ignorieren */
      }
    }
    return [...out].filter((k) => k.startsWith(prefix));
  }
}

/** Neuer Standard-Adapter: localStorage, bei Fehlern automatisch Memory. */
export function createDefaultAdapter(): StorageAdapter {
  return new LocalStorageAdapter();
}

let shared: StorageAdapter | null = null;
/** Prozessweiter Standard-Adapter (von storage.ts und ids.ts genutzt). */
export function getDefaultAdapter(): StorageAdapter {
  return (shared ??= createDefaultAdapter());
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
