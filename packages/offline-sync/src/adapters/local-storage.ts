// localStorage-Adapter mit Präfix; fällt bei Fehlern pro Schlüssel auf einen internen Memory-Speicher zurück
import type { StorageAdapter } from '../types.ts';

function ls(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * localStorage mit Präfix. Greift bei jedem Zugriff auf `globalThis.localStorage` zu und fällt bei Fehlern
 * (fehlt, Quota, Privatmodus) pro Schlüssel auf einen internen Memory-Speicher zurück.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage';
  private fallback = new Map<string, string>();
  private readonly prefix: string;
  constructor(prefix: string) { this.prefix = prefix; }

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
