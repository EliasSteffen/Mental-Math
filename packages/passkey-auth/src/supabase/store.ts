// AuthStore über Supabase (service_role). Vertrag: docs/PLAN-auth.md Abschnitt 1.
import type { SupabaseClient } from '@supabase/supabase-js';
import { PasskeyAuthError } from '../shared/errors.ts';
import type {
  AuthenticatorTransport, AuthStore, AuthUser, ChallengePurpose, ChallengeRecord,
  DeviceType, NewPasskey, StoredPasskey,
} from '../shared/types.ts';

const TRANSPORTS: readonly string[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];

type Row = Record<string, unknown>;
interface DbError { code?: string }

const isRow = (x: unknown): x is Row => typeof x === 'object' && x !== null && !Array.isArray(x);

const str = (r: Row, k: string): string => {
  const v = r[k];
  if (typeof v !== 'string') throw new Error(`supabase: bad row: ${k}`);
  return v;
};
const strOrNull = (r: Row, k: string): string | null => {
  const v = r[k];
  return typeof v === 'string' ? v : null;
};
const num = (r: Row, k: string): number => {
  const v = r[k];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`supabase: bad row: ${k}`);
  return n;
};

const toCsv = (t: readonly string[]): string | null => (t.length ? t.join(',') : null);
const fromCsv = (v: unknown): AuthenticatorTransport[] =>
  typeof v === 'string'
    ? v.split(',').map((s) => s.trim()).filter((s): s is AuthenticatorTransport => TRANSPORTS.includes(s))
    : [];

/** Fehler ohne Secrets/Zeilendaten; 23505 → credential_exists (optional). */
function fail(error: DbError, context: string, uniqueIsConflict = false): never {
  if (uniqueIsConflict && error.code === '23505') {
    throw new PasskeyAuthError('already_registered', 'credential_exists', 409);
  }
  throw new Error(`supabase: ${context}: ${error.code ?? ''}`);
}

const firstRow = (data: unknown): Row | null => {
  if (!Array.isArray(data) || data.length === 0) return null;
  const r: unknown = data[0];
  return isRow(r) ? r : null;
};

const isPurpose = (v: string): v is ChallengePurpose => v === 'register' || v === 'login' || v === 'add' || v === 'recover';

