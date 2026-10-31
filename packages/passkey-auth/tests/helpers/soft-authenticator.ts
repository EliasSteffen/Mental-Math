// Software-WebAuthn-Authenticator für Tests (ES256, fmt 'none').
import type {
  AuthenticationOptionsJSON, AuthenticationResponseJSON,
  RegistrationOptionsJSON, RegistrationResponseJSON,
} from '../../src/shared/types.ts';
import { toBase64Url, utf8Encode } from '../../src/shared/base64url.ts';
import { encodeCbor } from './cbor.ts';
import type { CborValue } from './cbor.ts';

export interface SoftCredential { id: string; userHandle: string; rpId: string; counter: number; privateKey: CryptoKey }
export interface SoftAuthenticatorOptions {
  origin: string;
  counterStart?: number;
  backupEligible?: boolean;
  backedUp?: boolean;
  userVerified?: boolean;
}
export interface SoftAuthenticator {
  readonly credentials: SoftCredential[];
  create(options: RegistrationOptionsJSON, o?: { origin?: string }): Promise<RegistrationResponseJSON>;
  get(options: AuthenticationOptionsJSON, o?: { origin?: string; credentialId?: string; userHandle?: string | null; counter?: number }): Promise<AuthenticationResponseJSON>;
}

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

const u32 = (n: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
};

const sha256 = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data));

// Rohes r||s (64 Byte) → ASN.1 DER
function derInt(raw: Uint8Array): Uint8Array {
  let i = 0;
  while (i < raw.length - 1 && raw[i] === 0) i++;
  let v = raw.subarray(i);
  if (v[0]! & 0x80) v = concat(Uint8Array.of(0), v);
  return concat(Uint8Array.of(0x02, v.length), v);
}
function rawToDer(sig: Uint8Array): Uint8Array {
  const body = concat(derInt(sig.subarray(0, 32)), derInt(sig.subarray(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}

export function createSoftAuthenticator(opts: SoftAuthenticatorOptions): SoftAuthenticator {
  const credentials: SoftCredential[] = [];
  const counterStart = opts.counterStart ?? 0;
  const be = opts.backupEligible ?? true;
  const bs = opts.backedUp ?? true;
  const uv = opts.userVerified ?? true;

  const flags = (extra: number): number =>
    0x01 | (uv ? 0x04 : 0) | (be ? 0x08 : 0) | (bs ? 0x10 : 0) | extra;

  const clientData = (type: string, challenge: string, origin: string): Uint8Array<ArrayBuffer> =>
    utf8Encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    credentials,

    async create(options, o) {
      const origin = o?.origin ?? opts.origin;
      const rpId = options.rp.id ?? new URL(origin).hostname;
      const excluded = (options.excludeCredentials ?? []).some((c) =>
        credentials.some((s) => s.rpId === rpId && s.id === c.id));
      if (excluded) throw new DOMException('excluded', 'InvalidStateError');

      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
      const credId = crypto.getRandomValues(new Uint8Array(32));
      const cose = encodeCbor(new Map<number | string, CborValue>([
        [1, 2], [3, -7], [-1, 1], [-2, raw.slice(1, 33)], [-3, raw.slice(33, 65)],
      ]));
      const idLen = new Uint8Array(2);
      new DataView(idLen.buffer).setUint16(0, credId.length, false);
      const authData = concat(
        await sha256(utf8Encode(rpId)), Uint8Array.of(flags(0x40)), u32(counterStart),
        new Uint8Array(16), idLen, credId, cose,
      );
      const attestationObject = encodeCbor(new Map<number | string, CborValue>([
        ['fmt', 'none'], ['attStmt', new Map()], ['authData', authData],
      ]));
      const id = toBase64Url(credId);
      credentials.push({ id, userHandle: options.user.id, rpId, counter: counterStart, privateKey: pair.privateKey });
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: toBase64Url(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: toBase64Url(attestationObject),
          transports: ['internal', 'hybrid'],
          authenticatorData: toBase64Url(authData),
          publicKeyAlgorithm: -7,
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
      };
    },

    async get(options, o) {
      const origin = o?.origin ?? opts.origin;
      const rpId = options.rpId ?? new URL(origin).hostname;
      const allowed = options.allowCredentials ?? [];
      const forRp = credentials.filter((c) => c.rpId === rpId);
      const cred = o?.credentialId !== undefined
        ? credentials.find((c) => c.id === o.credentialId)
        : (allowed.length > 0 ? forRp.find((c) => allowed.some((a) => a.id === c.id)) : forRp[0]);
      if (!cred) throw new DOMException('no credential', 'NotAllowedError');

      let counter: number;
      if (o?.counter !== undefined) counter = o.counter;
      else if (cred.counter > 0) { cred.counter += 1; counter = cred.counter; }
      else counter = 0;

      const authData = concat(await sha256(utf8Encode(rpId)), Uint8Array.of(flags(0)), u32(counter));
      const cdj = clientData('webauthn.get', options.challenge, origin);
      const signed = concat(authData, await sha256(cdj));
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cred.privateKey, signed));
      const handle = o?.userHandle === undefined ? cred.userHandle : o.userHandle;
      return {
        id: cred.id,
        rawId: cred.id,
        type: 'public-key',
        response: {
          clientDataJSON: toBase64Url(cdj),
          authenticatorData: toBase64Url(authData),
          signature: toBase64Url(rawToDer(sig)),
          ...(handle === null ? {} : { userHandle: handle }),
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
      };
    },
  };
}
