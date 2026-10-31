import type { PasskeyAuthClient, PasskeyAuthOptions } from '../shared/types.ts';
import { createAuthCore } from './auth.ts';
import { webauthn as defaultWebAuthn } from './webauthn.ts';

export function createPasskeyAuth(o: PasskeyAuthOptions = {}): PasskeyAuthClient {
  return createAuthCore({ ...o, webauthn: o.webauthn ?? defaultWebAuthn });
}

export { PasskeyAuthError, isAuthErrorCode } from '../shared/errors.ts';
export { normalizeUsername, USERNAME_MIN, USERNAME_MAX } from '../shared/username.ts';
export { createWebAuthn } from './webauthn.ts';
export type * from '../shared/types.ts';
