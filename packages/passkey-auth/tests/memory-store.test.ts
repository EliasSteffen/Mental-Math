import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAuthStore } from '../src/server/memory-store.ts';
import { PasskeyAuthError } from '../src/shared/errors.ts';
import type { ChallengeRecord, NewPasskey } from '../src/shared/types.ts';

const pk = (id: string): NewPasskey => ({
  credentialId: id, publicKey: 'pk', counter: 0, transports: ['internal'], deviceType: 'multiDevice', backedUp: true,
});
const ch = (id: string, purpose: ChallengeRecord['purpose'], expiresAt: number): ChallengeRecord => ({
  id, challenge: 'c', purpose, userId: null, username: null, expiresAt,
});

test('consumeChallenge: einmalig, Purpose, Ablauf; löscht immer', async () => {
  let t = 1000;
  const s = new MemoryAuthStore({ now: () => t });
  await s.createChallenge(ch('a', 'login', 2000));
  assert.equal((await s.consumeChallenge('a', 'login'))?.id, 'a');
  assert.equal(await s.consumeChallenge('a', 'login'), null);
  await s.createChallenge(ch('b', 'login', 2000));
  assert.equal(await s.consumeChallenge('b', 'register'), null);
  assert.equal(await s.consumeChallenge('b', 'login'), null); // schon gelöscht
  await s.createChallenge(ch('c', 'add', 2000));
  t = 2000;
  assert.equal(await s.consumeChallenge('c', 'add'), null);
  assert.equal(s.snapshot().challenges, 0);
});

test('User, Passkeys, Duplikate', async () => {
  const s = new MemoryAuthStore();
  await s.createUserWithPasskey({ id: 'u1', username: 'A' }, pk('cred1'));
  const f = await s.findPasskey('cred1');
  assert.equal(f?.userId, 'u1');
  assert.equal(f?.username, 'A');
  assert.equal(await s.findPasskey('nope'), null);
  await assert.rejects(s.createUserWithPasskey({ id: 'u2', username: 'B' }, pk('cred1')),
    (e: unknown) => e instanceof PasskeyAuthError && e.code === 'already_registered' && e.status === 409);
  assert.equal(s.snapshot().users, 1);
  await s.addPasskey('u1', pk('cred2'));
  await assert.rejects(s.addPasskey('u1', pk('cred2')), (e: unknown) => e instanceof PasskeyAuthError && e.status === 409);
  assert.deepEqual((await s.listCredentialIds('u1')).sort(), ['cred1', 'cred2']);
  assert.deepEqual(await s.listCredentialIds('x'), []);
  await s.touchPasskey(f!.id, 7);
  assert.equal((await s.findPasskey('cred1'))?.counter, 7);
  assert.deepEqual(s.snapshot(), { challenges: 0, users: 1, passkeys: 2, sessions: 0 });
});

test('Sessions: rotate löscht alt, abgelaufen/unbekannt -> null', async () => {
  let t = 1000;
  const s = new MemoryAuthStore({ now: () => t });
  await s.createUserWithPasskey({ id: 'u1', username: 'A' }, pk('c'));
  await s.createSession('u1', 'h1', 5000);
  assert.deepEqual(await s.rotateSession('h1', 'h2', 6000), { id: 'u1', username: 'A' });
  assert.equal(await s.rotateSession('h1', 'h3', 6000), null);
  assert.equal(s.snapshot().sessions, 1);
  t = 6000;
  assert.equal(await s.rotateSession('h2', 'h4', 9000), null); // abgelaufen, trotzdem gelöscht
  assert.equal(s.snapshot().sessions, 0);
  await s.createSession('u1', 'h5', 9000);
  await s.deleteSession('h5');
  await s.deleteSession('h5');
  assert.equal(s.snapshot().sessions, 0);
});
