import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthHandler } from '../src/server/index.ts';
import type { ServerDeps } from '../src/server/index.ts';
import { MemoryAuthStore } from '../src/server/memory-store.ts';
import { uuidToBytes } from '../src/server/ids.ts';
import { toBase64Url } from '../src/shared/base64url.ts';
import type { AuthHandler, ServerConfig } from '../src/shared/types.ts';

const ORIGIN = 'https://app.example';
const KEY = 's'.repeat(48);
const B = 'AAAA';

const verifiedReg: NonNullable<ServerDeps['verifyRegistration']> = () => Promise.resolve({
  verified: true,
  registrationInfo: {
    fmt: 'none', aaguid: '00000000-0000-0000-0000-000000000000',
    credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal', 'weird'] },
    credentialType: 'public-key', attestationObject: new Uint8Array(), userVerified: true,
    credentialDeviceType: 'multiDevice', credentialBackedUp: true, origin: ORIGIN, rpID: 'app.example',
  },
});

interface Setup { h: AuthHandler; store: MemoryAuthStore; clock: { t: number }; calls: { reg: number; auth: number } }

function setup(over: Partial<ServerDeps> = {}, cfg: Partial<ServerConfig> = {}): Setup {
  const clock = { t: 1_700_000_000_000 };
  const calls = { reg: 0, auth: 0 };
  const store = new MemoryAuthStore({ now: () => clock.t });
  const h = createAuthHandler(
    { rpId: 'app.example', rpName: 'App', origins: [ORIGIN], jwt: { key: KEY, issuer: 'iss' }, ...cfg },
    store,
    {
      now: () => clock.t,
      verifyRegistration: (o) => { calls.reg++; return verifiedReg(o); },
      verifyAuthentication: () => { calls.auth++; return Promise.resolve({
        verified: true,
        authenticationInfo: { credentialID: 'cred-1', newCounter: 0, userVerified: true, credentialDeviceType: 'multiDevice', credentialBackedUp: true, origin: ORIGIN, rpID: 'app.example' },
      }); },
      ...over,
    },
  );
  return { h, store, clock, calls };
}

