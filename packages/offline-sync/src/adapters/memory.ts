// Reiner In-Memory-Speicher (Tests, Fallback)
import type { StorageAdapter } from '../types.ts';

export class MemoryAdapter implements StorageAdapter {
  readonly name = 'memory';
  private map = new Map<string, string>();
  get(key: string): string | null { return this.map.get(key) ?? null; }
  set(key: string, value: string): void { this.map.set(key, value); }
  remove(key: string): void { this.map.delete(key); }
  keys(prefix: string): string[] { return [...this.map.keys()].filter((k) => k.startsWith(prefix)); }
}
