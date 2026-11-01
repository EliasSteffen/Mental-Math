// JWT für die App Store Connect API (scripts/asc-check.ts): Form und Signatur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { ascToken } from '../scripts/asc-check.ts';

const decode = (part: string): unknown => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

test('ascToken: ES256 mit kid, Team-Form mit iss, gültige Signatur', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const issuerId = '00000000-1111-2222-3333-444444444444';
  const [h = '', p = '', s = ''] = ascToken({ keyId: 'ABCDE12345', issuerId, pem, now: 1_700_000_000_000 }).split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'ABCDE12345', typ: 'JWT' });
  assert.deepEqual(decode(p), { iss: issuerId, iat: 1_700_000_000, exp: 1_700_000_600, aud: 'appstoreconnect-v1' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('ascToken: individuelle Form mit sub statt iss', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const payload = decode(ascToken({ keyId: 'ABCDE12345', issuerId: null, pem, now: 0 }).split('.')[1] ?? '') as Record<string, unknown>;
  assert.equal(payload['sub'], 'user');
  assert.equal(payload['iss'], undefined);
});
