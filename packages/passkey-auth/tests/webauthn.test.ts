import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebAuthn, type WebAuthnEnv } from '../src/client/webauthn.ts';
import { toBase64Url, fromBase64Url } from '../src/shared/base64url.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';
import type { AuthenticationOptionsJSON, RegistrationOptionsJSON } from '../src/shared/types.ts';

const ab = (bytes: number[]): ArrayBuffer => new Uint8Array(bytes).buffer;
const asCredential = (x: object): Credential => x as unknown as Credential;

interface Recorder {
  create: CredentialCreationOptions[];
  get: CredentialRequestOptions[];
}

// Fake-Env: result wird pro Methode geliefert oder geworfen
function makeEnv(opts: {
  create?: () => Promise<Credential | null>;
  get?: () => Promise<Credential | null>;
  platform?: () => Promise<boolean>;
  conditional?: () => Promise<boolean>;
} = {}): { env: WebAuthnEnv; rec: Recorder } {
  const rec: Recorder = { create: [], get: [] };
  const env: WebAuthnEnv = {
    credentials: {
      create: async (o?: CredentialCreationOptions) => {
        rec.create.push(o ?? {});
        return opts.create ? opts.create() : null;
      },
      get: async (o?: CredentialRequestOptions) => {
        rec.get.push(o ?? {});
        return opts.get ? opts.get() : null;
      },
    },
    PublicKeyCredential: {
      isUserVerifyingPlatformAuthenticatorAvailable: opts.platform,
      isConditionalMediationAvailable: opts.conditional,
    },
  };
  return { env, rec };
}

const regOptions: RegistrationOptionsJSON = {
  rp: { id: 'example.test', name: 'Example' },
  user: { id: toBase64Url(ab([1, 2, 3])), name: 'elias', displayName: 'Elias' },
  challenge: toBase64Url(ab([10, 11, 12, 13])),
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  excludeCredentials: [
    { id: toBase64Url(ab([50, 51])), type: 'public-key', transports: ['internal', 'hybrid'] },
  ],
  authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  attestation: 'none',
};

const authOptions: AuthenticationOptionsJSON = {
  challenge: toBase64Url(ab([7, 8, 9])),
  timeout: 30000,
  rpId: 'example.test',
  allowCredentials: [{ id: toBase64Url(ab([60])), type: 'public-key', transports: ['usb'] }],
  userVerification: 'preferred',
};

function fullRegistrationCredential(): Credential {
  return asCredential({
    id: 'cred-id',
    rawId: ab([9, 8, 7]),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: ab([1, 2]),
      attestationObject: ab([3, 4]),
      getTransports: () => ['internal', 'bogus', 'usb'],
      getAuthenticatorData: () => ab([5]),
      getPublicKeyAlgorithm: () => -7,
      getPublicKey: () => ab([6]),
    },
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  });
}

test('support: alle Probes true', async () => {
  const { env } = makeEnv({
    platform: async () => true,
    conditional: async () => true,
  });
  assert.deepEqual(await createWebAuthn(env).support(), { webauthn: true, platform: true, conditional: true });
});

test('support: Probes false oder fehlend', async () => {
  const { env } = makeEnv({ platform: async () => false });
  assert.deepEqual(await createWebAuthn(env).support(), { webauthn: true, platform: false, conditional: false });

  const bare = makeEnv();
  assert.deepEqual(await createWebAuthn(bare.env).support(), { webauthn: true, platform: false, conditional: false });
});

test('support: fehlende Credentials oder PublicKeyCredential ergibt webauthn false', async () => {
  const noCreds: WebAuthnEnv = {
    credentials: undefined,
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true },
  };
  assert.deepEqual(await createWebAuthn(noCreds).support(), { webauthn: false, platform: true, conditional: false });

  const noPkc: WebAuthnEnv = { credentials: makeEnv().env.credentials, PublicKeyCredential: undefined };
  assert.deepEqual(await createWebAuthn(noPkc).support(), { webauthn: false, platform: false, conditional: false });
});

test('support: werfende Probes (sync und async) ergeben false, ohne zu werfen', async () => {
  const { env } = makeEnv();
  const throwingSync: WebAuthnEnv = {
    credentials: env.credentials,
    PublicKeyCredential: {
      isUserVerifyingPlatformAuthenticatorAvailable: () => {
        throw new Error('boom');
      },
      isConditionalMediationAvailable: async () => {
        throw new Error('boom');
      },
    },
  };
  assert.deepEqual(await createWebAuthn(throwingSync).support(), { webauthn: true, platform: false, conditional: false });
});

