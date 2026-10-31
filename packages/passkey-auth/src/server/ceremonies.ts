// Ablauf der einzelnen Endpunkte. Fehler als PasskeyAuthError, Antworten als Reply.
import type { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type {
  AuthenticationOptionsJSON, AuthenticatorTransport, AuthStore, AuthUser, ChallengePurpose,
  NewPasskey, OptionsRes, RegistrationOptionsJSON, ServerConfig, SessionRes,
} from '../shared/types.ts';
import { PasskeyAuthError } from '../shared/errors.ts';
import { fromBase64Url, toBase64Url } from '../shared/base64url.ts';
import { normalizeUsername } from '../shared/username.ts';
import { uuidToBytes } from './ids.ts';
import { clearCookie, parseCookies, serializeCookie } from './cookies.ts';
import { hashToken, newRefreshToken } from './tokens.ts';
import type { TokenService } from './tokens.ts';
import { isFlowId, parseAuthenticationResponse, parseRegistrationResponse } from './validate.ts';

export interface Reply { status: number; body?: unknown; cookies?: string[] }

export interface Ctx {
  config: ServerConfig;
  store: AuthStore;
  tokens: TokenService;
  now: () => number;
  randomBytes: (n: number) => Uint8Array;
  randomUUID: () => string;
  verifyRegistration: typeof verifyRegistrationResponse;
  verifyAuthentication: typeof verifyAuthenticationResponse;
  basePath: string;
  req: Request;
  body: Record<string, unknown>;
}

const TIMEOUT = 120000;
const KNOWN_TRANSPORTS: readonly string[] = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];

const cookieName = (c: Ctx): string => c.config.refresh?.cookieName ?? 'mm_rt';
const cookiePath = (c: Ctx): string => c.config.refresh?.cookiePath ?? c.basePath;
const cookieSecure = (c: Ctx): boolean => c.config.refresh?.secure ?? true;
const refreshTtlSec = (c: Ctx): number => c.config.refresh?.ttlSec ?? 30 * 24 * 3600;
const clear = (c: Ctx): string => clearCookie(cookieName(c), { path: cookiePath(c), secure: cookieSecure(c) });

async function newChallenge(
  c: Ctx, purpose: ChallengePurpose, userId: string | null, username: string | null,
): Promise<{ flowId: string; challenge: string }> {
  const challenge = toBase64Url(c.randomBytes(32));
  const flowId = c.randomUUID();
  await c.store.createChallenge({
    id: flowId, challenge, purpose, userId, username,
    expiresAt: c.now() + (c.config.challengeTtlSec ?? 300) * 1000,
  });
  return { flowId, challenge };
}

function registrationOptions(
  c: Ctx, challenge: string, userId: string, username: string, exclude: string[],
): RegistrationOptionsJSON {
  return {
    rp: { id: c.config.rpId, name: c.config.rpName },
    user: { id: toBase64Url(uuidToBytes(userId)), name: username, displayName: username },
    challenge,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    timeout: TIMEOUT,
    attestation: 'none',
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    excludeCredentials: exclude.map((id) => ({ id, type: 'public-key' as const })),
  };
}

async function issueSession(c: Ctx, user: AuthUser, rotatedFrom?: string): Promise<Reply> {
  const { token, expiresAt } = await c.tokens.sign(user);
  const refresh = newRefreshToken(c.randomBytes);
  const ttl = refreshTtlSec(c);
  if (rotatedFrom === undefined) {
    await c.store.createSession(user.id, await hashToken(refresh), c.now() + ttl * 1000);
  }
  const body: SessionRes = { user, accessToken: token, expiresAt };
  return {
    status: 200, body,
    cookies: [serializeCookie(cookieName(c), refresh, { path: cookiePath(c), maxAgeSec: ttl, secure: cookieSecure(c) })],
  };
}

const bad = (): PasskeyAuthError => new PasskeyAuthError('invalid_request');
const failed = (): PasskeyAuthError => new PasskeyAuthError('verification_failed');
const expired = (): PasskeyAuthError => new PasskeyAuthError('challenge_expired');

async function bearer(c: Ctx): Promise<{ userId: string; username: string | null }> {
  const m = /^Bearer +(\S+)$/i.exec(c.req.headers.get('authorization') ?? '');
  const v = m?.[1] ? await c.tokens.verify(m[1]) : null;
  if (!v) throw new PasskeyAuthError('unauthorized');
  return v;
}

/** Registrierung prüfen und in NewPasskey umwandeln. Jeder Fehler -> verification_failed. */
async function verifyNewPasskey(
  c: Ctx, response: NonNullable<ReturnType<typeof parseRegistrationResponse>>, expectedChallenge: string,
): Promise<NewPasskey> {
  let v: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    v = await c.verifyRegistration({
      response, expectedChallenge, expectedOrigin: c.config.origins,
      expectedRPID: c.config.rpId, requireUserVerification: true,
    });
  } catch (e) {
    console.error('passkey-auth: registration verification failed', e);
    throw failed();
  }
  if (!v.verified || !v.registrationInfo) throw failed();
  const info = v.registrationInfo;
  return {
    credentialId: info.credential.id,
    publicKey: toBase64Url(info.credential.publicKey),
    counter: info.credential.counter,
    transports: (info.credential.transports ?? []).filter(
      (t): t is AuthenticatorTransport => KNOWN_TRANSPORTS.includes(t)),
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  };
}

