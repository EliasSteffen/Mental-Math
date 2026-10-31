import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeProtectedHeader, decodeJwt } from 'jose';
import { createTokenService, hashToken, newRefreshToken } from '../src/server/tokens.ts';
import { clearCookie, parseCookies, serializeCookie } from '../src/server/cookies.ts';
import { bytesToUuid, isUuid, uuidToBytes } from '../src/server/ids.ts';

const USER = { id: '11111111-2222-4333-8444-555555555555', username: 'Alice' };

async function genJwk(kid: string | undefined): Promise<string> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return JSON.stringify({ ...jwk, ...(kid ? { kid } : {}), alg: 'ES256' });
}

test('ES256 sign/verify, Header und Claims', async () => {
  let t = 1_700_000_000_000;
  const svc = createTokenService({ key: await genJwk('k1'), issuer: 'https://iss' }, () => t);
  const { token, expiresAt } = await svc.sign(USER);
  const h = decodeProtectedHeader(token);
  assert.equal(h.alg, 'ES256');
  assert.equal(h.kid, 'k1');
  assert.equal(h.typ, 'JWT');
  const c = decodeJwt(token);
  assert.equal(c.sub, USER.id);
  assert.equal(c['role'], 'authenticated');
  assert.equal(c.aud, 'authenticated');
  assert.equal(c.iss, 'https://iss');
  assert.equal((c.exp ?? 0) - (c.iat ?? 0), 900);
  assert.equal(expiresAt, (c.exp ?? 0) * 1000);
  assert.deepEqual(c['user_metadata'], { username: 'Alice' });
  assert.deepEqual(await svc.verify(token), { userId: USER.id, username: 'Alice' });
  t += 899_000;
  assert.ok(await svc.verify(token));
  t += 2_000;
  assert.equal(await svc.verify(token), null); // abgelaufen
});

test('falscher Schlüssel, falscher Issuer, Müll -> null', async () => {
  const now = () => 1_700_000_000_000;
  const jwk = await genJwk('k1');
  const a = createTokenService({ key: jwk, issuer: 'i' }, now);
  const b = createTokenService({ key: await genJwk('k1'), issuer: 'i' }, now);
  const { token } = await a.sign(USER);
  assert.equal(await b.verify(token), null); // anderer Schlüssel
  const c = createTokenService({ key: jwk, issuer: 'other' }, now);
  assert.equal(await c.verify(token), null); // anderer Issuer
  assert.equal(await a.verify('not.a.jwt'), null);
});

test('HS256-Secret', async () => {
  const key = 'x'.repeat(40);
  const svc = createTokenService({ key, issuer: 'i', ttlSec: 60 }, () => 1_700_000_000_000);
  const { token } = await svc.sign(USER);
  const h = decodeProtectedHeader(token);
  assert.equal(h.alg, 'HS256');
  assert.equal(h.kid, undefined);
  assert.ok(await svc.verify(token));
  const other = createTokenService({ key: 'y'.repeat(40), issuer: 'i' }, () => 1_700_000_000_000);
  assert.equal(await other.verify(token), null);
  assert.throws(() => createTokenService({ key: 'short', issuer: 'i' }, Date.now));
});

test('Supabase-Format: key_ops ["sign","verify"] und use "sig" werden akzeptiert', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const key = JSON.stringify({ ...jwk, kid: 'sb', alg: 'ES256', use: 'sig', key_ops: ['sign', 'verify'], ext: true });
  const t = createTokenService({ key, issuer: 'iss' }, () => Date.now());
  const { token } = await t.sign({ id: '00000000-0000-4000-8000-000000000001', username: 'X' });
  assert.equal(decodeProtectedHeader(token).kid, 'sb');
  assert.notEqual(await t.verify(token), null);
});

test('JWK ohne kid wirft', async () => {
  assert.throws(() => createTokenService({ key: noKidJwk(), issuer: 'i' }, Date.now));
});
function noKidJwk(): string {
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'c' });
}

test('Refresh-Token und Hash', async () => {
  const t = newRefreshToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, newRefreshToken());
  assert.equal(await hashToken('abc'), await hashToken('abc'));
  assert.notEqual(await hashToken('abc'), await hashToken('abd'));
  assert.equal(await hashToken('abc'), 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
});

test('Cookies', () => {
  assert.equal(
    serializeCookie('mm_rt', 'v', { path: '/api/auth', maxAgeSec: 10, secure: true }),
    'mm_rt=v; Path=/api/auth; Max-Age=10; HttpOnly; SameSite=Strict; Secure');
  assert.ok(!serializeCookie('a', 'b', { path: '/', maxAgeSec: 1, secure: false }).includes('Secure'));
  assert.match(clearCookie('a', { path: '/', secure: true }), /Max-Age=0/);
  assert.deepEqual(parseCookies('a=1; mm_rt=xyz; b=2=3'), { a: '1', mm_rt: 'xyz', b: '2=3' });
  assert.deepEqual(parseCookies(null), {});
});

test('UUID-Bytes', () => {
  const b = uuidToBytes(USER.id);
  assert.equal(b.length, 16);
  assert.equal(bytesToUuid(b), USER.id);
  assert.ok(isUuid(USER.id));
  assert.ok(!isUuid('nope'));
});
