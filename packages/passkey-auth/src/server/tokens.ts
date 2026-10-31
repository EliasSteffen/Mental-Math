// Access-JWT (jose) und Refresh-Token-Helfer. Nur Web-APIs.
import { SignJWT, importJWK, jwtVerify } from 'jose';
import type { JWK } from 'jose';
import type { AuthUser, ServerConfig } from '../shared/types.ts';
import { toBase64Url, utf8Encode } from '../shared/base64url.ts';
import { isUuid } from './ids.ts';

type Key = Awaited<ReturnType<typeof importJWK>>;

export interface TokenService {
  sign(user: AuthUser): Promise<{ token: string; expiresAt: number }>;
  verify(token: string): Promise<{ userId: string; username: string | null } | null>;
}

const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi'] as const;

export function newRefreshToken(randomBytes?: (n: number) => Uint8Array): string {
  const b = randomBytes ? randomBytes(32) : crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(b);
}

export async function hashToken(t: string): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', utf8Encode(t)));
}

export function createTokenService(jwt: ServerConfig['jwt'], now: () => number): TokenService {
  const ttl = jwt.ttlSec ?? 900;
  const raw = jwt.key.trim();
  let alg: string;
  let kid: string | undefined;
  let loadKeys: () => Promise<{ signKey: Key; verifyKey: Key }>;

  if (raw.startsWith('{')) {
    let jwk: JWK;
    try { jwk = JSON.parse(raw) as JWK; } catch { throw new Error('jwt.key: invalid JWK JSON'); }
    if (!jwk.kid) throw new Error('jwt.key: JWK needs a kid');
    const a = jwk.alg ?? (jwk.kty === 'EC' ? 'ES256' : jwk.kty === 'RSA' ? 'RS256' : undefined);
    if (!a) throw new Error('jwt.key: cannot determine alg');
    alg = a;
    kid = jwk.kid;
    loadKeys = async () => {
      // key_ops/use entfernen: Supabase-JWKs tragen ["sign","verify"], WebCrypto lehnt das für private Schlüssel ab
      const { key_ops: _ops, use: _use, ...priv } = jwk;
      const signKey = await importJWK({ ...priv, alg: a }, a);
      // Öffentlicher Schlüssel: zusätzlich private Member entfernen
      const pub: Record<string, unknown> = { ...priv, alg: a };
      for (const m of PRIVATE_MEMBERS) delete pub[m];
      return { signKey, verifyKey: await importJWK(pub as JWK, a) };
    };
  } else {
    if (raw.length < 32) throw new Error('jwt.key: HS256 secret needs >= 32 chars');
    alg = 'HS256';
    const k = utf8Encode(jwt.key);
    loadKeys = () => Promise.resolve({ signKey: k, verifyKey: k });
  }
  // Schlüssel erst beim ersten Gebrauch importieren (Fehler nicht cachen)
  let keys: Promise<{ signKey: Key; verifyKey: Key }> | undefined;
  const getKeys = (): Promise<{ signKey: Key; verifyKey: Key }> => {
    keys ??= loadKeys().catch((e: unknown) => { keys = undefined; throw e; });
    return keys;
  };

  return {
    async sign(user) {
      const { signKey } = await getKeys();
      const iat = Math.floor(now() / 1000);
      const exp = iat + ttl;
      const token = await new SignJWT({ role: 'authenticated', user_metadata: { username: user.username } })
        .setProtectedHeader({ alg, typ: 'JWT', ...(kid ? { kid } : {}) })
        .setSubject(user.id)
        .setAudience('authenticated')
        .setIssuer(jwt.issuer)
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .sign(signKey);
      return { token, expiresAt: exp * 1000 };
    },
    async verify(token) {
      try {
        const { verifyKey } = await getKeys();
        const { payload } = await jwtVerify(token, verifyKey, {
          algorithms: [alg], issuer: jwt.issuer, audience: 'authenticated', currentDate: new Date(now()),
        });
        if (payload.role !== 'authenticated' || !isUuid(payload.sub)) return null;
        const md = payload['user_metadata'];
        const u = typeof md === 'object' && md !== null ? (md as Record<string, unknown>)['username'] : undefined;
        return { userId: payload.sub, username: typeof u === 'string' ? u : null };
      } catch {
        return null;
      }
    },
  };
}
