import type {
  AuthSession, AuthenticationOptionsJSON, AuthenticationResponseJSON, OptionsRes,
  PasskeyAuthClient, PasskeyAuthOptions, RegistrationOptionsJSON, RegistrationResponseJSON,
  SessionRes, VerifyReq, WebAuthnApi,
} from '../shared/types.ts';
import { PasskeyAuthError } from '../shared/errors.ts';
import { normalizeUsername } from '../shared/username.ts';
import { createApi } from './api.ts';

const REFRESH_MARGIN_MS = 60_000;

export function createAuthCore(o: PasskeyAuthOptions & { webauthn: WebAuthnApi }): PasskeyAuthClient {
  const fetchImpl = o.fetch ?? globalThis.fetch.bind(globalThis);
  const api = createApi(o.baseUrl ?? '/api/auth', fetchImpl);
  const now = o.now ?? Date.now;
  const webauthn = o.webauthn;

  let session: AuthSession | null = null;
  let inflight: Promise<AuthSession | null> | null = null;
  const listeners = new Set<(s: AuthSession | null) => void>();

  const emit = (): void => {
    for (const cb of [...listeners]) {
      try { cb(session); } catch (e) { console.error(e); }
    }
  };
  const setSession = (r: SessionRes): AuthSession => {
    session = { user: r.user, accessToken: r.accessToken, expiresAt: r.expiresAt };
    emit();
    return session;
  };
  // Nur melden, wenn vorher eine Session existierte
  const clear = (): void => {
    if (!session) return;
    session = null;
    emit();
  };

  const retryDelay = o.refreshRetryDelayMs ?? 400;
  const is401 = (e: unknown): boolean => e instanceof PasskeyAuthError && e.status === 401;

  // Refresh: 401 → einmal kurz verzögert wiederholen (ein anderer Tab kann gerade rotiert haben,
  // dann schickt der Browser jetzt dessen neues Cookie); danach Session verwerfen, null. Sonstige Fehler weiterreichen.
  const refresh = async (): Promise<AuthSession | null> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return setSession(await api.post<SessionRes>('/refresh'));
      } catch (e) {
        if (!is401(e)) throw e;
        if (attempt >= 1) { clear(); return null; }
        await new Promise<void>((r) => setTimeout(r, retryDelay));
      }
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!session) return null;
    if (session.expiresAt - now() > REFRESH_MARGIN_MS) return session.accessToken;
    inflight ??= refresh().finally(() => { inflight = null; });
    const s = await inflight;
    return s ? s.accessToken : null;
  };

  return {
    support: () => webauthn.support(),

    async register(username, opts) {
      const n = normalizeUsername(username);
      if (!n.ok) throw new PasskeyAuthError('invalid_username', n.reason);
      const { flowId, options } = await api.post<OptionsRes<RegistrationOptionsJSON>>(
        '/register/options', { username: n.value });
      const response = await webauthn.create(options, opts?.signal);
      const body: VerifyReq<RegistrationResponseJSON> = { flowId, response };
      return setSession(await api.post<SessionRes>('/register/verify', body));
    },

    async login(opts) {
      const { flowId, options } = await api.post<OptionsRes<AuthenticationOptionsJSON>>('/login/options');
      const getOpts: { mediation?: 'conditional' | 'optional'; signal?: AbortSignal } = {};
      if (opts?.conditional) getOpts.mediation = 'conditional';
      if (opts?.signal) getOpts.signal = opts.signal;
      const response = await webauthn.get(options, getOpts);
      const body: VerifyReq<AuthenticationResponseJSON> = { flowId, response };
      return setSession(await api.post<SessionRes>('/login/verify', body));
    },

    async addPasskey(opts) {
      const token = await getAccessToken();
      if (token === null) throw new PasskeyAuthError('unauthorized');
      const { flowId, options } = await api.post<OptionsRes<RegistrationOptionsJSON>>(
        '/passkeys/options', {}, token);
      const response = await webauthn.create(options, opts?.signal);
      const body: VerifyReq<RegistrationResponseJSON> = { flowId, response };
      await api.post<void>('/passkeys/verify', body, token);
    },

    restore: refresh,
    getAccessToken,

    async logout() {
      try { await api.post<void>('/logout'); } catch { /* Fehler ignorieren */ }
      clear();
    },

    getSession: () => session,

    onChange(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
  };
}