export function createSupabaseAuthStore(admin: SupabaseClient): AuthStore {
  const pkParams = (pk: NewPasskey) => ({
    credential_id: pk.credentialId,
    public_key: pk.publicKey,
    counter: pk.counter,
    transports: toCsv(pk.transports),
    device_type: pk.deviceType,
    backed_up: pk.backedUp,
  });

  return {
    async createChallenge(c) {
      const { error } = await admin.from('auth_challenges').insert({
        id: c.id,
        challenge: c.challenge,
        purpose: c.purpose,
        user_id: c.userId,
        username: c.username,
        expires_at: new Date(c.expiresAt).toISOString(),
      });
      if (error) fail(error, 'createChallenge');
    },

    async consumeChallenge(id, purpose) {
      const { data, error } = await admin.rpc('pa_consume_challenge', { p_id: id, p_purpose: purpose });
      if (error) fail(error, 'consumeChallenge');
      const r = firstRow(data);
      if (!r) return null;
      const p = str(r, 'purpose');
      if (!isPurpose(p)) throw new Error('supabase: bad row: purpose');
      const rec: ChallengeRecord = {
        id: str(r, 'id'),
        challenge: str(r, 'challenge'),
        purpose: p,
        userId: strOrNull(r, 'user_id'),
        username: strOrNull(r, 'username'),
        expiresAt: Date.parse(str(r, 'expires_at')),
      };
      return rec;
    },

    async createUserWithPasskey(user: AuthUser, pk: NewPasskey) {
      const { error } = await admin.rpc('pa_create_user_with_passkey', {
        p_user_id: user.id,
        p_username: user.username,
        p_credential_id: pk.credentialId,
        p_public_key: pk.publicKey,
        p_counter: pk.counter,
        p_transports: toCsv(pk.transports),
        p_device_type: pk.deviceType,
        p_backed_up: pk.backedUp,
      });
      if (error) fail(error, 'createUserWithPasskey', true);
    },

    async addPasskey(userId, pk) {
      const { error } = await admin.from('passkeys').insert({ user_id: userId, ...pkParams(pk) });
      if (error) fail(error, 'addPasskey', true);
    },

    async findPasskey(credentialId) {
      const { data, error } = await admin
        .from('passkeys')
        .select('id, user_id, credential_id, public_key, counter, transports, device_type, backed_up, users(username)')
        .eq('credential_id', credentialId)
        .maybeSingle();
      if (error) fail(error, 'findPasskey');
      if (data === null || data === undefined) return null;
      if (!isRow(data)) throw new Error('supabase: bad row');
      const u: unknown = Array.isArray(data.users) ? data.users[0] : data.users;
      if (!isRow(u)) throw new Error('supabase: bad row: users');
      const dt = str(data, 'device_type');
      const deviceType: DeviceType = dt === 'multiDevice' ? 'multiDevice' : 'singleDevice';
      const pk: StoredPasskey & { username: string } = {
        id: str(data, 'id'),
        userId: str(data, 'user_id'),
        credentialId: str(data, 'credential_id'),
        publicKey: str(data, 'public_key'),
        counter: num(data, 'counter'),
        transports: fromCsv(data.transports),
        deviceType,
        backedUp: data.backed_up === true,
        username: str(u, 'username'),
      };
      return pk;
    },

    async listCredentialIds(userId) {
      const { data, error } = await admin.from('passkeys').select('credential_id').eq('user_id', userId);
      if (error) fail(error, 'listCredentialIds');
      if (!Array.isArray(data)) return [];
      return data.map((r: unknown) => {
        if (!isRow(r)) throw new Error('supabase: bad row');
        return str(r, 'credential_id');
      });
    },

    async touchPasskey(id, counter) {
      const { error } = await admin
        .from('passkeys')
        .update({ counter, last_used_at: new Date().toISOString() })
        .eq('id', id);
      if (error) fail(error, 'touchPasskey');
    },

    async createSession(userId, tokenHash, expiresAt) {
      const { error } = await admin.from('auth_sessions').insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: new Date(expiresAt).toISOString(),
      });
      if (error) fail(error, 'createSession');
    },

    async rotateSession(oldHash, newHash, expiresAt) {
      const { data, error } = await admin.rpc('pa_rotate_session', {
        p_old_hash: oldHash,
        p_new_hash: newHash,
        p_expires_at: new Date(expiresAt).toISOString(),
      });
      if (error) fail(error, 'rotateSession');
      const r = firstRow(data);
      if (!r) return null;
      return { id: str(r, 'user_id'), username: str(r, 'username') };
    },

    async deleteSession(tokenHash) {
      const { error } = await admin.from('auth_sessions').delete().eq('token_hash', tokenHash);
      if (error) fail(error, 'deleteSession');
    },

    // Wiederherstellungscodes (sql/003_recovery_codes.sql)
    async setRecoveryCode(userId, codeHash) {
      const { error } = await admin.rpc('pa_set_recovery_code', { p_user_id: userId, p_code_hash: codeHash });
      if (error) fail(error, 'setRecoveryCode');
    },

    async findRecoveryUser(codeHash) {
      const { data, error } = await admin
        .from('auth_recovery')
        .select('user_id, users(username)')
        .eq('code_hash', codeHash)
        .maybeSingle();
      if (error) fail(error, 'findRecoveryUser');
      if (data === null || data === undefined) return null;
      if (!isRow(data)) throw new Error('supabase: bad row');
      const u: unknown = Array.isArray(data.users) ? data.users[0] : data.users;
      if (!isRow(u)) throw new Error('supabase: bad row: users');
      return { id: str(data, 'user_id'), username: str(u, 'username') };
    },

    async getRecoveryInfo(userId) {
      const { data, error } = await admin.from('auth_recovery').select('created_at').eq('user_id', userId).maybeSingle();
      if (error) fail(error, 'getRecoveryInfo');
      if (data === null || data === undefined) return null;
      if (!isRow(data)) throw new Error('supabase: bad row');
      return { createdAt: Date.parse(str(data, 'created_at')) };
    },
  };
}
