// CORS der native App (capacitor://localhost) und Origin-Freigaben der API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_ORIGIN, withAppCors } from '../server/app-origin.ts';
import { readAuthConfig } from '../server/auth.ts';

const ok = (): Promise<Response> =>
  Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));

test('withAppCors: Preflight der App direkt mit 204 und Freigaben', async () => {
  let called = false;
  const req = new Request('https://x.example/api/auth/refresh', { method: 'OPTIONS', headers: { Origin: APP_ORIGIN } });
  const res = await withAppCors(req, () => { called = true; return ok(); });
  assert.equal(res.status, 204);
  assert.equal(called, false);
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
  assert.match(res.headers.get('access-control-allow-headers') ?? '', /X-Refresh-Token/);
});

test('withAppCors: App-Antwort bekommt CORS-Header und gibt X-Refresh-Token frei', async () => {
  const req = new Request('https://x.example/api/explain', { method: 'POST', headers: { Origin: APP_ORIGIN } });
  const res = await withAppCors(req, ok);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), APP_ORIGIN);
  assert.equal(res.headers.get('access-control-expose-headers'), 'X-Refresh-Token');
  assert.equal(res.headers.get('content-type'), 'application/json');
});

test('withAppCors: andere Origins bleiben ohne CORS', async () => {
  for (const origin of [null, 'https://evil.example']) {
    const headers: Record<string, string> = origin ? { Origin: origin } : {};
    const res = await withAppCors(new Request('https://x.example/api/explain', { method: 'OPTIONS', headers }), ok);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
});

test('readAuthConfig: App-Origin ist freigegeben', () => {
  const cfg = readAuthConfig({
    SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', AUTH_JWT_KEY: 's'.repeat(48),
    AUTH_RP_ID: 'mental-math.example', AUTH_ORIGINS: 'https://mental-math.example',
  });
  assert.deepEqual(cfg?.appOrigins, [APP_ORIGIN]);
});
