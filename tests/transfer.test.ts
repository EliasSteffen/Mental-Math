import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importJSON } from '../src/data/transfer.ts';
import {
  addAttempt, addSession, exportJSON, getAttempts, getSessions, getSettings, invalidateCache, resetAll, setSettings,
} from '../src/data/storage.ts';
import type { Attempt, Session } from '../src/types.ts';

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 1000, targetMs: 2000, weight: 1, points: 100, ...o,
});
const ses = (o: Partial<Session> = {}): Session => ({ id: 's1', ts: 1, mode: 'all', n: 1, correct: 1, points: 100, avgTimeMs: 1000, ...o });

function fresh(): void {
  invalidateCache();
  resetAll();
}

test('importJSON: ungültiges JSON und falsches Format', () => {
  fresh();
  assert.equal(importJSON('{nope').ok, false);
  assert.equal(importJSON('[1,2]').ok, false);
  assert.equal(importJSON('{"foo":1}').ok, false);
  assert.equal(importJSON('{"version":9,"attempts":[]}').ok, false);
  assert.equal(importJSON('{"attempts":"x"}').ok, false);
  resetAll();
});

test('importJSON: Round-Trip mit v3-Export', () => {
  fresh();
  addAttempt(att({ ts: 10 }));
  addAttempt(att({ ts: 20 }));
  addSession(ses());
  setSettings({ sessionLength: 20 });
  const json = exportJSON();
  resetAll();
  assert.equal(getAttempts().length, 0);
  const res = importJSON(json);
  assert.deepEqual(res, { ok: true, attempts: 2, sessions: 1 });
  assert.equal(getAttempts().length, 2);
  assert.equal(getSessions().length, 1);
  assert.equal(getSettings().sessionLength, 20);
  resetAll();
});

test('importJSON: alter v1/v2-State, ungültige Einträge werden verworfen', () => {
  fresh();
  const old = { version: 1, attempts: [att({ ts: 5 }), null, 'x', { foo: 1 }], sessions: [ses()], settings: { dailyGoalMin: 30 } };
  const res = importJSON(JSON.stringify(old));
  assert.deepEqual(res, { ok: true, attempts: 1, sessions: 1 });
  assert.equal(getSettings().dailyGoalMin, 30);
  assert.equal(getSettings().timer, true);
  resetAll();
});
