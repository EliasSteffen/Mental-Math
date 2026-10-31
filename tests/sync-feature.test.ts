import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SyncStatus } from 'offline-sync';
import { decideLink, isSchemaTarget, syncStatusEntries, syncStatusKey, getSyncStatus } from '../src/features/sync.ts';

const base: SyncStatus = { phase: 'idle', lastSyncAt: null, lastError: null, pending: 0, pushed: 0, pulled: 0, rejected: 0 };
const NOW = 1_000_000_000;

test('decideLink: erste Verknüpfung, gleiches und anderes Konto', () => {
  assert.equal(decideLink(null, 'u1'), 'first');
  assert.equal(decideLink('', 'u1'), 'first');
  assert.equal(decideLink('u1', 'u1'), 'same');
  assert.equal(decideLink('u1', 'u2'), 'other');
});

test('isSchemaTarget: Collections und Dokumente des Schemas, nicht profile', () => {
  for (const n of ['results', 'sessions', 'settings', 'reviews', 'dailyResults', 'chainBest', 'parallel', 'activity']) assert.ok(isSchemaTarget(n), n);
  assert.equal(isSchemaTarget('profile'), false);
  assert.equal(isSchemaTarget('sync'), false);
});

test('syncStatusKey: Phasen', () => {
  assert.deepEqual(syncStatusKey({ ...base, phase: 'syncing' }, NOW), { key: 'account.sync.syncing' });
  assert.deepEqual(syncStatusKey({ ...base, phase: 'offline' }, NOW), { key: 'account.sync.offline' });
  assert.deepEqual(syncStatusKey({ ...base, phase: 'error', lastError: 'auth' }, NOW), { key: 'account.sync.authError' });
  assert.deepEqual(syncStatusKey({ ...base, phase: 'error', lastError: 'server' }, NOW), { key: 'account.sync.failed' });
  assert.deepEqual(syncStatusKey(base, NOW), { key: 'account.sync.notYet' });
});

test('syncStatusKey: relative Minuten', () => {
  assert.deepEqual(syncStatusKey({ ...base, lastSyncAt: NOW - 30_000 }, NOW), { key: 'account.sync.syncedJustNow' });
  assert.deepEqual(syncStatusKey({ ...base, lastSyncAt: NOW + 5_000 }, NOW), { key: 'account.sync.syncedJustNow' });
  assert.deepEqual(syncStatusKey({ ...base, lastSyncAt: NOW - 125_000 }, NOW), { key: 'account.sync.syncedAgo', params: { min: 2 } });
});

test('syncStatusEntries: pending und rejected als eigene Einträge', () => {
  const e = syncStatusEntries({ ...base, lastSyncAt: NOW - 60_000, pending: 3, rejected: 1 }, NOW);
  assert.deepEqual(e, [
    { key: 'account.sync.syncedAgo', params: { min: 1 } },
    { key: 'account.sync.pending', params: { n: 3 } },
    { key: 'account.sync.rejected', params: { n: 1 } },
  ]);
  assert.equal(syncStatusEntries(base, NOW).length, 1);
});

test('getSyncStatus: vor startSync disabled', () => {
  assert.equal(getSyncStatus().phase, 'disabled');
});
