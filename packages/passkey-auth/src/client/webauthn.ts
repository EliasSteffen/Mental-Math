// WebAuthn-Wrapper: übersetzt zwischen JSON-Form (base64url) und den Browser-APIs.
import type {
  AuthenticationOptionsJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  CredentialDescriptorJSON,
  RegistrationOptionsJSON,
  RegistrationResponseJSON,
  SupportInfo,
  WebAuthnApi,
} from '../shared/types.ts';
import { fromBase64Url, toBase64Url } from '../shared/base64url.ts';
import { PasskeyAuthError } from '../shared/errors.ts';

export interface WebAuthnEnv {
  credentials: Pick<CredentialsContainer, 'create' | 'get'> | undefined;
  PublicKeyCredential: {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    isConditionalMediationAvailable?: () => Promise<boolean>;
  } | undefined;
}

const TRANSPORTS: readonly AuthenticatorTransport[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];

const isTransport = (x: unknown): x is AuthenticatorTransport =>
  typeof x === 'string' && (TRANSPORTS as readonly string[]).includes(x);

// Strukturelle Formen der Browser-Objekte, da instanceof in Node-Tests nicht geht
interface RegistrationCredentialLike {
  id: string;
  rawId: ArrayBuffer;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject: ArrayBuffer;
    getTransports?: () => string[];
    getAuthenticatorData?: () => ArrayBuffer;
    getPublicKeyAlgorithm?: () => number;
    getPublicKey?: () => ArrayBuffer | null;
  };
  getClientExtensionResults?: () => Record<string, unknown>;
}

interface AssertionCredentialLike {
  id: string;
  rawId: ArrayBuffer;
  authenticatorAttachment?: string | null;
  response: {
    clientDataJSON: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
  };
  getClientExtensionResults?: () => Record<string, unknown>;
}

function hasCredentialShape(x: unknown, responseKeys: string[]): boolean {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Record<string, unknown>;
  if (typeof c.id !== 'string' || !(c.rawId instanceof ArrayBuffer)) return false;
  if (typeof c.response !== 'object' || c.response === null) return false;
  const r = c.response as Record<string, unknown>;
  return responseKeys.every((k) => r[k] instanceof ArrayBuffer);
}

const isRegistrationCredential = (x: unknown): x is RegistrationCredentialLike =>
  hasCredentialShape(x, ['clientDataJSON', 'attestationObject']);

const isAssertionCredential = (x: unknown): x is AssertionCredentialLike =>
  hasCredentialShape(x, ['clientDataJSON', 'authenticatorData', 'signature']);

const attachmentOf = (v: string | null | undefined): 'platform' | 'cross-platform' | undefined =>
  v === 'platform' || v === 'cross-platform' ? v : undefined;

// Probe darf nie werfen; Fehler gelten als "nicht verfügbar"
async function probe(fn: () => Promise<boolean> | undefined): Promise<boolean> {
  try {
    return (await fn()) === true;
  } catch {
    return false;
  }
}

function requireCredentials(env: WebAuthnEnv): Pick<CredentialsContainer, 'create' | 'get'> {
  if (env.credentials === undefined || env.PublicKeyCredential === undefined) {
    throw new PasskeyAuthError('not_supported');
  }
  return env.credentials;
}

// Ungültiges base64url in den Optionen ist ein Request-Fehler, kein WebAuthn-Fehler
function convertInput<T>(f: () => T): T {
  try {
    return f();
  } catch {
    throw new PasskeyAuthError('invalid_request', 'invalid base64url');
  }
}

function mapBrowserError(e: unknown): PasskeyAuthError {
  switch (e instanceof Error ? e.name : '') {
    case 'NotAllowedError':
    case 'AbortError':
      return new PasskeyAuthError('cancelled');
    case 'InvalidStateError':
      return new PasskeyAuthError('already_registered');
    case 'SecurityError':
    case 'NotSupportedError':
      return new PasskeyAuthError('not_supported');
    default:
      return new PasskeyAuthError('verification_failed');
  }
}

// Browser-Fehler auf PasskeyAuthError abbilden; eigene Fehler unverändert durchreichen
async function runCeremony<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    throw e instanceof PasskeyAuthError ? e : mapBrowserError(e);
  }
}

function toDescriptor(d: CredentialDescriptorJSON): PublicKeyCredentialDescriptor {
  const out: PublicKeyCredentialDescriptor = { type: 'public-key', id: fromBase64Url(d.id) };
  // DOM-Typ kennt ggf. nicht alle Transports (z.B. smart-card); Werte sind zur Laufzeit identisch
  if (d.transports !== undefined) out.transports = [...d.transports] as PublicKeyCredentialDescriptor['transports'];
  return out;
}

// Manuelle Umwandlung, bewusst ohne parseCreationOptionsFromJSON
function toCreationOptions(o: RegistrationOptionsJSON): PublicKeyCredentialCreationOptions {
  const out: PublicKeyCredentialCreationOptions = {
    rp: { ...o.rp },
    user: { id: fromBase64Url(o.user.id), name: o.user.name, displayName: o.user.displayName },
    challenge: fromBase64Url(o.challenge),
    pubKeyCredParams: o.pubKeyCredParams.map((p) => ({ type: p.type, alg: p.alg })),
  };
  if (o.timeout !== undefined) out.timeout = o.timeout;
  if (o.excludeCredentials !== undefined) out.excludeCredentials = o.excludeCredentials.map(toDescriptor);
  if (o.authenticatorSelection !== undefined) out.authenticatorSelection = { ...o.authenticatorSelection };
  if (o.attestation !== undefined) out.attestation = o.attestation;
  if (o.extensions !== undefined) out.extensions = o.extensions as AuthenticationExtensionsClientInputs;
  // hints fehlen ggf. in den DOM-Typen; nur setzen wenn vorhanden
  if (o.hints !== undefined) Object.assign(out, { hints: [...o.hints] });
  return out;
}