function post(path: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request(`${ORIGIN}/api/auth${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    ...(body === undefined || method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

type J = Record<string, any>; // eslint-disable-line -- nur im Test
const code = async (r: Response): Promise<unknown> => ((await r.json()) as { error: { code: string } }).error.code;

const regResponse = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: { clientDataJSON: B, attestationObject: B }, clientExtensionResults: {} };
const authResponse = (extra: Record<string, unknown> = {}) => ({
  id: 'cred-1', rawId: 'cred-1', type: 'public-key',
  response: { clientDataJSON: B, authenticatorData: B, signature: B, ...extra }, clientExtensionResults: {},
});

async function register(s: Setup, name = 'Alice'): Promise<{ res: Response; json: J; userId: string }> {
  const o = (await (await s.h(post('/register/options', { username: name }))).json()) as J;
  const res = await s.h(post('/register/verify', { flowId: o['flowId'], response: regResponse }));
  const json = (await res.json()) as J;
  const userId = toBase64Url(new Uint8Array()) && (json['user']?.id as string);
  return { res, json, userId };
}
const rt = (r: Response): string => /mm_rt=([^;]*)/.exec(r.headers.get('set-cookie') ?? '')?.[1] ?? '';

test('Querschnitt: Origin, Methode, Pfad, Größe, JSON', async () => {
  const s = setup();
  const noOrigin = new Request(`${ORIGIN}/api/auth/login/options`, { method: 'POST', body: '{}' });
  let r = await s.h(noOrigin);
  assert.equal(r.status, 403);
  r = await s.h(post('/login/options', {}, { origin: 'https://evil.example' }));
  assert.equal(r.status, 403);
  r = await s.h(post('/login/options', undefined, {}, 'GET'));
  assert.equal(r.status, 405);
  r = await s.h(post('/nope', {}));
  assert.equal(r.status, 404);
  assert.equal(await code(r), 'invalid_request');
  r = await s.h(post('/login/options', 'x'.repeat(20000)));
  assert.equal(r.status, 413);
  r = await s.h(post('/login/options', '{"a":"' + 'x'.repeat(20000) + '"}', { 'content-length': '20000' }));
  assert.equal(r.status, 413);
  r = await s.h(post('/login/options', '{nope'));
  assert.equal(r.status, 400);
  assert.equal(await code(r), 'invalid_request');
  r = await s.h(post('/login/options', '[1]'));
  assert.equal(r.status, 400);
  r = await s.h(post('/login/options', ''));
  assert.equal(r.status, 200);
});

test('Header: JSON und no-store', async () => {
  const s = setup();
  const r = await s.h(post('/login/options', {}));
  assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const e = await s.h(post('/nope', {}));
  assert.equal(e.headers.get('cache-control'), 'no-store');
  const l = await s.h(post('/logout', {}));
  assert.equal(l.status, 204);
  assert.equal(l.headers.get('cache-control'), 'no-store');
});

test('register/options: Form und Fehler', async () => {
  const s = setup();
  const bad = await s.h(post('/register/options', { username: 'a' }));
  assert.equal(bad.status, 400);
  assert.equal(await code(bad), 'invalid_username');
  const r = await s.h(post('/register/options', { username: '  Alice  ' }));
  assert.equal(r.status, 200);
  const j = (await r.json()) as J;
  const o = j['options'] as J;
  assert.equal(o['rp'].id, 'app.example');
  assert.equal(o['user'].name, 'Alice');
  assert.equal(o['user'].displayName, 'Alice');
  assert.equal(o['authenticatorSelection'].residentKey, 'required');
  assert.equal(o['authenticatorSelection'].userVerification, 'required');
  assert.equal(o['attestation'], 'none');
  assert.deepEqual(o['pubKeyCredParams'].map((p: J) => p['alg']), [-7, -257]);
  assert.deepEqual(o['excludeCredentials'], []);
  assert.match(o['challenge'], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(o['user'].id.length, 22); // 16 Byte
  assert.equal(s.store.snapshot().challenges, 1);
});

test('register/verify: Happy Path, Cookie, Token', async () => {
  const s = setup();
  const o = (await (await s.h(post('/register/options', { username: 'Alice' }))).json()) as J;
  const res = await s.h(post('/register/verify', { flowId: o['flowId'], response: regResponse }));
  assert.equal(res.status, 200);
  const json = (await res.json()) as J;
  assert.equal(json['user'].username, 'Alice');
  assert.equal(json['accessToken'].split('.').length, 3);
  assert.equal(json['expiresAt'], s.clock.t + 900_000);
  // user.id aus options entspricht den UUID-Bytes
  assert.equal(o['options'].user.id, toBase64Url(uuidToBytes(json['user'].id)));
  const ck = res.headers.get('set-cookie') ?? '';
  assert.match(ck, /^mm_rt=[A-Za-z0-9_-]{43};/);
  for (const part of ['Path=/api/auth', 'Max-Age=2592000', 'HttpOnly', 'SameSite=Strict', 'Secure']) assert.ok(ck.includes(part), part);
  assert.deepEqual(s.store.snapshot(), { challenges: 0, users: 1, passkeys: 1, sessions: 1 });
  const stored = await s.store.findPasskey('cred-1');
  assert.deepEqual(stored?.transports, ['internal']); // unbekannte verworfen
  assert.equal(stored?.publicKey, 'AQID');
});

test('register/verify: Replay, falscher Zweck, Validierung', async () => {
  const s = setup();
  const o = (await (await s.h(post('/register/options', { username: 'Alice' }))).json()) as J;
  assert.equal((await s.h(post('/register/verify', { flowId: o['flowId'], response: regResponse }))).status, 200);
  const replay = await s.h(post('/register/verify', { flowId: o['flowId'], response: regResponse }));
  assert.equal(replay.status, 400);
  assert.equal(await code(replay), 'challenge_expired');
  // login-Challenge für register/verify
  const l = (await (await s.h(post('/login/options', {}))).json()) as J;
  const wrong = await s.h(post('/register/verify', { flowId: l['flowId'], response: regResponse }));
  assert.equal(await code(wrong), 'challenge_expired');
  assert.equal(s.store.snapshot().challenges, 0); // trotzdem verbraucht
  // Formfehler
  for (const body of [{}, { flowId: 'x', response: regResponse }, { flowId: o['flowId'], response: { ...regResponse, rawId: 'other' } }]) {
    const r = await s.h(post('/register/verify', body));
    assert.equal(r.status, 400);
    assert.equal(await code(r), 'invalid_request');
  }
  // abgelaufen
  const o2 = (await (await s.h(post('/register/options', { username: 'Bob' }))).json()) as J;
  s.clock.t += 301_000;
  assert.equal(await code(await s.h(post('/register/verify', { flowId: o2['flowId'], response: regResponse }))), 'challenge_expired');
});

test('Verify-Stub wirft -> verification_failed ohne Meldung', async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    const s = setup({ verifyRegistration: () => Promise.reject(new Error('SECRET internal detail')) });
    const o = (await (await s.h(post('/register/options', { username: 'Alice' }))).json()) as J;
    const r = await s.h(post('/register/verify', { flowId: o['flowId'], response: regResponse }));
    assert.equal(r.status, 400);
    const text = await r.text();
    assert.equal(text, '{"error":{"code":"verification_failed"}}');
    assert.ok(!text.includes('SECRET'));
    assert.equal(s.store.snapshot().users, 0);
    // verified:false
    const s2 = setup({ verifyRegistration: () => Promise.resolve({ verified: false }) });
    const o2 = (await (await s2.h(post('/register/options', { username: 'Alice' }))).json()) as J;
    assert.equal(await code(await s2.h(post('/register/verify', { flowId: o2['flowId'], response: regResponse }))), 'verification_failed');
  } finally { console.error = orig; }
});

test('unerwarteter Store-Fehler -> 500 server_error', async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    const s = setup();
    s.store.createChallenge = () => Promise.reject(new Error('db down'));
    const r = await s.h(post('/login/options', {}));
    assert.equal(r.status, 500);
    assert.equal(await r.text(), '{"error":{"code":"server_error"}}');
  } finally { console.error = orig; }
});

async function loginFlow(s: Setup, resp: Record<string, unknown>): Promise<Response> {
  const l = (await (await s.h(post('/login/options', {}))).json()) as J;
  assert.deepEqual(l['options'].allowCredentials, []);
  assert.equal(l['options'].userVerification, 'required');
  return s.h(post('/login/verify', { flowId: l['flowId'], response: resp }));
}

test('login: Happy Path, unknown credential, userHandle', async () => {
  const s = setup();
  const reg = await register(s);
  const uid = reg.json['user'].id as string;
  const ok = await loginFlow(s, authResponse({ userHandle: toBase64Url(uuidToBytes(uid)) }));
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as J)['user'].id, uid);
  assert.ok(rt(ok));
  assert.equal((await loginFlow(s, authResponse())).status, 200); // ohne userHandle
  const unknown = await loginFlow(s, { ...authResponse(), id: 'zzz', rawId: 'zzz' });
  assert.equal(await code(unknown), 'unknown_credential');
  const mismatch = await loginFlow(s, authResponse({ userHandle: toBase64Url(uuidToBytes('11111111-1111-4111-8111-111111111111')) }));
  assert.equal(mismatch.status, 400);
  assert.equal(await code(mismatch), 'verification_failed');
  assert.equal(s.calls.auth, 2); // bei Mismatch nie die Bibliothek erreicht
  const l = (await (await s.h(post('/register/options', { username: 'Zed' }))).json()) as J;
  assert.equal(await code(await s.h(post('/login/verify', { flowId: l['flowId'], response: authResponse() }))), 'challenge_expired');
});

test('login: Counter-Regel', async () => {
  let next = 5;
  const s = setup({ verifyAuthentication: () => Promise.resolve({
    verified: true,
    authenticationInfo: { credentialID: 'cred-1', newCounter: next, userVerified: true, credentialDeviceType: 'multiDevice', credentialBackedUp: true, origin: ORIGIN, rpID: 'app.example' },
  }) });
  await register(s); // gespeichert: counter 0
  assert.equal((await loginFlow(s, authResponse())).status, 200); // 0 -> 5
  assert.equal((await s.store.findPasskey('cred-1'))?.counter, 5);
  next = 5;
  assert.equal(await code(await loginFlow(s, authResponse())), 'verification_failed'); // gleich
  next = 3;
  assert.equal(await code(await loginFlow(s, authResponse())), 'verification_failed'); // Rückschritt
  next = 0;
  assert.equal(await code(await loginFlow(s, authResponse())), 'verification_failed'); // 5 -> 0
  next = 6;
  assert.equal((await loginFlow(s, authResponse())).status, 200);
  // 0 -> 0 ist erlaubt (synchronisierte Passkeys)
  const s2 = setup();
  await register(s2);
  assert.equal((await loginFlow(s2, authResponse())).status, 200);
  assert.equal((await loginFlow(s2, authResponse())).status, 200);
});

test('refresh: Rotation, altes Cookie ungültig', async () => {
  const s = setup();
  const reg = await register(s);
  const c1 = rt(reg.res);
  const r1 = await s.h(post('/refresh', undefined, { cookie: `mm_rt=${c1}` }));
  assert.equal(r1.status, 200);
  const c2 = rt(r1);
  assert.ok(c2 && c2 !== c1);
  assert.equal(((await r1.json()) as J)['user'].username, 'Alice');
  assert.equal(s.store.snapshot().sessions, 1);
  const old = await s.h(post('/refresh', undefined, { cookie: `mm_rt=${c1}` }));
  assert.equal(old.status, 401);
  assert.equal(await code(old), 'unauthorized');
  assert.equal(old.headers.get('set-cookie'), null); // Mehr-Tab: neues Cookie anderer Tabs nicht löschen
  assert.equal((await s.h(post('/refresh', undefined, { cookie: `mm_rt=${c2}` }))).status, 200);
  const none = await s.h(post('/refresh'));
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('set-cookie'), null);
  // abgelaufen
  const reg2 = await register(s, 'Bob');
  s.clock.t += 31 * 24 * 3600_000;
  assert.equal((await s.h(post('/refresh', undefined, { cookie: `mm_rt=${rt(reg2.res)}` }))).status, 401);
});

test('logout: 204, Cookie gelöscht, Session weg', async () => {
  const s = setup();
  const reg = await register(s);
  const r = await s.h(post('/logout', undefined, { cookie: `mm_rt=${rt(reg.res)}` }));
  assert.equal(r.status, 204);
  assert.equal(await r.text(), '');
  assert.match(r.headers.get('set-cookie') ?? '', /mm_rt=; Path=\/api\/auth; Max-Age=0; HttpOnly; SameSite=Strict; Secure/);
  assert.equal(s.store.snapshot().sessions, 0);
  assert.equal((await s.h(post('/logout'))).status, 204);
});

test('Cookie-Optionen (secure=false, Name, Pfad)', async () => {
  const s = setup({}, { refresh: { secure: false, cookieName: 'x_rt', cookiePath: '/', ttlSec: 60 } });
  const reg = await register(s);
  const ck = reg.res.headers.get('set-cookie') ?? '';
  assert.match(ck, /^x_rt=/);
  assert.ok(ck.includes('Path=/;') && ck.includes('Max-Age=60') && !ck.includes('Secure'));
});

test('passkeys: 401 ohne Bearer, Flow mit Bearer', async () => {
  const s = setup();
  const reg = await register(s);
  const token = reg.json['accessToken'] as string;
  const uid = reg.json['user'].id as string;
  for (const [p, h] of [['/passkeys/options', {}], ['/passkeys/verify', {}], ['/passkeys/options', { authorization: 'Bearer garbage' }], ['/passkeys/options', { authorization: token }]] as const) {
    const r = await s.h(post(p, {}, h));
    assert.equal(r.status, 401, p);
    assert.equal(await code(r), 'unauthorized');
  }
  const auth = { authorization: `Bearer ${token}` };
  const o = (await (await s.h(post('/passkeys/options', {}, auth))).json()) as J;
  assert.deepEqual(o['options'].excludeCredentials, [{ id: 'cred-1', type: 'public-key' }]);
  assert.equal(o['options'].user.name, 'Alice');
  assert.equal(o['options'].user.id, toBase64Url(uuidToBytes(uid)));
  // Stub liefert andere Credential-ID für den zweiten Passkey
  let m = 0;
  const s2 = setup({ verifyRegistration: (x) => verifiedReg(x).then((v) => v.verified ? { ...v, registrationInfo: { ...v.registrationInfo, credential: { ...v.registrationInfo.credential, id: `cred-x${++m}` } } } : v) });
  const reg2 = await register(s2);
  const a2 = { authorization: `Bearer ${reg2.json['accessToken']}` };
  const o2 = (await (await s2.h(post('/passkeys/options', {}, a2))).json()) as J;
  const v = await s2.h(post('/passkeys/verify', { flowId: o2['flowId'], response: regResponse }, a2));
  assert.equal(v.status, 204);
  assert.equal(s2.store.snapshot().passkeys, 2);
  // Replay
  assert.equal(await code(await s2.h(post('/passkeys/verify', { flowId: o2['flowId'], response: regResponse }, a2))), 'challenge_expired');
});

test('passkeys/verify: Challenge eines anderen Users -> 403', async () => {
  let n = 0;
  const s = setup({ verifyRegistration: (x) => verifiedReg(x).then((v) => v.verified ? { ...v, registrationInfo: { ...v.registrationInfo, credential: { ...v.registrationInfo.credential, id: `c${++n}` } } } : v) });
  const a = await register(s, 'Alice');
  const b = await register(s, 'Bob');
  const aAuth = { authorization: `Bearer ${a.json['accessToken']}` };
  const bAuth = { authorization: `Bearer ${b.json['accessToken']}` };
  const o = (await (await s.h(post('/passkeys/options', {}, aAuth))).json()) as J;
  const r = await s.h(post('/passkeys/verify', { flowId: o['flowId'], response: regResponse }, bAuth));
  assert.equal(r.status, 403);
  assert.equal(await code(r), 'unauthorized');
  assert.equal(s.store.snapshot().passkeys, 2);
});

test('Access-Token läuft ab -> 401', async () => {
  const s = setup();
  const reg = await register(s);
  s.clock.t += 901_000;
  const r = await s.h(post('/passkeys/options', {}, { authorization: `Bearer ${reg.json['accessToken']}` }));
  assert.equal(r.status, 401);
});
