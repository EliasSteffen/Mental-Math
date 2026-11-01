// Konto per Passkey: Zustand + lazy geladenes Auth-Modul (src/vendor/auth.ts wird erst bei Bedarf importiert).
import type {
  AccountApi, AuthErrorCode, AuthSession, AuthUser, PasskeyAuthClient, PasskeyAuthOptions, PasskeyInfo, RecoveryStatus, SupportInfo,
} from '../vendor/auth.ts';
import type { RemoteSyncProvider, SupabaseSyncSchema } from 'offline-sync';
import { APP_SUPABASE_SCHEMA } from '../data/remote/supabase-schema.ts';
import { PUBLIC_CONFIG } from '../generated/public-config.ts';
import { authOptions } from '../platform/index.ts';

export type AccountState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: AuthUser };

/** Minimale Struktur des Vendor-Moduls (für Tests injizierbar). */
export interface VendorModuleLike {
  createPasskeyAuth(o?: PasskeyAuthOptions): PasskeyAuthClient;
  createPasskeySupabaseClient(auth: PasskeyAuthClient, url: string, key: string): unknown;
  createAccountApi(db: never): AccountApi;
  createSupabaseSyncProvider(client: never, userId: string, schema: SupabaseSyncSchema): RemoteSyncProvider;
}

const HINT_KEY = 'mm:v3:auth.hint';
const CODES: readonly AuthErrorCode[] = [
  'invalid_username', 'invalid_request', 'challenge_expired', 'verification_failed',
  'unknown_credential', 'unauthorized', 'last_passkey', 'rate_limited',
  'not_supported', 'cancelled', 'network', 'server_error', 'already_registered', 'invalid_recovery_code',
];

let configGetter: () => { supabaseUrl: string; supabaseKey: string } = () => PUBLIC_CONFIG;
let injected: VendorModuleLike | null = null;
type Loaded = { auth: PasskeyAuthClient; api: AccountApi; db: unknown; mod: VendorModuleLike };
let ready: Promise<Loaded> | null = null;
let state: AccountState = accountEnabled() ? { status: 'signed-out' } : { status: 'disabled' };
const listeners = new Set<(s: AccountState) => void>();

export function accountEnabled(): boolean {
  const c = configGetter();
  return Boolean(c.supabaseUrl && c.supabaseKey);
}

export function getAccountState(): AccountState { return state; }

export function onAccountChange(cb: (s: AccountState) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function setState(s: AccountState): void {
  state = s;
  for (const cb of [...listeners]) cb(s);
}

function writeHint(on: boolean): void {
  try {
    if (on) globalThis.localStorage.setItem(HINT_KEY, '1');
    else globalThis.localStorage.removeItem(HINT_KEY);
  } catch { /* Speicher nicht verfügbar */ }
}

function readHint(): boolean {
  try { return globalThis.localStorage.getItem(HINT_KEY) === '1'; } catch { return false; }
}

function onSession(s: AuthSession | null): void {
  if (s) { writeHint(true); setState({ status: 'signed-in', user: s.user }); }
  else { writeHint(false); setState({ status: 'signed-out' }); }
}

/** Lädt Vendor-Modul einmalig und baut Auth-Client + Konto-API. */
function load(): Promise<Loaded> {
  if (ready) return ready;
  const p = (async () => {
    const m: VendorModuleLike = injected ?? (await import('../vendor/auth.ts') as unknown as VendorModuleLike);
    const c = configGetter();
    const auth = m.createPasskeyAuth(await authOptions());
    const db = m.createPasskeySupabaseClient(auth, c.supabaseUrl, c.supabaseKey);
    const api = m.createAccountApi(db as never);
    auth.onChange(onSession);
    return { auth, api, db, mod: m };
  })();
  ready = p;
  p.catch(() => { if (ready === p) ready = null; }); // nächster Versuch darf neu laden
  return p;
}

export async function restoreAccount(): Promise<void> {
  if (!accountEnabled() || !readHint()) return;
  setState({ status: 'loading' });
  try {
    const { auth } = await load();
    onSession(await auth.restore());
  } catch {
    setState({ status: 'signed-out' }); // Netzwerkfehler: still abgemeldet
  }
}

/** Sync-Provider für das angemeldete Konto; null, wenn nicht angemeldet. */
export async function createSyncProvider(): Promise<RemoteSyncProvider | null> {
  const st = state;
  if (st.status !== 'signed-in') return null;
  const { db, mod } = await load();
  return mod.createSupabaseSyncProvider(db as never, st.user.id, APP_SUPABASE_SCHEMA);
}

export async function support(): Promise<SupportInfo> { return (await load()).auth.support(); }
/** Konto anlegen; liefert den einmalig sichtbaren Wiederherstellungscode (null, wenn der Server keinen speichern konnte). */
export async function register(username: string): Promise<string | null> {
  const s = await (await load()).auth.register(username);
  onSession(s);
  return s.recoveryCode ?? null;
}
/** Alle Passkeys verloren: mit dem Code einen neuen Passkey anlegen und anmelden; liefert den neuen Code. */
export async function recover(code: string): Promise<string | null> {
  const s = await (await load()).auth.recover(code);
  onSession(s);
  return s.recoveryCode ?? null;
}
export async function createRecoveryCode(): Promise<string> { return (await load()).auth.createRecoveryCode(); }
export async function recoveryStatus(): Promise<RecoveryStatus> { return (await load()).auth.recoveryStatus(); }
export async function login(): Promise<void> { onSession(await (await load()).auth.login()); }
export async function addPasskey(): Promise<void> { await (await load()).auth.addPasskey(); }
export async function logout(): Promise<void> { await (await load()).auth.logout(); onSession(null); }
export async function listPasskeys(): Promise<PasskeyInfo[]> { return (await load()).api.listPasskeys(); }
export async function renamePasskey(id: string, name: string): Promise<void> { await (await load()).api.renamePasskey(id, name); }
export async function deletePasskey(id: string): Promise<void> { await (await load()).api.deletePasskey(id); }

export async function renameUser(name: string): Promise<void> {
  if (state.status !== 'signed-in') throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' });
  const user = state.user;
  const username = await (await load()).api.renameUser(user.id, name);
  setState({ status: 'signed-in', user: { ...user, username } });
}

export async function deleteAccount(): Promise<void> {
  const { auth, api } = await load();
  await api.deleteAccount();
  try { await auth.logout(); } catch { /* Konto ist ohnehin weg */ }
  onSession(null);
}

/** Liest e.code (kein instanceof – Bundle-Kopie der Fehlerklasse). */
export function errorCode(e: unknown): AuthErrorCode {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === 'string' && (CODES as readonly string[]).includes(c)) return c as AuthErrorCode;
  }
  return 'server_error';
}

/** Nur für Tests. */
export function _setModuleForTests(m: VendorModuleLike | null, config?: { supabaseUrl: string; supabaseKey: string }): void {
  injected = m;
  ready = null;
  listeners.clear();
  if (config) configGetter = () => config;
  state = accountEnabled() ? { status: 'signed-out' } : { status: 'disabled' };
}
