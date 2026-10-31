// Fehlerabbildung PostgREST/Netzwerk → SyncError (ohne Servertext oder Zeilendaten in der Meldung).
import { SyncError, isSyncError } from '../errors.ts';
import type { SyncErrorKind } from '../types.ts';

interface Failure { status?: number; code?: string; message?: string }

/** Fehler (PostgREST-Antwort oder Exception) auf SyncError abbilden. */
export function toSyncError(f: Failure | unknown): SyncError {
  if (isSyncError(f)) return f;
  let kind: SyncErrorKind = 'server';
  let status: number | undefined;
  let code = '';
  if (f instanceof TypeError) {
    kind = 'offline';
  } else if (typeof f === 'object' && f !== null) {
    const x = f as Failure;
    status = typeof x.status === 'number' ? x.status : undefined;
    code = typeof x.code === 'string' ? x.code : '';
    const msg = typeof x.message === 'string' ? x.message : '';
    if (status === 0 || /fetch|network|TypeError/i.test(msg) && (status === undefined || status === 0)) kind = 'offline';
    else if (status === 401 || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') kind = 'auth';
    else if (status === 400 || status === 409 || status === 422 || /^(22|23|PGRST1)/.test(code)) kind = 'invalid';
  }
  return new SyncError(kind, `${kind}${status !== undefined ? ` (status ${status})` : ''}${code ? ` [${code}]` : ''}`);
}
