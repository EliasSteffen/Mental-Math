import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthCore } from '../src/client/auth.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';
import type {
  AuthSession, AuthenticationResponseJSON, RegistrationResponseJSON, SessionRes, WebAuthnApi,
} from '../src/shared/types.ts';

interface Call { url: string; init: RequestInit; body: unknown }
type Handler = (url: string, n: number) => Response | Promise<Response>;

const json = (x: unknown, status = 200): Response =>
  new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });

function setup(handler: Handler, startNow = 1_000_000) {
  const calls: Call[] = [];
  const clock = { t: startNow };
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const i = init ?? {};
    calls.push({ url: u, init: i, body: typeof i.body === 'string' ? JSON.parse(i.body) : undefined });
    return handler(u, calls.length);
  }) as typeof fetch;
  const wcalls: { create: unknown[]; get: unknown[] } = { create: [], get: [] };
  const regResp = { id: 'r' } as unknown as RegistrationResponseJSON;
  const authResp = { id: 'a' } as unknown as AuthenticationResponseJSON;
  const webauthn: WebAuthnApi = {
    support: async () => ({ webauthn: true, platform: true, conditional: true }),
    create: async (options, signal) => { wcalls.create.push({ options, signal }); return regResp; },
    get: async (options, o) => { wcalls.get.push({ options, o }); return authResp; },
  };
  const client = createAuthCore({ fetch: fetchImpl, webauthn, now: () => clock.t, refreshRetryDelayMs: 0 });
  return { client, calls, clock, wcalls, regResp, authResp };
}

test('refresh: 401 wird einmal wiederholt (Mehr-Tab-Rotation), zweiter Versuch gewinnt', async () => {
  const { client, calls } = setup((url, n) =>
    url.endsWith('/refresh') && n === 1 ? json({ error: { code: 'unauthorized' } }, 401) : json(sess(5_000_000)));
  const s = await client.restore();
  assert.equal(calls.length, 2);
  assert.equal(s?.accessToken, 'tok');
});

test('refresh: zwei 401 hintereinander → null, genau 2 Versuche', async () => {
  const { client, calls } = setup(() => json({ error: { code: 'unauthorized' } }, 401));
  assert.equal(await client.restore(), null);
  assert.equal(calls.length, 2);
});

const sess = (expiresAt: number, token = 'tok'): SessionRes =>
  ({ user: { id: 'u1', username: 'Anna' }, accessToken: token, expiresAt });

test('register: Happy Path', async () => {
  const { client, calls, wcalls, regResp } = setup((url) =>
    url.endsWith('/register/options') ? json({ flowId: 'f1', options: { challenge: 'c' } }) : json(sess(2_000_000)));
  const events: Array<AuthSession | null> = [];
  client.onChange((s) => events.push(s));
  const s = await client.register('  Anna ');
  assert.equal(calls[0]?.url, '/api/auth/register/options');
  assert.deepEqual(calls[0]?.body, { username: 'Anna' });
  assert.equal(calls[0]?.init.credentials, 'same-origin');
  assert.equal(calls[0]?.init.cache, 'no-store');
  assert.equal(calls[1]?.url, '/api/auth/register/verify');
  assert.deepEqual(calls[1]?.body, { flowId: 'f1', response: regResp });
  assert.equal(wcalls.create.length, 1);
  assert.deepEqual(s, { user: { id: 'u1', username: 'Anna' }, accessToken: 'tok', expiresAt: 2_000_000 });
  assert.deepEqual(client.getSession(), s);
  assert.equal(events.length, 1);
});

test('register: ungültiger Name scheitert vor jedem Fetch', async () => {
  const { client, calls } = setup(() => json({}));
  await assert.rejects(client.register('a'), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'invalid_username');
  assert.equal(calls.length, 0);
});

