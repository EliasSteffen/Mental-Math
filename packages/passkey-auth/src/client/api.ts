import type { AuthErrorCode, ErrorBody, RefreshStore } from '../shared/types.ts';
import { PasskeyAuthError, isAuthErrorCode } from '../shared/errors.ts';
import { REFRESH_HEADER } from '../shared/refresh.ts';

export interface Api {
  post<T>(path: string, body?: unknown, bearer?: string): Promise<T>;
}

// Fallback-Code anhand des HTTP-Status
function fallbackCode(status: number): AuthErrorCode {
  if (status === 429) return 'rate_limited';
  if (status === 401) return 'unauthorized';
  return 'server_error';
}

// Nur diese Endpunkte lesen das Refresh-Token; alle anderen bekommen es nicht mit
const NEEDS_REFRESH: ReadonlySet<string> = new Set(['/refresh', '/logout']);

/** `refreshStore`: native App – Refresh-Token per Header senden und aus der Antwort übernehmen, keine Cookies. */
export function createApi(baseUrl: string, fetchImpl: typeof fetch, refreshStore?: RefreshStore): Api {
  return {
    async post<T>(path: string, body?: unknown, bearer?: string): Promise<T> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
      if (refreshStore && NEEDS_REFRESH.has(path)) {
        const token = await refreshStore.get();
        if (token) headers[REFRESH_HEADER] = token;
      }
      let res: Response;
      try {
        res = await fetchImpl(`${baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body ?? {}),
          credentials: refreshStore ? 'omit' : 'same-origin',
          cache: 'no-store',
        });
      } catch {
        throw new PasskeyAuthError('network');
      }
      const next = refreshStore ? res.headers.get(REFRESH_HEADER) : null;
      if (refreshStore && next !== null) await refreshStore.set(next === '' ? null : next);
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
