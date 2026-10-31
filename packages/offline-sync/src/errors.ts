// Einziger Fehlertyp, den RemoteSyncProvider werfen.
import type { SyncErrorKind } from './types.ts';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;

  constructor(kind: SyncErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'SyncError';
    this.kind = kind;
  }
}

/** Auch über Bundle-Grenzen hinweg erkennen (kein instanceof: der Provider liegt in einem anderen Bundle). */
export const isSyncError = (e: unknown): e is SyncError =>
  e instanceof Error && e.name === 'SyncError'
  && ['offline', 'auth', 'invalid', 'server'].includes(String((e as { kind?: unknown }).kind));