test('Server-Fehler wird auf Code und Status abgebildet', async () => {
  const { client } = setup(() => json({ error: { code: 'rate_limited', message: 'zu viele' } }, 429));
  await assert.rejects(client.login(), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'rate_limited' && e.status === 429 && e.message === 'zu viele');
});

test('Fehler ohne Body: Fallback nach Status', async () => {
  const { client } = setup(() => new Response('boom', { status: 500 }));
  await assert.rejects(client.login(), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'server_error' && e.status === 500);
});

test('Netzwerkfehler → network', async () => {
  const { client } = setup(() => { throw new TypeError('offline'); });
  await assert.rejects(client.login(), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'network');
});

test('login: conditional reicht mediation durch', async () => {
  const { client, wcalls } = setup((url) =>
    url.endsWith('/login/options') ? json({ flowId: 'f2', options: { challenge: 'c' } }) : json(sess(2_000_000)));
  await client.login({ conditional: true });
  assert.deepEqual((wcalls.get[0] as { o: unknown }).o, { mediation: 'conditional' });
  await client.login();
  assert.deepEqual((wcalls.get[1] as { o: unknown }).o, {});
});

test('addPasskey ohne Session → unauthorized; mit Session mit Bearer', async () => {
  const { client, calls } = setup((url) => {
    if (url.endsWith('/login/options')) return json({ flowId: 'f', options: { challenge: 'c' } });
    if (url.endsWith('/login/verify')) return json(sess(5_000_000, 'T1'));
    if (url.endsWith('/passkeys/options')) return json({ flowId: 'f3', options: { challenge: 'c' } });
    return new Response(null, { status: 204 });
  });
  await assert.rejects(client.addPasskey(), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'unauthorized');
  assert.equal(calls.length, 0);
  await client.login();
  calls.length = 0;
  await client.addPasskey();
  assert.equal(calls.length, 2);
  for (const c of calls) assert.equal((c.init.headers as Record<string, string>)['Authorization'], 'Bearer T1');
  assert.equal(calls[1]?.url, '/api/auth/passkeys/verify');
});

test('getAccessToken: frischer Token aus dem Cache', async () => {
  const { client, calls } = setup(() => json(sess(5_000_000, 'cached')));
  await client.restore();
  calls.length = 0;
  assert.equal(await client.getAccessToken(), 'cached');
  assert.equal(calls.length, 0);
});

test('getAccessToken ohne Session → null', async () => {
  const { client, calls } = setup(() => json({}));
  assert.equal(await client.getAccessToken(), null);
  assert.equal(calls.length, 0);
});

test('Ablaufnah: genau ein /refresh für 3 parallele Aufrufe', async () => {
  let n = 0;
  const { client, calls, clock } = setup(() => json(sess(clock0 + 900_000, `t${++n}`)));
  const clock0 = clock.t;
  await client.restore(); // t1, läuft in 900 s ab
  clock.t = clock0 + 900_000 - 30_000; // < 60 s Restlaufzeit
  calls.length = 0;
  const r = await Promise.all([client.getAccessToken(), client.getAccessToken(), client.getAccessToken()]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, '/api/auth/refresh');
  assert.deepEqual(r, ['t2', 't2', 't2']);
});

test('Refresh 401 leert Session, onChange(null) genau einmal', async () => {
  let first = true;
  const { client, clock } = setup(() => {
    if (first) { first = false; return json(sess(1_030_000)); }
    return json({ error: { code: 'unauthorized' } }, 401);
  });
  await client.restore();
  const events: Array<AuthSession | null> = [];
  client.onChange((s) => events.push(s));
  clock.t = 1_000_000 + 20_000;
  assert.equal(await client.getAccessToken(), null);
  assert.equal(await client.getAccessToken(), null);
  assert.equal(client.getSession(), null);
  assert.deepEqual(events, [null]);
});

