// Konto-API für eingeloggte Nutzer (RLS + authenticated-RPCs).
import type { SupabaseClient } from '@supabase/supabase-js';
import { PasskeyAuthError } from '../shared/errors.ts';
import { normalizeUsername } from '../shared/username.ts';
import type { AuthenticatorTransport, AuthUser, DeviceType, PasskeyInfo } from '../shared/types.ts';

export interface AccountApi {
  getProfile(): Promise<AuthUser>;
  renameUser(userId: string, name: string): Promise<string>;
  listPasskeys(): Promise<PasskeyInfo[]>;
  renamePasskey(id: string, name: string): Promise<void>;
  deletePasskey(id: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

const TRANSPORTS: readonly string[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];
const PASSKEY_NAME_MAX = 40;

interface DbError { code?: string; message?: string; status?: number }
type Row = Record<string, unknown>;
const isRow = (x: unknown): x is Row => typeof x === 'object' && x !== null && !Array.isArray(x);

/** JWT-/Auth-Probleme → unauthorized, sonst server_error. */
function mapError(e: DbError): PasskeyAuthError {
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401) {
    return new PasskeyAuthError('unauthorized', undefined, 401);
  }
  return new PasskeyAuthError('server_error', undefined, 500);
}

const reqStr = (r: Row, k: string): string => {
  const v = r[k];
  if (typeof v !== 'string') throw new PasskeyAuthError('server_error', `bad row: ${k}`, 500);
  return v;
};
const optStr = (r: Row, k: string): string | null => (typeof r[k] === 'string' ? r[k] : null);

function toInfo(r: Row): PasskeyInfo {
  const t = typeof r.transports === 'string'
    ? r.transports.split(',').map((s) => s.trim()).filter((s): s is AuthenticatorTransport => TRANSPORTS.includes(s))
    : [];
  const dt = r.device_type;
  const deviceType: DeviceType | null = dt === 'singleDevice' || dt === 'multiDevice' ? dt : null;
  return {
    id: reqStr(r, 'id'),
    name: optStr(r, 'name'),
    createdAt: reqStr(r, 'created_at'),
    lastUsedAt: optStr(r, 'last_used_at'),
    backedUp: r.backed_up === true,
    deviceType,
    transports: t,
  };
}

export function createAccountApi(supabase: SupabaseClient): AccountApi {
  return {
    async getProfile() {
      const { data, error } = await supabase.from('users').select('id, username').single();
      if (error) throw mapError(error);
      if (!isRow(data)) throw new PasskeyAuthError('server_error', 'bad row', 500);
      return { id: reqStr(data, 'id'), username: reqStr(data, 'username') };
    },

    async renameUser(userId, name) {
      const n = normalizeUsername(name);
      if (!n.ok) throw new PasskeyAuthError('invalid_username', n.reason, 400);
      const { error } = await supabase.from('users').update({ username: n.value }).eq('id', userId);
      if (error) throw mapError(error);
      return n.value;
    },

    async listPasskeys() {
      const { data, error } = await supabase
        .from('passkeys')
        .select('id, name, created_at, last_used_at, backed_up, device_type, transports')
        .order('created_at', { ascending: true });
      if (error) throw mapError(error);
      if (!Array.isArray(data)) return [];
      return data.map((r: unknown) => {
        if (!isRow(r)) throw new PasskeyAuthError('server_error', 'bad row', 500);
        return toInfo(r);
      });
    },

    async renamePasskey(id, name) {
      const trimmed = name.trim();
      if ([...trimmed].length > PASSKEY_NAME_MAX) {
        throw new PasskeyAuthError('invalid_request', 'name_too_long', 400);
      }
      const { data, error } = await supabase
        .from('passkeys')
        .update({ name: trimmed === '' ? null : trimmed })
        .eq('id', id)
        .select('id');
      if (error) throw mapError(error);
      if (!Array.isArray(data) || data.length === 0) {
        throw new PasskeyAuthError('invalid_request', 'not_found', 404);
      }
    },

    async deletePasskey(id) {
      const { error } = await supabase.rpc('pa_delete_passkey', { p_id: id });
      if (!error) return;
      const msg = error.message ?? '';
      if (msg.includes('last_passkey')) throw new PasskeyAuthError('last_passkey', undefined, 409);
      if (msg.includes('not_found')) throw new PasskeyAuthError('invalid_request', 'not_found', 404);
      throw mapError(error);
    },

    async deleteAccount() {
      const { error } = await supabase.rpc('pa_delete_account');
      if (error) throw mapError(error);
    },
  };
}
