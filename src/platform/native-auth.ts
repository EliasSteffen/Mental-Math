// Konto in der iOS-App: Passkeys über das Plugin NativeAuth (AuthenticationServices; derselbe Server-Ablauf wie im
// Browser) und das Refresh-Token im Keychain statt im Cookie. Wird erst mit dem Auth-Bündel geladen.
import { PasskeyAuthError } from '../vendor/auth.ts';
import type {
  AuthErrorCode, AuthenticationOptionsJSON, AuthenticationResponseJSON, PasskeyAuthOptions, RefreshStore,
  RegistrationOptionsJSON, RegistrationResponseJSON, WebAuthnApi,
} from '../vendor/auth.ts';
import { PUBLIC_CONFIG } from '../generated/public-config.ts';
import { apiUrl } from './index.ts';
import { nativeAuthPlugin } from './native.ts';

const REFRESH_KEY = 'refresh-token';
/** Fehlercodes, die das Plugin meldet (call.reject(message, code)); alles andere gilt als fehlgeschlagen */
const PLUGIN_CODES: readonly AuthErrorCode[] = ['cancelled', 'not_supported', 'already_registered'];

const fallbackRpId = (): string => new URL(PUBLIC_CONFIG.apiOrigin).hostname;

async function ceremony<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    const known = PLUGIN_CODES.find((c) => c === code);
    throw new PasskeyAuthError(known ?? 'verification_failed');
  }
}

const webauthn: WebAuthnApi = {
  support: () => Promise.resolve({ webauthn: true, platform: true, conditional: false }),

  async create(o: RegistrationOptionsJSON): Promise<RegistrationResponseJSON> {
    const p = await nativeAuthPlugin();
    const r = await ceremony(() => p.create({
      rpId: o.rp.id ?? fallbackRpId(), challenge: o.challenge, userId: o.user.id, userName: o.user.name,
      exclude: (o.excludeCredentials ?? []).map((d) => d.id),
    }));
    return {
      id: r.id, rawId: r.id, type: 'public-key',
      response: { clientDataJSON: r.clientDataJSON, attestationObject: r.attestationObject, transports: ['internal', 'hybrid'] },
      clientExtensionResults: {}, authenticatorAttachment: 'platform',
    };
  },

  async get(o: AuthenticationOptionsJSON, opts): Promise<AuthenticationResponseJSON> {
    // Kein Autofill (conditional UI) in der App
    if (opts?.mediation === 'conditional') throw new PasskeyAuthError('not_supported');
    const p = await nativeAuthPlugin();
    const r = await ceremony(() => p.get({
      rpId: o.rpId ?? fallbackRpId(), challenge: o.challenge, allow: (o.allowCredentials ?? []).map((d) => d.id),
    }));
    const response: AuthenticationResponseJSON['response'] = {
      clientDataJSON: r.clientDataJSON, authenticatorData: r.authenticatorData, signature: r.signature,
    };
    if (r.userHandle) response.userHandle = r.userHandle;
    return { id: r.id, rawId: r.id, type: 'public-key', response, clientExtensionResults: {}, authenticatorAttachment: 'platform' };
  },
};

const refreshStore: RefreshStore = {
  get: async () => (await (await nativeAuthPlugin()).secureGet({ key: REFRESH_KEY })).value,
  set: async (token) => { await (await nativeAuthPlugin()).secureSet({ key: REFRESH_KEY, value: token }); },
};

export function nativeAuthOptions(): PasskeyAuthOptions {
  return { baseUrl: apiUrl('/api/auth'), webauthn, refreshStore };
}
