import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationOptionsJSON, RegistrationOptionsJSON } from '../src/shared/types.ts';
import { toBase64Url } from '../src/shared/base64url.ts';
import { encodeCbor } from './helpers/cbor.ts';
import type { CborValue } from './helpers/cbor.ts';
import { createSoftAuthenticator } from './helpers/soft-authenticator.ts';

const hex = (v: CborValue): string => Buffer.from(encodeCbor(v)).toString('hex');

const ORIGIN = 'https://example.test';
const RP_ID = 'example.test';
const regOptions = (challenge = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))): RegistrationOptionsJSON => ({
  rp: { id: RP_ID, name: 'Test' },
  user: { id: toBase64Url(new Uint8Array([1, 2, 3])), name: 'anna', displayName: 'Anna' },
  challenge,
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
});
const authOptions = (challenge = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))): AuthenticationOptionsJSON => ({
  challenge,
  rpId: RP_ID,
});

describe('cbor', () => {
  it('Integer', () => {
    assert.equal(hex(0), '00');
    assert.equal(hex(23), '17');
    assert.equal(hex(24), '1818');
    assert.equal(hex(500), '1901f4');
    assert.equal(hex(1000000), '1a000f4240');
    assert.equal(hex(1000000000000), '1b000000e8d4a51000');
    assert.equal(hex(-1), '20');
    assert.equal(hex(-7), '26');
    assert.equal(hex(-25), '3818');
  });
  it('Strings, Bytes, Arrays, Simple', () => {
    assert.equal(hex('a'), '6161');
    assert.equal(hex('ü'), '62c3bc');
    assert.equal(hex(new Uint8Array([1, 2])), '420102');
    assert.equal(hex([1, [2]]), '8201 8102'.replace(' ', ''));
    assert.equal(hex(true), 'f5');
    assert.equal(hex(false), 'f4');
    assert.equal(hex(null), 'f6');
  });
  it('Map behält Einfügereihenfolge', () => {
    assert.equal(hex(new Map<number | string, CborValue>([['b', 1], ['a', 2]])), 'a2616201616102');
    assert.equal(hex(new Map()), 'a0');
  });
});

describe('soft-authenticator', () => {
  async function register(auth = createSoftAuthenticator({ origin: ORIGIN })) {
    const options = regOptions();
    const response = await auth.create(options);
    const v = await verifyRegistrationResponse({
      response, expectedChallenge: options.challenge, expectedOrigin: ORIGIN,
      expectedRPID: RP_ID, requireUserVerification: true,
    });
    return { auth, v };
  }

  it('create() besteht verifyRegistrationResponse (multiDevice, backed up)', async () => {
    const { v } = await register();
    assert.equal(v.verified, true);
    assert.ok(v.registrationInfo);
    assert.equal(v.registrationInfo.credentialDeviceType, 'multiDevice');
    assert.equal(v.registrationInfo.credentialBackedUp, true);
  });

  it('get() besteht verifyAuthenticationResponse', async () => {
    const { auth, v } = await register();
    const { credential } = v.registrationInfo!;
    const options = authOptions();
    const response = await auth.get(options);
    const a = await verifyAuthenticationResponse({
      response, expectedChallenge: options.challenge, expectedOrigin: ORIGIN,
      expectedRPID: RP_ID, credential: { id: credential.id, publicKey: credential.publicKey, counter: 0 },
      requireUserVerification: true,
    });
    assert.equal(a.verified, true);
    assert.equal(a.authenticationInfo.newCounter, 0);
    assert.equal(response.response.userHandle, toBase64Url(new Uint8Array([1, 2, 3])));
  });

  it('falscher Origin schlägt fehl', async () => {
    const { auth, v } = await register();
    const { credential } = v.registrationInfo!;
    const options = authOptions();
    const response = await auth.get(options, { origin: 'https://evil.test' });
    await assert.rejects(verifyAuthenticationResponse({
      response, expectedChallenge: options.challenge, expectedOrigin: ORIGIN,
      expectedRPID: RP_ID, credential: { id: credential.id, publicKey: credential.publicKey, counter: 0 },
    }));
  });

  it('manipulierte Signatur schlägt fehl', async () => {
    const { auth, v } = await register();
    const { credential } = v.registrationInfo!;
    const options = authOptions();
    const response = await auth.get(options);
    const sig = Buffer.from(response.response.signature, 'base64url');
    sig[sig.length - 1] = sig[sig.length - 1]! ^ 0xff;
    response.response.signature = sig.toString('base64url');
    const res = await verifyAuthenticationResponse({
      response, expectedChallenge: options.challenge, expectedOrigin: ORIGIN,
      expectedRPID: RP_ID, credential: { id: credential.id, publicKey: credential.publicKey, counter: 0 },
    }).catch(() => ({ verified: false }));
    assert.equal(res.verified, false);
  });

  it('counterStart 5 → 6, dann 7', async () => {
    const { auth, v } = await register(createSoftAuthenticator({ origin: ORIGIN, counterStart: 5 }));
    const { credential } = v.registrationInfo!;
    let counter = credential.counter;
    assert.equal(counter, 5);
    for (const expected of [6, 7]) {
      const options = authOptions();
      const a = await verifyAuthenticationResponse({
        response: await auth.get(options), expectedChallenge: options.challenge, expectedOrigin: ORIGIN,
        expectedRPID: RP_ID, credential: { id: credential.id, publicKey: credential.publicKey, counter },
      });
      assert.equal(a.authenticationInfo.newCounter, expected);
      counter = a.authenticationInfo.newCounter;
    }
  });

  it('excludeCredentials wirft InvalidStateError', async () => {
    const { auth } = await register();
    const again = { ...regOptions(), excludeCredentials: [{ id: auth.credentials[0]!.id, type: 'public-key' as const }] };
    await assert.rejects(auth.create(again), (e: unknown) => e instanceof DOMException && e.name === 'InvalidStateError');
  });

  it('unbekannte Credential → NotAllowedError', async () => {
    const auth = createSoftAuthenticator({ origin: ORIGIN });
    await assert.rejects(auth.get(authOptions()), (e: unknown) => e instanceof DOMException && e.name === 'NotAllowedError');
  });

  it('userHandle null wird weggelassen', async () => {
    const { auth } = await register();
    const response = await auth.get(authOptions(), { userHandle: null });
    assert.equal('userHandle' in response.response, false);
  });
});
