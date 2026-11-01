// A5: Abmelden mit „Daten von diesem Gerät entfernen“ (logoutAndForgetDevice, unsyncedCount).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { logoutAndForgetDevice, unsyncedCount } from '../src/features/sync.ts';
import type { ForgetDeviceOptions } from '../src/features/sync.ts';
import {
  addAttempt, addSession, getAttempts, getProfile, getRepository, getSessions, getSettings, invalidateCache, onChange,
  resetAll, setSettings, updateProfile,
} from '../src/data/storage.ts';
import type { Attempt } from '../src/types.ts';

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 1000, targetMs: 2000, weight: 1, points: 100, ...o,
});

/** Alles Ausstehende als hochgeladen markieren (wie ein erfolgreicher Push). */
function ackAll(): void {
  const repo = getRepository();
  repo.ackChanges(repo.getSyncState().pending.map((c) => c.seq));
}

/** Verknüpftes Gerät mit zwei Versuchen, einer Runde und eigener Einstellung; nichts ausstehend außer `pending`. */
function seed(pending = 0): void {
  invalidateCache();
  resetAll();
  updateProfile({ cloudUserId: 'u1' });
  addAttempt(att({ ts: 1 }));
  addAttempt(att({ ts: 2 }));
  addSession({ id: 'r1', ts: 1, mode: 'all', n: 2, correct: 2, points: 200, avgTimeMs: 1000 });
  setSettings({ sessionLength: 20 });
  ackAll();
  for (let i = 0; i < pending; i++) addAttempt(att({ ts: 100 + i }));
}

interface Calls { sync: number; signOut: number; confirm: number[] }
function opts(calls: Calls, o: Partial<ForgetDeviceOptions> & { confirm?: boolean; syncAcks?: boolean } = {}): ForgetDeviceOptions {
  return {
    online: o.online ?? (() => true),
    sync: o.sync ?? (async () => { calls.sync += 1; if (o.syncAcks) ackAll(); }),
    signOut: o.signOut ?? (async () => { calls.signOut += 1; }),
    confirmLoss: async (n) => { calls.confirm.push(n); return o.confirm ?? false; },
  };
}

let remote = 0;
onChange((src) => { if (src === 'remote') remote += 1; });
let calls: Calls;
beforeEach(() => { remote = 0; calls = { sync: 0, signOut: 0, confirm: [] }; });

function assertForgotten(): void {
  assert.equal(getAttempts().length, 0);
  assert.equal(getSessions().length, 0);
  assert.equal(getSettings().sessionLength, 10, 'Einstellungen zurück auf Standard');
  assert.equal(getProfile().cloudUserId, null);
  assert.equal(unsyncedCount(), 0);
  assert.equal(remote, 1, 'Änderung wird wie beim Remote-Wipe gemeldet');
}

function assertUntouched(): void {
  assert.equal(getAttempts().length > 0, true);
  assert.equal(getProfile().cloudUserId, 'u1');
  assert.equal(remote, 0);
}

test('unsyncedCount: nur Sync-Ziele; Vollabgleich zählt alle lokalen Datensätze', () => {
  seed();
  assert.equal(unsyncedCount(), 0);
  updateProfile({ displayName: 'x' }); // profile ist kein Sync-Ziel
  assert.equal(unsyncedCount(), 0);
  addAttempt(att({ ts: 9 }));
  setSettings({ sound: true });
  assert.equal(unsyncedCount(), 2);
  ackAll();
  getRepository().markFullPush();
  assert.equal(unsyncedCount(), 3 + 1);
  resetAll();
});

test('nichts ausstehend: ohne Sync und Nachfrage abmelden und alles entfernen', async () => {
  seed();
  assert.equal(await logoutAndForgetDevice(opts(calls)), true);
  assert.deepEqual(calls, { sync: 0, signOut: 1, confirm: [] });
  assertForgotten();
});

test('ausstehend + online: erst syncen; danach nichts offen → ohne Nachfrage entfernen', async () => {
  seed(2);
  assert.equal(unsyncedCount(), 2);
  assert.equal(await logoutAndForgetDevice(opts(calls, { syncAcks: true })), true);
  assert.deepEqual(calls, { sync: 1, signOut: 1, confirm: [] });
  assertForgotten();
});

test('nach dem Sync noch ausstehend: Nachfrage; abgelehnt → nichts geändert, nicht abgemeldet', async () => {
  seed(3);
  assert.equal(await logoutAndForgetDevice(opts(calls, { confirm: false })), false);
  assert.deepEqual(calls, { sync: 1, signOut: 0, confirm: [3] });
  assertUntouched();
  assert.equal(getAttempts().length, 5);
  assert.equal(unsyncedCount(), 3);
  resetAll();
});

test('nach dem Sync noch ausstehend: bestätigt → abmelden und entfernen', async () => {
  seed(1);
  assert.equal(await logoutAndForgetDevice(opts(calls, { confirm: true })), true);
  assert.deepEqual(calls, { sync: 1, signOut: 1, confirm: [1] });
  assertForgotten();
});

test('offline: kein Sync-Versuch, direkt die Nachfrage', async () => {
  seed(2);
  assert.equal(await logoutAndForgetDevice(opts(calls, { online: () => false, confirm: true })), true);
  assert.deepEqual(calls, { sync: 0, signOut: 1, confirm: [2] });
  assertForgotten();
});

test('Sync wirft: zählt als weiterhin ausstehend → Nachfrage', async () => {
  seed(1);
  const res = await logoutAndForgetDevice(opts(calls, { sync: async () => { calls.sync += 1; throw new Error('offline'); } }));
  assert.equal(res, false);
  assert.deepEqual(calls, { sync: 1, signOut: 0, confirm: [1] });
  assertUntouched();
  resetAll();
});

test('Abmelden scheitert: Fehler wird weitergereicht, lokal bleibt alles', async () => {
  seed();
  await assert.rejects(logoutAndForgetDevice(opts(calls, { signOut: async () => { throw new Error('network'); } })), /network/);
  assertUntouched();
  resetAll();
});