export async function registerOptions(c: Ctx): Promise<Reply> {
  const n = normalizeUsername(c.body['username']);
  if (!n.ok) throw new PasskeyAuthError('invalid_username');
  const userId = c.randomUUID();
  const { flowId, challenge } = await newChallenge(c, 'register', userId, n.value);
  const res: OptionsRes<RegistrationOptionsJSON> = {
    flowId, options: registrationOptions(c, challenge, userId, n.value, []),
  };
  return { status: 200, body: res };
}

export async function registerVerify(c: Ctx): Promise<Reply> {
  const flowId = c.body['flowId'];
  const response = parseRegistrationResponse(c.body['response']);
  if (!isFlowId(flowId) || !response) throw bad();
  const ch = await c.store.consumeChallenge(flowId, 'register');
  if (!ch || !ch.userId || !ch.username) throw expired();
  const pk = await verifyNewPasskey(c, response, ch.challenge);
  const user: AuthUser = { id: ch.userId, username: ch.username };
  await c.store.createUserWithPasskey(user, pk);
  return issueSession(c, user);
}

export async function loginOptions(c: Ctx): Promise<Reply> {
  const { flowId, challenge } = await newChallenge(c, 'login', null, null);
  const options: AuthenticationOptionsJSON = {
    challenge, timeout: TIMEOUT, rpId: c.config.rpId, allowCredentials: [], userVerification: 'required',
  };
  const res: OptionsRes<AuthenticationOptionsJSON> = { flowId, options };
  return { status: 200, body: res };
}

export async function loginVerify(c: Ctx): Promise<Reply> {
  const flowId = c.body['flowId'];
  const response = parseAuthenticationResponse(c.body['response']);
  if (!isFlowId(flowId) || !response) throw bad();
  const ch = await c.store.consumeChallenge(flowId, 'login');
  if (!ch) throw expired();
  const pk = await c.store.findPasskey(response.id);
  if (!pk) throw new PasskeyAuthError('unknown_credential');
  const handle = response.response.userHandle;
  if (handle !== undefined && handle !== toBase64Url(uuidToBytes(pk.userId))) throw failed();
  let v: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    v = await c.verifyAuthentication({
      response, expectedChallenge: ch.challenge, expectedOrigin: c.config.origins,
      expectedRPID: c.config.rpId, requireUserVerification: true,
      credential: { id: pk.credentialId, publicKey: fromBase64Url(pk.publicKey), counter: pk.counter, transports: pk.transports },
    });
  } catch (e) {
    console.error('passkey-auth: authentication verification failed', e);
    throw failed();
  }
  if (!v.verified) throw failed();
  const next = v.authenticationInfo.newCounter;
  // Zähler-Regel: synchronisierte Passkeys liefern 0 (beide 0 ist ok)
  if ((pk.counter > 0 || next > 0) && next <= pk.counter) throw failed();
  await c.store.touchPasskey(pk.id, next);
  return issueSession(c, { id: pk.userId, username: pk.username });
}

export async function refresh(c: Ctx): Promise<Reply> {
  const old = parseCookies(c.req.headers.get('cookie'))[cookieName(c)];
  // Kein Clear-Cookie bei 401: Ein anderer Tab kann gerade rotiert haben; dessen neues Cookie darf nicht überschrieben werden
  const denied: Reply = { status: 401, body: { error: { code: 'unauthorized' } } };
  if (!old) return denied;
  const next = newRefreshToken(c.randomBytes);
  const ttl = refreshTtlSec(c);
  const user = await c.store.rotateSession(await hashToken(old), await hashToken(next), c.now() + ttl * 1000);
  if (!user) return denied;
  const { token, expiresAt } = await c.tokens.sign(user);
  const body: SessionRes = { user, accessToken: token, expiresAt };
  return {
    status: 200, body,
    cookies: [serializeCookie(cookieName(c), next, { path: cookiePath(c), maxAgeSec: ttl, secure: cookieSecure(c) })],
  };
}

export async function logout(c: Ctx): Promise<Reply> {
  const old = parseCookies(c.req.headers.get('cookie'))[cookieName(c)];
  if (old) await c.store.deleteSession(await hashToken(old));
  return { status: 204, cookies: [clear(c)] };
}

export async function passkeysOptions(c: Ctx): Promise<Reply> {
  const who = await bearer(c);
  if (!who.username) throw new PasskeyAuthError('unauthorized');
  const { flowId, challenge } = await newChallenge(c, 'add', who.userId, null);
  const exclude = await c.store.listCredentialIds(who.userId);
  const res: OptionsRes<RegistrationOptionsJSON> = {
    flowId, options: registrationOptions(c, challenge, who.userId, who.username, exclude),
  };
  return { status: 200, body: res };
}

export async function passkeysVerify(c: Ctx): Promise<Reply> {
  const who = await bearer(c);
  const flowId = c.body['flowId'];
  const response = parseRegistrationResponse(c.body['response']);
  if (!isFlowId(flowId) || !response) throw bad();
  const ch = await c.store.consumeChallenge(flowId, 'add');
  if (!ch) throw expired();
  if (ch.userId !== who.userId) throw new PasskeyAuthError('unauthorized', undefined, 403);
  const pk = await verifyNewPasskey(c, response, ch.challenge);
  await c.store.addPasskey(who.userId, pk);
  return { status: 204 };
}

export const routes: Record<string, (c: Ctx) => Promise<Reply>> = {
  '/register/options': registerOptions,
  '/register/verify': registerVerify,
  '/login/options': loginOptions,
  '/login/verify': loginVerify,
  '/refresh': refresh,
  '/logout': logout,
  '/passkeys/options': passkeysOptions,
  '/passkeys/verify': passkeysVerify,
};

