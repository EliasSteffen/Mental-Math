// Tests für server/auth.ts: Env-Validierung und 503-Verhalten ohne Netzwerk
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAuthStore } from 'passkey-auth/server';
import { handleAuth, readAuthConfig } from '../server/auth.ts';
import type { AuthEnv } from '../server/auth.ts';

const VALID: Required<AuthEnv> = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  AUTH_JWT_KEY: '{"kty":"EC"}',
  AUTH_RP_ID: 'localhost',
  AUTH_ORIGINS: 'http://localhost:8788',
  AUTH_RP_NAME: '',
};

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTH_JWT_KEY', 'AUTH_RP_ID', 'AUTH_ORIGINS'] as const;

async function makeJwk(): Promise<string> {
  const { privateKey } = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await globalThis.crypto.subtle.exportKey('jwk', privateKey);
  return JSON.stringify({ ...jwk, kid: 'test-1', alg: 'ES256', use: 'sig' });
}

describe('readAuthConfig', () => {
  it('returns null when a required variable is missing or blank', () => {
    for (const name of REQUIRED) {
      const missing: AuthEnv = { ...VALID, [name]: undefined };
      assert.equal(readAuthConfig(missing), null, `missing ${name}`);
      const blank: AuthEnv = { ...VALID, [name]: '   ' };
      assert.equal(readAuthConfig(blank), null, `blank ${name}`);
    }
  });

  it('returns null for origins that are not bare origins', () => {
    assert.equal(readAuthConfig({ ...VALID, AUTH_ORIGINS: 'localhost:8788' }), null);
    assert.equal(readAuthConfig({ ...VALID, AUTH_ORIGINS: 'https://x.de/path' }), null);
    assert.equal(readAuthConfig({ ...VALID, AUTH_ORIGINS: 'https://x.de/' }), null);
    assert.equal(readAuthConfig({ ...VALID, AUTH_ORIGINS: 'https://a.de,nope' }), null);
    assert.equal(readAuthConfig({ ...VALID, AUTH_ORIGINS: ' , ' }), null);
  });

  it('builds the config for a single http origin', () => {
    const cfg = readAuthConfig(VALID);
    assert.ok(cfg);
    assert.equal(cfg.rpId, 'localhost');
    assert.equal(cfg.rpName, 'Mental Math');
    assert.deepEqual(cfg.origins, ['http://localhost:8788']);
    assert.equal(cfg.jwt.key, VALID.AUTH_JWT_KEY);
    assert.equal(cfg.jwt.issuer, 'http://localhost:8788/api/auth');
    assert.equal(cfg.refresh?.secure, false);
    assert.equal(cfg.basePath, '/api/auth');
  });

  it('sets secure for https and uses the first origin for the issuer', () => {
    const cfg = readAuthConfig({
      ...VALID,
      AUTH_ORIGINS: ' https://mental-math.example , http://localhost:8788 ',
      AUTH_RP_NAME: 'Kopfrechner',
    });
    assert.ok(cfg);
    assert.deepEqual(cfg.origins, ['https://mental-math.example', 'http://localhost:8788']);
    assert.equal(cfg.jwt.issuer, 'https://mental-math.example/api/auth');
    assert.equal(cfg.refresh?.secure, true);
    assert.equal(cfg.rpName, 'Kopfrechner');
  });
});

describe('handleAuth', () => {
  it('returns 503 with no-store when unconfigured', async () => {
    const errorLog = mock.method(console, 'error', () => {});
    try {
      const req = new Request('http://localhost:8788/api/auth/login/options', { method: 'POST', body: '{}' });
      const res = await handleAuth(req, {});
      assert.equal(res.status, 503);
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await res.json(), { error: { code: 'server_error' } });
      assert.equal(errorLog.mock.callCount(), 1);
      const logged = String(errorLog.mock.calls[0]?.arguments[0]);
      assert.ok(logged.includes('SUPABASE_URL'));
      assert.ok(!logged.includes(VALID.SUPABASE_SERVICE_ROLE_KEY));
    } finally {
      mock.restoreAll();
    }
  });

  it('serves login/options with a valid env and an injected store', async () => {
    const env: AuthEnv = { ...VALID, AUTH_JWT_KEY: await makeJwk() };
    const store = new MemoryAuthStore();
    const req = new Request('http://localhost:8788/api/auth/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8788' },
      body: '{}',
    });
    const res = await handleAuth(req, env, { createStore: () => store });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { flowId: string; options: { challenge: string } };
    assert.equal(typeof body.flowId, 'string');
    assert.equal(typeof body.options.challenge, 'string');
  });
});
