import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryAuthStore, ROTATION_GRACE_MS } from '../src/server/memory-store.ts';
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

const A = { id: 'u1', username: 'A' };
const G = ROTATION_GRACE_MS;

async function withUser(t: { now: number }): Promise<MemoryAuthStore> {
  const s = new MemoryAuthStore({ now: () => t.now });
  await s.createUserWithPasskey(A, pk('c'));
  return s;
}

test('Sessions: rotate ersetzt den Hash, abgelaufen/unbekannt -> null', async () => {
  const t = { now: 1000 };
  const s = await withUser(t);
  await s.createSession('u1', 'h1', 500_000);
  assert.deepEqual(await s.rotateSession('h1', 'h2', 600_000), A);
  assert.equal(await s.rotateSession('nope', 'h3', 600_000), null);
  assert.equal(s.snapshot().sessions, 1);
  assert.deepEqual(await s.rotateSession('h2', 'h4', 700_000), A);
  t.now = 700_000;
  assert.equal(await s.rotateSession('h4', 'h5', 900_000), null); // abgelaufen, trotzdem gelöscht
  assert.equal(s.snapshot().sessions, 0);
  await s.createSession('u1', 'h6', 900_000);
  await s.deleteSession('h6');
  await s.deleteSession('h6');
  assert.equal(s.snapshot().sessions, 0);
});

test('Sessions: alter Hash innerhalb der Gnadenfrist rotiert erneut, Frist gleitet nicht', async () => {
  const t = { now: 1000 };
  const s = await withUser(t);
  await s.createSession('u1', 'h1', 10 * G);
  assert.deepEqual(await s.rotateSession('h1', 'h2', 10 * G), A);
  t.now += G - 10_000;
  assert.deepEqual(await s.rotateSession('h1', 'h3', 10 * G), A, 'verlorene Antwort');
  assert.equal(await s.rotateSession('h2', 'hx', 10 * G), null, 'h2 wurde ersetzt');
  assert.equal(s.snapshot().sessions, 1);
  t.now += 10_000; // 60 s seit der echten Rotation
  assert.equal(await s.rotateSession('h1', 'h4', 10 * G), null, 'Wiederverwendung');
  assert.equal(s.snapshot().sessions, 0, 'Session gelöscht');
  assert.equal(await s.rotateSession('h3', 'h5', 10 * G), null);
});

test('Sessions: Wiederverwendung nach der Gnadenfrist löscht die Session', async () => {
  const t = { now: 1000 };
  const s = await withUser(t);
  await s.createSession('u1', 'h1', 10 * G);
  assert.deepEqual(await s.rotateSession('h1', 'h2', 10 * G), A);
  t.now += G + 1000;
  assert.equal(await s.rotateSession('h1', 'h3', 10 * G), null);
  assert.equal(s.snapshot().sessions, 0);
  assert.equal(await s.rotateSession('h2', 'h4', 10 * G), null, 'auch der gestohlene neue Token ist wertlos');
});

test('Sessions: absolute Grenze kappt expiresAt und greift trotz Rotation', async () => {
  const t = { now: 0 };
  const s = await withUser(t);
  await s.createSession('u1', 'h1', 100_000, 250_000);
  t.now = 90_000;
  assert.deepEqual(await s.rotateSession('h1', 'h2', 190_000), A);
  t.now = 180_000;
  assert.deepEqual(await s.rotateSession('h2', 'h3', 280_000), A, 'expiresAt auf 250 000 gekappt');
  t.now = 249_999;
  assert.deepEqual(await s.rotateSession('h3', 'h4', 349_999), A);
  t.now = 250_000;
  assert.equal(await s.rotateSession('h4', 'h5', 350_000), null, 'absolute Grenze erreicht');
  assert.equal(s.snapshot().sessions, 0);
  // Ohne absolute Grenze (Altbestand): gleitet unbegrenzt
  await s.createSession('u1', 'l1', 300_000);
  t.now = 290_000;
  assert.deepEqual(await s.rotateSession('l1', 'l2', 10_000_000), A);
  t.now = 9_000_000;
  assert.deepEqual(await s.rotateSession('l2', 'l3', 20_000_000), A);
});
