// Laufzeit-Validierung der Client-Eingaben (keine Bibliotheksmeldungen nach außen).
import type {
  AuthenticationResponseJSON, AuthenticatorTransport, RegistrationResponseJSON,
} from '../shared/types.ts';
import { isBase64Url } from '../shared/base64url.ts';
import { isUuid } from './ids.ts';

const TRANSPORTS: readonly string[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const b64 = (x: unknown): x is string => isBase64Url(x) && x.length > 0;

export const isFlowId = (x: unknown): x is string => isUuid(x);

type Common = { id: string; rawId: string; response: Obj; attachment?: 'platform' | 'cross-platform'; ext: Obj };

function common(x: unknown): Common | null {
  if (!isObj(x)) return null;
  const { id, rawId, type, response, authenticatorAttachment, clientExtensionResults } = x;
  if (!b64(id) || !b64(rawId) || id !== rawId || type !== 'public-key' || !isObj(response)) return null;
  if (id.length > 1024) return null;
  let ext: Obj = {};
  if (clientExtensionResults !== undefined) {
    if (!isObj(clientExtensionResults)) return null;
    ext = clientExtensionResults;
  }
  const attachment = authenticatorAttachment === 'platform' || authenticatorAttachment === 'cross-platform'
    ? authenticatorAttachment : undefined;
  return { id, rawId, response, ...(attachment ? { attachment } : {}), ext };
}

export function parseRegistrationResponse(x: unknown): RegistrationResponseJSON | null {
  const c = common(x);
  if (!c) return null;
  const r = c.response;
  if (!b64(r['clientDataJSON']) || !b64(r['attestationObject'])) return null;
  const out: RegistrationResponseJSON['response'] = {
    clientDataJSON: r['clientDataJSON'], attestationObject: r['attestationObject'],
  };
  if (r['authenticatorData'] !== undefined) {
    if (!b64(r['authenticatorData'])) return null;
    out.authenticatorData = r['authenticatorData'];
  }
  if (r['publicKey'] !== undefined) {
    if (!b64(r['publicKey'])) return null;
    out.publicKey = r['publicKey'];
  }
  if (r['publicKeyAlgorithm'] !== undefined) {
    if (typeof r['publicKeyAlgorithm'] !== 'number' || !Number.isInteger(r['publicKeyAlgorithm'])) return null;
    out.publicKeyAlgorithm = r['publicKeyAlgorithm'];
  }
  if (Array.isArray(r['transports'])) {
    out.transports = r['transports'].filter(
      (t): t is AuthenticatorTransport => typeof t === 'string' && TRANSPORTS.includes(t));
  }
  return {
    id: c.id, rawId: c.rawId, type: 'public-key', response: out,
    ...(c.attachment ? { authenticatorAttachment: c.attachment } : {}),
    clientExtensionResults: c.ext,
  };
}

export function parseAuthenticationResponse(x: unknown): AuthenticationResponseJSON | null {
  const c = common(x);
  if (!c) return null;
  const r = c.response;
  if (!b64(r['clientDataJSON']) || !b64(r['authenticatorData']) || !b64(r['signature'])) return null;
  const out: AuthenticationResponseJSON['response'] = {
    clientDataJSON: r['clientDataJSON'], authenticatorData: r['authenticatorData'], signature: r['signature'],
  };
  if (r['userHandle'] !== undefined && r['userHandle'] !== null) {
    if (!isBase64Url(r['userHandle'])) return null;
    out.userHandle = r['userHandle'];
  }
  return {
    id: c.id, rawId: c.rawId, type: 'public-key', response: out,
    ...(c.attachment ? { authenticatorAttachment: c.attachment } : {}),
    clientExtensionResults: c.ext,
  };
}
