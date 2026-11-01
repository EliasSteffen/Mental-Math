// Tests für das Rate-Limit von /api/auth (server/auth.ts + server/rate-limit.ts), ohne Netzwerk
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAuthStore } from 'passkey-auth/server';
import { handleAuth } from '../server/auth.ts';
import type { AuthEnv } from '../server/auth.ts';
import { authChecks, durableLimiter, explainChecks, memoryLimiter, parseChecks } from '../server/rate-limit.ts';
import type { DoNamespace, RateLimiter as Limiter } from '../server/rate-limit.ts';
import { RateLimiter } from '../workers/rate-limiter/src/index.ts';
import type { DoStorage } from '../workers/rate-limiter/src/index.ts';

const ORIGIN = 'http://localhost:8788';

async function makeEnv(supabaseUrl: string): Promise<AuthEnv> {
  const { privateKey } = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', privateKey);
  return {
    // Eigene URL je Test: der Handler-Cache in server/auth.ts hängt an ihr
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    AUTH_JWT_KEY: JSON.stringify({ ...jwk, kid: 'test-1', alg: 'ES256', use: 'sig' }),
    AUTH_RP_ID: 'localhost',
    AUTH_ORIGINS: ORIGIN,
  };
}

const request = (path: string, ip: string): Request =>
  new Request(`${ORIGIN}/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'CF-Connecting-IP': ip },
    body: '{}',
  });

// In-Memory-Storage mit der Teilmenge der Durable-Object-API
function fakeStorage(): DoStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    data,
    async get<T>(keys: string[]) { return new Map(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k) as T])); },
    async put<T>(entries: Record<string, T>) { for (const [k, v] of Object.entries(entries)) data.set(k, v); },
    async delete(keys: string[]) { let n = 0; for (const k of keys) if (data.delete(k)) n++; return n; },
    async list<T>({ prefix }: { prefix: string }) { return new Map([...data].filter(([k]) => k.startsWith(prefix)) as Array<[string, T]>); },
    async getAlarm() { return alarm; },
    async setAlarm(t: number) { alarm = t; },
  };
}

describe('rate-limit: authChecks', () => {
  it('30/min je IP, eigene Schlüssel neben explain, vom Durable Object akzeptiert', () => {
    const checks = authChecks('2001:db8::1');
    assert.deepEqual(checks, [{ key: 'ip:2001:db8::1:auth:min', windowMs: 60_000, max: 30 }]);
    const explainKeys = new Set(explainChecks('2001:db8::1').map((c) => c.key));
    assert.ok(checks.every((c) => !explainKeys.has(c.key)));
    assert.deepEqual(parseChecks({ checks }), checks);
  });

  it('memoryLimiter(authChecks): 31. Anfrage limitiert, explain-Default bleibt 15/min', async () => {
    const auth = memoryLimiter(authChecks);
    for (let i = 0; i < 30; i++) assert.equal(await auth.limited('1.1.1.1', 1000 + i), false);
    assert.equal(await auth.limited('1.1.1.1', 2000), true);
    assert.equal(await auth.limited('2.2.2.2', 2000), false);
    const explain = memoryLimiter();
    for (let i = 0; i < 15; i++) assert.equal(await explain.limited('1.1.1.1', 1000 + i), false);
    assert.equal(await explain.limited('1.1.1.1', 2000), true);
  });

  it('durableLimiter: Objektname und Prüfliste wählbar, Default explain', async () => {
    const seen: Array<{ name: string; keys: string[] }> = [];
    let name = '';
    const ns: DoNamespace = {
      idFromName: (n) => { name = n; return n; },
      get: () => ({
        async fetch(_url, init) {
          const body = JSON.parse(String(init?.body)) as { checks: Array<{ key: string }> };
          seen.push({ name, keys: body.checks.map((c) => c.key) });
          return new Response('{"ok":true}');
        },
      }),
    };
    const never: Limiter = { async limited() { throw new Error('fallback'); } };
    await durableLimiter(ns, never).limited('9.9.9.9', 0);
    await durableLimiter(ns, never, { name: 'auth', checksFor: authChecks }).limited('9.9.9.9', 0);
    assert.deepEqual(seen, [
      { name: 'explain', keys: explainChecks('9.9.9.9').map((c) => c.key) },
      { name: 'auth', keys: ['ip:9.9.9.9:auth:min'] },
    ]);
  });
});

describe('handleAuth: Rate-Limit', () => {
  it('31. Anfrage einer IP liefert 429 rate_limited (no-store), andere IPs nicht; gilt für alle Routen', async () => {
    const env = await makeEnv('https://memory-limit.supabase.co');
    const store = new MemoryAuthStore();
    const clock = { t: 1_000_000 };
    const deps = { createStore: () => store, now: () => clock.t };
    for (let i = 0; i < 30; i++) {
      assert.equal((await handleAuth(request('/login/options', '203.0.113.1'), env, deps)).status, 200, `Anfrage ${i + 1}`);
    }
    const res = await handleAuth(request('/login/options', '203.0.113.1'), env, deps);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await res.json(), { error: { code: 'rate_limited' } });
    assert.equal(store.snapshot().challenges, 30, 'abgelehnte Anfrage schreibt keine Challenge');
    assert.equal((await handleAuth(request('/register/options', '203.0.113.1'), env, deps)).status, 429);
    assert.equal((await handleAuth(request('/refresh', '203.0.113.1'), env, deps)).status, 429);

    assert.equal((await handleAuth(request('/login/options', '203.0.113.2'), env, deps)).status, 200);
    clock.t += 60_000;
    assert.equal((await handleAuth(request('/login/options', '203.0.113.1'), env, deps)).status, 200, 'nach einer Minute frei');
  });

  it('mit RATE_LIMITER: zählt global in der Durable-Object-Instanz „auth“', async () => {
    const storage = fakeStorage();
    const obj = new RateLimiter({ storage }, {}, () => 5_000_000);
    const names: string[] = [];
    const ns: DoNamespace = {
      idFromName: (n) => { names.push(n); return n; },
      get: () => ({ fetch: (url, init) => obj.fetch(new Request(url, init)) }),
    };
    const env: AuthEnv = { ...(await makeEnv('https://durable-limit.supabase.co')), RATE_LIMITER: ns };
    const deps = { createStore: () => new MemoryAuthStore() };
    for (let i = 0; i < 30; i++) {
      assert.equal((await handleAuth(request('/login/options', '198.51.100.7'), env, deps)).status, 200);
    }
    assert.equal((await handleAuth(request('/login/options', '198.51.100.7'), env, deps)).status, 429);
    assert.equal((await handleAuth(request('/login/options', '198.51.100.8'), env, deps)).status, 200);
    assert.ok(names.length === 32 && names.every((n) => n === 'auth'));
    assert.equal((storage.data.get('ip:198.51.100.7:auth:min') as number[]).length, 30);
  });
});
