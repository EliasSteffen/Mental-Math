export { createAuthHandler } from './handler.ts';
export type { ServerDeps } from './handler.ts';
export { MemoryAuthStore, ROTATION_GRACE_MS } from './memory-store.ts';
export type {
  AuthHandler, AuthHandlerDeps, AuthStore, AuthUser, ChallengePurpose, ChallengeRecord, NewPasskey,
  ServerConfig, StoredPasskey,
} from '../shared/types.ts';
export { PasskeyAuthError } from '../shared/errors.ts';