test('create: Challenge, user.id und excludeCredentials werden korrekt konvertiert', async () => {
  const { env, rec } = makeEnv({ create: async () => fullRegistrationCredential() });
  const ac = new AbortController();
  await createWebAuthn(env).create(regOptions, ac.signal);

  assert.equal(rec.create.length, 1);
  const call = rec.create[0];
  assert.ok(call);
  assert.equal(call.signal, ac.signal);
  const pk = call.publicKey;
  assert.ok(pk);
  assert.ok(pk.challenge instanceof Uint8Array);
  assert.deepEqual([...(pk.challenge as Uint8Array)], [10, 11, 12, 13]);
  assert.deepEqual([...(pk.user.id as Uint8Array)], [1, 2, 3]);
  assert.equal(pk.user.name, 'elias');
  assert.deepEqual(pk.rp, { id: 'example.test', name: 'Example' });
  assert.deepEqual(pk.pubKeyCredParams, [{ type: 'public-key', alg: -7 }]);
  assert.equal(pk.timeout, 60000);
  assert.equal(pk.attestation, 'none');
  assert.deepEqual(pk.authenticatorSelection, { residentKey: 'required', userVerification: 'required' });
  assert.ok(pk.excludeCredentials);
  const ex = pk.excludeCredentials[0];
  assert.ok(ex);
  assert.equal(ex.type, 'public-key');
  assert.deepEqual([...(ex.id as Uint8Array)], [50, 51]);
  assert.deepEqual(ex.transports, ['internal', 'hybrid']);
});

test('create: Ergebnis wird zu RegistrationResponseJSON (Roundtrip)', async () => {
  const { env } = makeEnv({ create: async () => fullRegistrationCredential() });
  const out = await createWebAuthn(env).create(regOptions);

  assert.deepEqual(out, {
    id: 'cred-id',
    rawId: toBase64Url(ab([9, 8, 7])),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: {
      clientDataJSON: toBase64Url(ab([1, 2])),
      attestationObject: toBase64Url(ab([3, 4])),
      transports: ['internal', 'usb'],
      authenticatorData: toBase64Url(ab([5])),
      publicKeyAlgorithm: -7,
      publicKey: toBase64Url(ab([6])),
    },
    clientExtensionResults: { credProps: { rk: true } },
  });
  assert.deepEqual([...fromBase64Url(out.response.clientDataJSON)], [1, 2]);
  assert.deepEqual([...fromBase64Url(out.rawId)], [9, 8, 7]);
});

test('create: fehlende optionale Getter und null-PublicKey werden weggelassen', async () => {
  const cred = asCredential({
    id: 'x',
    rawId: ab([1]),
    type: 'public-key',
    authenticatorAttachment: null,
    response: {
      clientDataJSON: ab([2]),
      attestationObject: ab([3]),
      getPublicKey: () => null,
    },
  });
  const { env } = makeEnv({ create: async () => cred });
  const out = await createWebAuthn(env).create(regOptions);

  assert.deepEqual(out, {
    id: 'x',
    rawId: toBase64Url(ab([1])),
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(ab([2])),
      attestationObject: toBase64Url(ab([3])),
    },
    clientExtensionResults: {},
  });
});

test('create: ohne Signal wird kein signal-Feld übergeben', async () => {
  const { env, rec } = makeEnv({ create: async () => fullRegistrationCredential() });
  await createWebAuthn(env).create(regOptions);
  assert.equal('signal' in (rec.create[0] ?? {}), false);
});

test('get: mediation, rpId, allowCredentials und userVerification werden übergeben', async () => {
  const { env, rec } = makeEnv({
    get: async () => asCredential({
      id: 'a',
      rawId: ab([1]),
      type: 'public-key',
      response: { clientDataJSON: ab([2]), authenticatorData: ab([3]), signature: ab([4]), userHandle: ab([5]) },
    }),
  });
  const out = await createWebAuthn(env).get(authOptions, { mediation: 'conditional' });

  const call = rec.get[0];
  assert.ok(call?.publicKey);
  assert.equal(call.mediation, 'conditional');
  assert.deepEqual([...(call.publicKey.challenge as Uint8Array)], [7, 8, 9]);
  assert.equal(call.publicKey.rpId, 'example.test');
  assert.equal(call.publicKey.timeout, 30000);
  assert.equal(call.publicKey.userVerification, 'preferred');
  const allow = call.publicKey.allowCredentials?.[0];
  assert.ok(allow);
  assert.deepEqual([...(allow.id as Uint8Array)], [60]);
  assert.deepEqual(allow.transports, ['usb']);

  assert.deepEqual(out, {
    id: 'a',
    rawId: toBase64Url(ab([1])),
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(ab([2])),
      authenticatorData: toBase64Url(ab([3])),
      signature: toBase64Url(ab([4])),
      userHandle: toBase64Url(ab([5])),
    },
    clientExtensionResults: {},
  });
});

