import type { AuthErrorCode } from './types.ts';

export const AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  'invalid_username', 'invalid_request', 'challenge_expired', 'verification_failed',
  'unknown_credential', 'unauthorized', 'last_passkey', 'rate_limited',
  'not_supported', 'cancelled', 'network', 'server_error', 'already_registered', 'invalid_recovery_code',
  'not_associated',
];

export const isAuthErrorCode = (x: unknown): x is AuthErrorCode =>
  typeof x === 'string' && (AUTH_ERROR_CODES as readonly string[]).includes(x);

export class PasskeyAuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number | undefined;

  constructor(code: AuthErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.name = 'PasskeyAuthError';
    this.code = code;
    this.status = status;
  }
}
