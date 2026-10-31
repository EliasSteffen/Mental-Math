// Vendor-Einstieg: wird von scripts/vendor.ts mit esbuild gebündelt (überschreibt die tsc-Ausgabe).
export { createPasskeyAuth, PasskeyAuthError, normalizeUsername } from 'passkey-auth/client';
export type { AuthSession, AuthUser, PasskeyInfo, PasskeyAuthClient, AuthErrorCode, SupportInfo } from 'passkey-auth/client';
export { createPasskeySupabaseClient, createAccountApi } from 'passkey-auth/supabase';
export type { AccountApi } from 'passkey-auth/supabase';
// Supabase-Sync-Provider: erst nach der Anmeldung nötig, daher im lazy geladenen Auth-Bundle.
export { createSupabaseSyncProvider } from 'offline-sync/supabase';
