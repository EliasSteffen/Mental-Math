export { createAuthHandler } from './handler.ts';
export type { ServerDeps } from './handler.ts';
export { MemoryAuthStore, ROTATION_GRACE_MS } from './memory-store.ts';
// Access-Token prüfen (z. B. in weiteren API-Routen derselben App)
export { createTokenService } from './tokens.ts';
export type { TokenService } from './tokens.ts';
export type {
  AuthHandler, AuthHandlerDeps, AuthStore, AuthUser, ChallengePurpose, ChallengeRecord, NewPasskey,
  ServerConfig, StoredPasskey,
} from '../shared/types.ts';
export { PasskeyAuthError } from '../shared/errors.ts';
