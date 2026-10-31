import type { AuthErrorCode, ErrorBody } from '../shared/types.ts';
import { PasskeyAuthError, isAuthErrorCode } from '../shared/errors.ts';

export interface Api {
  post<T>(path: string, body?: unknown, bearer?: string): Promise<T>;
}

// Fallback-Code anhand des HTTP-Status
function fallbackCode(status: number): AuthErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthorized';
  return 'server_error';
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch): Api {
  return {
    async post<T>(path: string, body?: unknown, bearer?: string): Promise<T> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body ?? {}),
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch {
        throw new PasskeyAuthError('network');
      }
      if (!res.ok) {
        let code = fallbackCode(res.status);
        let message: string | undefined;
        try {
          const eb = (await res.json()) as Partial<ErrorBody> | null;
          const c: unknown = eb?.error?.code;
          if (isAuthErrorCode(c)) code = c;
          if (typeof eb?.error?.message === 'string') message = eb.error.message;
        } catch {
          // Body nicht lesbar: Fallback-Code bleibt
        }
        throw new PasskeyAuthError(code, message, res.status);
      }
      if (res.status === 204) return undefined as T;
      try {
        return (await res.json()) as T;
      } catch {
        throw new PasskeyAuthError('server_error', 'invalid response', res.status);
      }
    },
  };
}
