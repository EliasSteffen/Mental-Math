import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase64Url, fromBase64Url, isBase64Url } from '../src/shared/base64url.ts';
import { normalizeUsername } from '../src/shared/username.ts';
import { PasskeyAuthError, isAuthErrorCode } from '../src/shared/errors.ts';

test('base64url: Roundtrip aller Längen, keine Padding-/URL-unsicheren Zeichen', () => {
  for (let n = 0; n < 70; n++) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) & 0xff);
    const s = toBase64Url(bytes);
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual([...fromBase64Url(s)], [...bytes]);
    assert.equal(s, Buffer.from(bytes).toString('base64url'));
  }
});

test('base64url: akzeptiert ArrayBuffer und Views mit Offset', () => {
  const buf = new Uint8Array([0, 1, 2, 250, 251, 252]);
  assert.equal(toBase64Url(buf.buffer), Buffer.from(buf).toString('base64url'));
  assert.equal(toBase64Url(buf.subarray(3)), Buffer.from([250, 251, 252]).toString('base64url'));
  assert.equal(toBase64Url(new DataView(buf.buffer, 1, 2)), Buffer.from([1, 2]).toString('base64url'));
});

test('base64url: ungültige Eingaben', () => {
  assert.throws(() => fromBase64Url('ab+c'), TypeError);
  assert.throws(() => fromBase64Url('abcde'), TypeError);
  assert.equal(isBase64Url('abc_-x'), true);
  assert.equal(isBase64Url('abc_-'), false); // Länge 5 ≡ 1 (mod 4) ist nie gültig
  assert.equal(isBase64Url('a=='), false);
  assert.equal(isBase64Url(42), false);
});

test('username: normalisiert und begrenzt', () => {
  assert.deepEqual(normalizeUsername('  Elias   S.  '), { ok: true, value: 'Elias S.' });
  assert.deepEqual(normalizeUsername('A'), { ok: false, reason: 'too_short' });
  assert.deepEqual(normalizeUsername('x'.repeat(33)), { ok: false, reason: 'too_long' });
  assert.deepEqual(normalizeUsername('🦊'.repeat(32)), { ok: true, value: '🦊'.repeat(32) });
  assert.deepEqual(normalizeUsername('ad​min'), { ok: false, reason: 'invalid_chars' });
  assert.deepEqual(normalizeUsername('evil‮gnp'), { ok: false, reason: 'invalid_chars' });
  assert.deepEqual(normalizeUsername('a\u0000b'), { ok: false, reason: 'invalid_chars' });
  assert.deepEqual(normalizeUsername(null), { ok: false, reason: 'too_short' });
  assert.deepEqual(normalizeUsername('Café'), normalizeUsername('Café'));
});

test('errors: Code und Status', () => {
  const e = new PasskeyAuthError('last_passkey', undefined, 409);
  assert.equal(e.code, 'last_passkey');
  assert.equal(e.status, 409);
  assert.equal(e.message, 'last_passkey');
  assert.ok(e instanceof Error);
  assert.equal(isAuthErrorCode('cancelled'), true);
  assert.equal(isAuthErrorCode('nope'), false);
});
