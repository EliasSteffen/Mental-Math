// /api/auth – passkey-auth Server-Handler mit Supabase-Adapter (Cloudflare Pages Function + Node >= 20)
// Env-Validierung: fehlt etwas oder ist ungültig, antwortet der Handler mit 503 server_error (nie mit Werten loggen).
// Rate-Limit: 30 Anfragen/min je IP über alle Auth-Routen, darüber 429 rate_limited.
import { createClient } from '@supabase/supabase-js';
import { createAuthHandler } from 'passkey-auth/server';
import type { AuthHandler, AuthStore, ServerConfig } from 'passkey-auth/server';
import { createSupabaseAuthStore } from 'passkey-auth/supabase';
import { APP_ORIGIN } from './app-origin.ts';
import { authChecks, durableLimiter, memoryLimiter } from './rate-limit.ts';
import type { DoNamespace, RateLimiter } from './rate-limit.ts';

const BASE_PATH = '/api/auth';
const REQUIRED_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_JWT_KEY', 'AUTH_RP_ID', 'AUTH_ORIGINS'] as const;
const JSON_NO_STORE: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export interface AuthEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUTH_JWT_KEY?: string;
  AUTH_RP_ID?: string;
  AUTH_ORIGINS?: string;
  AUTH_RP_NAME?: string;
  /** Durable Object aus workers/rate-limiter (dasselbe Binding wie /api/explain); fehlt es, zählt jede Instanz selbst */
  RATE_LIMITER?: DoNamespace;
}
export interface AuthDeps { createStore?: (url: string, key: string) => AuthStore; now?: () => number }

const clean = (v: string | undefined): string => (v ?? '').trim();

function parseOrigins(raw: string): string[] | null {
  const origins = raw.split(',').map((o) => o.trim()).filter((o) => o !== '');
  if (origins.length === 0) return null;
  for (const o of origins) {
    try {
      if (new URL(o).origin !== o) return null;
    } catch {
      return null;
    }
  }
  return origins;
}

export function readAuthConfig(env: AuthEnv): ServerConfig | null {
  if (REQUIRED_VARS.some((k) => clean(env[k]) === '')) return null;
  const origins = parseOrigins(clean(env.AUTH_ORIGINS));
  const first = origins?.[0];
  if (!origins || first === undefined) return null;
  return {
    rpId: clean(env.AUTH_RP_ID),
    rpName: clean(env.AUTH_RP_NAME) || 'Mental Math',
    origins,
    jwt: { key: clean(env.AUTH_JWT_KEY), issuer: `${first}/api/auth` },
    refresh: { secure: first.startsWith('https://') },
    basePath: BASE_PATH,
    // iOS-App: Refresh-Token per Header, Passkeys mit Origin https://<AUTH_RP_ID>
    appOrigins: [APP_ORIGIN],
  };
}

// Nur Variablennamen, niemals Werte.
function describeProblem(env: AuthEnv): string {
  const missing = REQUIRED_VARS.filter((k) => clean(env[k]) === '');
  if (missing.length > 0) return `missing: ${missing.join(', ')}`;
  return 'invalid: AUTH_ORIGINS';
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: { code: 'server_error' } }), { status: 503, headers: JSON_NO_STORE });
}

// Rate-Limit je IP für alle Auth-Routen (/login/options und /register/options schreiben je Aufruf eine Challenge).
// Eigene Durable-Object-Instanz und eigene Schlüssel: teilt keine Kontingente mit /api/explain.
const memory = memoryLimiter(authChecks);
const limiterFor = (env: AuthEnv): RateLimiter =>
  env.RATE_LIMITER ? durableLimiter(env.RATE_LIMITER, memory, { name: 'auth', checksFor: authChecks }) : memory;

function rateLimited(): Response {
  return new Response(JSON.stringify({ error: { code: 'rate_limited' } }), { status: 429, headers: JSON_NO_STORE });
}

// Pro Isolate einmal aufgebaut. Der Fingerprint enthält keine Schlüsselwerte, nur deren Länge.
let cache: { fingerprint: string; handler: AuthHandler } | null = null;

export async function handleAuth(req: Request, env: AuthEnv, deps: AuthDeps = {}): Promise<Response> {
  const config = readAuthConfig(env);
  if (!config) {
    console.error(`auth: config unavailable (${describeProblem(env)})`);
    return unavailable();
  }
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limiterFor(env).limited(ip, (deps.now ?? Date.now)())) return rateLimited();
  const url = clean(env.SUPABASE_URL);
  const serviceKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  const fingerprint = [url, config.rpId, config.origins.join(','), config.jwt.key.length, serviceKey.length].join('|');
  try {
    if (!cache || cache.fingerprint !== fingerprint) {
      const store = deps.createStore
        ? deps.createStore(url, serviceKey)
        : createSupabaseAuthStore(
            createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
          );
      cache = { fingerprint, handler: createAuthHandler(config, store) };
    }
  } catch (err) {
    // Nur den Fehlertyp loggen: Parser-Meldungen können Ausschnitte des Schlüssels enthalten.
    console.error(`auth: handler init failed (${err instanceof Error ? err.name : 'unknown'})`);
    return unavailable();
  }
  return cache.handler(req);
}