test('get: ohne mediation fehlt das Feld, userHandle null wird weggelassen', async () => {
  const { env, rec } = makeEnv({
    get: async () => asCredential({
      id: 'a',
      rawId: ab([1]),
      type: 'public-key',
      response: { clientDataJSON: ab([2]), authenticatorData: ab([3]), signature: ab([4]), userHandle: null },
    }),
  });
  const out = await createWebAuthn(env).get(authOptions);
  assert.equal('mediation' in (rec.get[0] ?? {}), false);
  assert.equal('userHandle' in out.response, false);
});

test('get: Signal wird durchgereicht', async () => {
  const { env, rec } = makeEnv({
    get: async () => asCredential({
      id: 'a', rawId: ab([1]), type: 'public-key',
      response: { clientDataJSON: ab([2]), authenticatorData: ab([3]), signature: ab([4]) },
    }),
  });
  const ac = new AbortController();
  await createWebAuthn(env).get(authOptions, { signal: ac.signal });
  assert.equal(rec.get[0]?.signal, ac.signal);
});

test('null-Ergebnis ergibt cancelled bei create und get', async () => {
  const { env } = makeEnv({ create: async () => null, get: async () => null });
  const api = createWebAuthn(env);
  await assert.rejects(api.create(regOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'cancelled');
  await assert.rejects(api.get(authOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'cancelled');
});

test('Fehler-Mapping: NotAllowedError und AbortError werden zu cancelled', async () => {
  for (const name of ['NotAllowedError', 'AbortError']) {
    const { env } = makeEnv({
      create: async () => { throw new DOMException('x', name); },
      get: async () => { throw new DOMException('x', name); },
    });
    const api = createWebAuthn(env);
    await assert.rejects(api.create(regOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'cancelled');
    await assert.rejects(api.get(authOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'cancelled');
  }
});

test('Fehler-Mapping: InvalidStateError wird zu already_registered', async () => {
  const { env } = makeEnv({ create: async () => { throw new DOMException('x', 'InvalidStateError'); } });
  await assert.rejects(createWebAuthn(env).create(regOptions), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'already_registered');
});

test('Fehler-Mapping: SecurityError und NotSupportedError werden zu not_supported', async () => {
  for (const name of ['SecurityError', 'NotSupportedError']) {
    const { env } = makeEnv({ get: async () => { throw new DOMException('x', name); } });
    await assert.rejects(createWebAuthn(env).get(authOptions), (e: unknown) =>
      e instanceof PasskeyAuthError && e.code === 'not_supported');
  }
});

test('Fehler-Mapping: unbekannte Fehler werden zu verification_failed', async () => {
  const { env } = makeEnv({ create: async () => { throw new Error('weird'); } });
  await assert.rejects(createWebAuthn(env).create(regOptions), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'verification_failed');
});

test('Fehler-Mapping: eigener PasskeyAuthError bleibt unverändert', async () => {
  const original = new PasskeyAuthError('rate_limited', 'slow down', 429);
  const { env } = makeEnv({ create: async () => { throw original; } });
  await assert.rejects(createWebAuthn(env).create(regOptions), (e: unknown) => e === original);
});

test('ungültiges base64url in den Optionen ergibt invalid_request', async () => {
  const { env } = makeEnv({ create: async () => fullRegistrationCredential() });
  const bad = { ...regOptions, challenge: 'ab+c' };
  await assert.rejects(createWebAuthn(env).create(bad), (e: unknown) =>
    e instanceof PasskeyAuthError && e.code === 'invalid_request');
});

test('nicht unterstützte Umgebung ergibt not_supported bei create und get', async () => {
  const envs: WebAuthnEnv[] = [
    { credentials: undefined, PublicKeyCredential: undefined },
    { credentials: makeEnv().env.credentials, PublicKeyCredential: undefined },
  ];
  for (const env of envs) {
    const api = createWebAuthn(env);
    await assert.rejects(api.create(regOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'not_supported');
    await assert.rejects(api.get(authOptions), (e: unknown) => e instanceof PasskeyAuthError && e.code === 'not_supported');
  }
});

test('ohne env werden die Globals erst beim Aufruf gelesen', async () => {
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const pkcDesc = Object.getOwnPropertyDescriptor(globalThis, 'PublicKeyCredential');
  const api = createWebAuthn();
  try {
    assert.deepEqual(await api.support(), { webauthn: false, platform: false, conditional: false });

    const { env } = makeEnv({ platform: async () => true });
    Object.defineProperty(globalThis, 'navigator', { value: { credentials: env.credentials }, configurable: true });
    Object.defineProperty(globalThis, 'PublicKeyCredential', { value: env.PublicKeyCredential, configurable: true });
    assert.deepEqual(await api.support(), { webauthn: true, platform: true, conditional: false });
  } finally {
    if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (pkcDesc) Object.defineProperty(globalThis, 'PublicKeyCredential', pkcDesc);
    else Reflect.deleteProperty(globalThis, 'PublicKeyCredential');
  }
});