function toRequestOptions(o: AuthenticationOptionsJSON): PublicKeyCredentialRequestOptions {
  const out: PublicKeyCredentialRequestOptions = { challenge: fromBase64Url(o.challenge) };
  if (o.timeout !== undefined) out.timeout = o.timeout;
  if (o.rpId !== undefined) out.rpId = o.rpId;
  if (o.allowCredentials !== undefined) out.allowCredentials = o.allowCredentials.map(toDescriptor);
  if (o.userVerification !== undefined) out.userVerification = o.userVerification;
  if (o.extensions !== undefined) out.extensions = o.extensions as AuthenticationExtensionsClientInputs;
  if (o.hints !== undefined) Object.assign(out, { hints: [...o.hints] });
  return out;
}

function toRegistrationJSON(c: RegistrationCredentialLike): RegistrationResponseJSON {
  const r = c.response;
  const response: RegistrationResponseJSON['response'] = {
    clientDataJSON: toBase64Url(r.clientDataJSON),
    attestationObject: toBase64Url(r.attestationObject),
  };
  const transports = r.getTransports?.().filter(isTransport);
  if (transports !== undefined) response.transports = transports;
  const authData = r.getAuthenticatorData?.();
  if (authData !== undefined) response.authenticatorData = toBase64Url(authData);
  const alg = r.getPublicKeyAlgorithm?.();
  if (alg !== undefined) response.publicKeyAlgorithm = alg;
  const pk = r.getPublicKey?.();
  if (pk) response.publicKey = toBase64Url(pk);

  const out: RegistrationResponseJSON = {
    id: c.id,
    rawId: toBase64Url(c.rawId),
    type: 'public-key',
    response,
    clientExtensionResults: c.getClientExtensionResults?.() ?? {},
  };
  const att = attachmentOf(c.authenticatorAttachment);
  if (att !== undefined) out.authenticatorAttachment = att;
  return out;
}

function toAuthenticationJSON(c: AssertionCredentialLike): AuthenticationResponseJSON {
  const r = c.response;
  const response: AuthenticationResponseJSON['response'] = {
    clientDataJSON: toBase64Url(r.clientDataJSON),
    authenticatorData: toBase64Url(r.authenticatorData),
    signature: toBase64Url(r.signature),
  };
  if (r.userHandle) response.userHandle = toBase64Url(r.userHandle);

  const out: AuthenticationResponseJSON = {
    id: c.id,
    rawId: toBase64Url(c.rawId),
    type: 'public-key',
    response,
    clientExtensionResults: c.getClientExtensionResults?.() ?? {},
  };
  const att = attachmentOf(c.authenticatorAttachment);
  if (att !== undefined) out.authenticatorAttachment = att;
  return out;
}

/** Erzeugt den WebAuthn-Wrapper. Ohne env werden navigator/PublicKeyCredential erst beim Aufruf gelesen. */
export function createWebAuthn(env?: WebAuthnEnv): WebAuthnApi {
  const currentEnv = (): WebAuthnEnv => env ?? {
    credentials: globalThis.navigator?.credentials,
    PublicKeyCredential: globalThis.PublicKeyCredential,
  };

  return {
    async support(): Promise<SupportInfo> {
      const e = currentEnv();
      return {
        webauthn: e.credentials !== undefined && e.PublicKeyCredential !== undefined,
        platform: await probe(() => e.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()),
        conditional: await probe(() => e.PublicKeyCredential?.isConditionalMediationAvailable?.()),
      };
    },

    async create(options: RegistrationOptionsJSON, signal?: AbortSignal): Promise<RegistrationResponseJSON> {
      const credentials = requireCredentials(currentEnv());
      const req: CredentialCreationOptions = {
        publicKey: convertInput(() => toCreationOptions(options)),
      };
      if (signal !== undefined) req.signal = signal;

      const cred = await runCeremony(() => credentials.create(req));
      if (cred === null) throw new PasskeyAuthError('cancelled');
      if (!isRegistrationCredential(cred)) throw new PasskeyAuthError('verification_failed');
      return toRegistrationJSON(cred);
    },

    async get(
      options: AuthenticationOptionsJSON,
      o: { mediation?: 'conditional' | 'optional'; signal?: AbortSignal } = {},
    ): Promise<AuthenticationResponseJSON> {
      const credentials = requireCredentials(currentEnv());
      const req: CredentialRequestOptions = {
        publicKey: convertInput(() => toRequestOptions(options)),
      };
      if (o.mediation !== undefined) req.mediation = o.mediation;
      if (o.signal !== undefined) req.signal = o.signal;

      const cred = await runCeremony(() => credentials.get(req));
      if (cred === null) throw new PasskeyAuthError('cancelled');
      if (!isAssertionCredential(cred)) throw new PasskeyAuthError('verification_failed');
      return toAuthenticationJSON(cred);
    },
  };
}

export const webauthn: WebAuthnApi = createWebAuthn();
