// Web Push ohne Bibliothek (WebCrypto; Cloudflare Workers + Node >= 20):
// Nutzlast-Verschlüsselung nach RFC 8291 (Content-Encoding aes128gcm, RFC 8188) und VAPID nach RFC 8292.

export type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url → Bytes; ungültig → null */
export function b64uDecode(s: string): Bytes | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ---------- VAPID (RFC 8292) ---------- */

/** Schlüsselpaar als base64url: öffentlich = unkomprimierter P-256-Punkt (65 Byte), privat = Skalar d (32 Byte) */
export interface VapidKeys { publicKey: string; privateKey: string }

export function validVapidKeys(k: unknown): k is VapidKeys {
  if (!k || typeof k !== 'object') return false;
  const { publicKey, privateKey } = k as Record<string, unknown>;
  if (typeof publicKey !== 'string' || typeof privateKey !== 'string') return false;
  const pub = b64uDecode(publicKey);
  const priv = b64uDecode(privateKey);
  return pub?.length === 65 && pub[0] === 4 && priv?.length === 32;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const x = b64uDecode(jwk.x ?? '');
  const y = b64uDecode(jwk.y ?? '');
  if (!x || !y || !jwk.d) throw new Error('vapid: key export failed');
  return { publicKey: b64uEncode(concat(new Uint8Array([4]), x, y)), privateKey: jwk.d };
}

/** Öffentlichen Punkt (65 Byte) + d als JWK für WebCrypto */
function pointJwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  const jwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64uEncode(publicKey.slice(1, 33)), y: b64uEncode(publicKey.slice(33, 65)),
  };
  if (d !== undefined) jwk.d = d;
  return jwk;
}

const signingKeys = new Map<string, Promise<CryptoKey>>();
function signingKey(keys: VapidKeys): Promise<CryptoKey> {
  let p = signingKeys.get(keys.privateKey);
  if (!p) {
    const pub = b64uDecode(keys.publicKey);
    if (!pub || pub.length !== 65) return Promise.reject(new Error('vapid: invalid public key'));
    p = crypto.subtle.importKey('jwk', pointJwk(pub, keys.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    signingKeys.clear(); // nur der aktuelle Schlüssel bleibt im Cache
    signingKeys.set(keys.privateKey, p);
  }
  return p;
}

const b64uJson = (v: unknown): string => b64uEncode(enc.encode(JSON.stringify(v)));

/** Header `Authorization: vapid t=<JWT>, k=<öffentlicher Schlüssel>` für den Push-Dienst des Endpoints */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now: number, ttlSec = 12 * 3600): Promise<string> {
  const aud = new URL(endpoint).origin;
  const input = `${b64uJson({ typ: 'JWT', alg: 'ES256' })}.${b64uJson({ aud, exp: Math.floor(now / 1000) + ttlSec, sub: subject })}`;
  // WebCrypto liefert ECDSA-Signaturen als r‖s (IEEE P1363) – genau das Format von JWS ES256
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(keys), enc.encode(input)));
  return `vapid t=${input}.${b64uEncode(sig)}, k=${keys.publicKey}`;
}

/* ---------- Verschlüsselung (RFC 8291 / RFC 8188) ---------- */

const RECORD_SIZE = 4096;
/** Größte Nutzlast in einem Datensatz: rs − 16 (GCM-Tag) − 1 (Trennbyte) */
export const MAX_PAYLOAD = RECORD_SIZE - 17;

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Ephemeres Server-Schlüsselpaar für ECDH (für Tests injizierbar) */
export interface EcdhKeyPair { publicKey: Bytes; privateKey: CryptoKey }

export async function ecdhKeyPair(): Promise<EcdhKeyPair> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)), privateKey: kp.privateKey };
}

/** ECDH-Schlüsselpaar aus festen Werten (Testvektoren) */
export async function importEcdhKeyPair(publicKey: string, privateKey: string): Promise<EcdhKeyPair> {
  const pub = b64uDecode(publicKey);
  if (!pub || pub.length !== 65) throw new Error('invalid public key');
  const key = await crypto.subtle.importKey('jwk', pointJwk(pub, privateKey), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return { publicKey: pub, privateKey: key };
}

export interface EncryptOptions { salt?: Bytes; serverKeys?: EcdhKeyPair }

/**
 * Verschlüsselt `payload` für ein Abo (p256dh = öffentlicher Schlüssel des Browsers, auth = 16-Byte-Geheimnis).
 * Ergebnis: Header (Salt, Datensatzgröße, Server-Schlüssel) ‖ AES-128-GCM-Chiffrat eines einzelnen Datensatzes.
 */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string, o: EncryptOptions = {}): Promise<Bytes> {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  if (!uaPublic || uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid p256dh');
  if (!authSecret || authSecret.length !== 16) throw new Error('invalid auth');
  if (payload.length > MAX_PAYLOAD) throw new Error('payload too large');

  const server = o.serverKeys ?? await ecdhKeyPair();
  const salt = o.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, server.publicKey);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(payload, new Uint8Array([2])); // 0x02 = letzter Datensatz, kein Padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, rs, new Uint8Array([server.publicKey.length]), server.publicKey, cipher);
}

/* ---------- Senden ---------- */

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SendOptions {
  keys: VapidKeys;
  /** VAPID-„sub“: https-URL oder mailto: */
  subject: string;
  now: number;
  /** Wie lange der Push-Dienst die Nachricht für ein offline Gerät aufhebt (Sekunden) */
  ttl: number;
  /** Gleiches Topic ersetzt eine noch nicht zugestellte Nachricht (max. 32 Zeichen base64url) */
  topic?: string;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  fetchImpl?: FetchLike;
}

export interface SendResult { ok: boolean; status: number; /** Abo existiert nicht mehr → löschen */ gone: boolean }

export async function sendPush(target: PushTarget, payload: unknown, o: SendOptions): Promise<SendResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), target.p256dh, target.auth);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(target.endpoint, o.keys, o.subject, o.now),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(Math.max(0, Math.floor(o.ttl))),
    Urgency: o.urgency ?? 'normal',
  };
  if (o.topic && /^[A-Za-z0-9_-]{1,32}$/.test(o.topic)) headers.Topic = o.topic;
  const res = await (o.fetchImpl ?? fetch)(target.endpoint, { method: 'POST', headers, body });
  try { await res.body?.cancel(); } catch { /* Antworttext wird nicht gebraucht */ }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, gone: res.status === 404 || res.status === 410 };
}
