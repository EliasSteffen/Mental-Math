// Routing und Querschnittsprüfungen (Methode, Origin, Body-Größe, JSON).
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthErrorCode, AuthHandler, AuthHandlerDeps, AuthStore, ServerConfig } from '../shared/types.ts';
import { PasskeyAuthError } from '../shared/errors.ts';
import { routes } from './ceremonies.ts';
import type { Ctx, Reply } from './ceremonies.ts';
import { createTokenService } from './tokens.ts';

export interface ServerDeps extends AuthHandlerDeps {
  verifyRegistration?: typeof verifyRegistrationResponse;
  verifyAuthentication?: typeof verifyAuthenticationResponse;
}

const MAX_BODY = 16384;

const STATUS: Record<AuthErrorCode, number> = {
  invalid_username: 400, invalid_request: 400, challenge_expired: 400, verification_failed: 400,
  unknown_credential: 400, unauthorized: 401, last_passkey: 409, rate_limited: 429,
  not_supported: 400, cancelled: 400, network: 400, server_error: 500, already_registered: 409, invalid_recovery_code: 400,
};

function respond(r: Reply): Response {
  const h = new Headers({ 'Cache-Control': 'no-store' });
  for (const c of r.cookies ?? []) h.append('Set-Cookie', c);
  for (const [k, v] of Object.entries(r.headers ?? {})) h.set(k, v);
  if (r.status === 204 || r.body === undefined) return new Response(null, { status: r.status, headers: h });
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(r.body), { status: r.status, headers: h });
}

const errorReply = (code: AuthErrorCode, status = STATUS[code]): Reply => ({ status, body: { error: { code } } });

export function createAuthHandler(config: ServerConfig, store: AuthStore, deps: ServerDeps = {}): AuthHandler {
  const now = deps.now ?? (() => Date.now());
  const basePath = (config.basePath ?? '/api/auth').replace(/\/+$/, '');
  const tokens = createTokenService(config.jwt, now);
  const randomBytes = deps.randomBytes ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  const randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
  const verifyRegistration = deps.verifyRegistration ?? verifyRegistrationResponse;
  const verifyAuthentication = deps.verifyAuthentication ?? verifyAuthenticationResponse;

  async function readBody(req: Request): Promise<Record<string, unknown>> {
    const len = req.headers.get('content-length');
    if (len !== null && Number(len) > MAX_BODY) throw new PasskeyAuthError('invalid_request', 'too_large', 413);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) throw new PasskeyAuthError('invalid_request', 'too_large', 413);
    if (text.trim() === '') return {};
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new PasskeyAuthError('invalid_request'); }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new PasskeyAuthError('invalid_request');
    return parsed as Record<string, unknown>;
  }

  async function handle(req: Request): Promise<Reply> {
    const path = new URL(req.url).pathname;
    const sub = path.startsWith(basePath + '/') ? path.slice(basePath.length) : null;
    const route = sub !== null && Object.hasOwn(routes, sub) ? routes[sub] : undefined;
    if (!route) return errorReply('invalid_request', 404);
    if (req.method !== 'POST') return errorReply('invalid_request', 405);
    const origin = req.headers.get('origin');
    const app = origin !== null && (config.appOrigins ?? []).includes(origin);
    if (!origin || !(app || config.origins.includes(origin))) return errorReply('invalid_request', 403);
    const body = await readBody(req);
    const ctx: Ctx = {
      config, store, tokens, now, randomBytes, randomUUID, verifyRegistration, verifyAuthentication,
      basePath, req, body, app,
    };
    return route(ctx);
  }

  return async (req) => {
    try {
      return respond(await handle(req));
    } catch (e) {
      if (e instanceof PasskeyAuthError) return respond(errorReply(e.code, e.status));
      console.error('passkey-auth: unexpected error', e);
      return respond(errorReply('server_error'));
    }
  };
}