test('getAccessToken: Netzwerkfehler wird weitergereicht, Session bleibt', async () => {
  let first = true;
  const { client, clock } = setup(() => {
    if (first) { first = false; return json(sess(1_030_000)); }
    throw new TypeError('offline');
  });
  await client.restore();
  clock.t += 20_000;
  await assert.rejects(client.getAccessToken(), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'network');
  assert.notEqual(client.getSession(), null);
});

test('restore: null bei 401, andere Fehler werden geworfen', async () => {
  const a = setup(() => json({ error: { code: 'unauthorized' } }, 401));
  assert.equal(await a.client.restore(), null);
  const b = setup(() => json({ error: { code: 'server_error' } }, 500));
  await assert.rejects(b.client.restore(), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'server_error');
});

test('logout leert Session auch wenn fetch fehlschlägt', async () => {
  let first = true;
  const { client } = setup(() => {
    if (first) { first = false; return json(sess(5_000_000)); }
    throw new TypeError('offline');
  });
  await client.restore();
  const events: Array<AuthSession | null> = [];
  client.onChange((s) => events.push(s));
  await client.logout();
  assert.equal(client.getSession(), null);
  assert.deepEqual(events, [null]);
  await client.logout(); // keine doppelte null-Meldung
  assert.deepEqual(events, [null]);
});

test('onChange: unsubscribe und Listener-Fehler isoliert', async () => {
  const { client } = setup(() => json(sess(5_000_000)));
  const origError = console.error;
  console.error = () => {};
  try {
    let a = 0;
    let b = 0;
    client.onChange(() => { throw new Error('kaputt'); });
    const off = client.onChange(() => { a++; });
    client.onChange(() => { b++; });
    await client.restore();
    off();
    await client.restore();
    assert.equal(a, 1);
    assert.equal(b, 2);
  } finally {
    console.error = origError;
  }
});

test('204 liefert undefined', async () => {
  const { client } = setup((url) => {
    if (url.endsWith('/refresh')) return json(sess(5_000_000));
    if (url.endsWith('/passkeys/options')) return json({ flowId: 'f', options: { challenge: 'c' } });
    return new Response(null, { status: 204 });
  });
  await client.restore();
  assert.equal(await client.addPasskey(), undefined);
});

test('refreshStore: Token per Header, keine Cookies, Rotation und Logout pflegen die Ablage', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let stored: string | null = 'rt1';
  const refreshStore = { get: async () => stored, set: async (t: string | null) => { stored = t; } };
  let refreshStatus = 200;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (String(url).endsWith('/refresh')) {
      return refreshStatus === 200
        ? new Response(JSON.stringify(sess(5_000_000)), { status: 200, headers: { 'content-type': 'application/json', 'x-refresh-token': 'rt2' } })
        : json({ error: { code: 'unauthorized' } }, 401);
    }
    return new Response(null, { status: 204, headers: { 'x-refresh-token': '' } });
  }) as typeof fetch;
  const webauthn: WebAuthnApi = {
    support: async () => ({ webauthn: true, platform: true, conditional: false }),
    create: async () => ({ id: 'r' }) as unknown as RegistrationResponseJSON,
    get: async () => ({ id: 'a' }) as unknown as AuthenticationResponseJSON,
  };
  const client = createAuthCore({ fetch: fetchImpl, webauthn, refreshStore, refreshRetryDelayMs: 0 });
  await client.restore();
  const hdr = (i: number): Record<string, string> => calls[i]?.init.headers as Record<string, string>;
  assert.equal(hdr(0)['x-refresh-token'], 'rt1');
  assert.equal(calls[0]?.init.credentials, 'omit');
  assert.equal(stored, 'rt2');
  await client.logout();
  assert.equal(hdr(1)['x-refresh-token'], 'rt2');
  assert.equal(stored, null);
  // Zweimal 401 beim Wiederherstellen: Ablage leer
  stored = 'old';
  refreshStatus = 401;
  assert.equal(await client.restore(), null);
  assert.equal(stored, null);
});
