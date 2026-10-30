import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSettings, setSettings, getReviews, setReviews, getActivity, addActivityMs, resetAll, load, save,
} from '../public/js/storage.js';

test('Defaults, alte Daten werden ergänzt (In-Memory)', () => {
  resetAll();
  assert.deepEqual(getSettings(), {
    sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto', timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto', enabledCategories: null,
  });
  assert.deepEqual(getReviews(), {});
  assert.deepEqual(getActivity(), {});
  save({ version: 1, attempts: [], sessions: [], settings: { sessionLength: 20 } });
  assert.equal(getSettings().sessionLength, 20);
  assert.equal(getSettings().dailyGoalMin, 15);
  assert.deepEqual(getReviews(), {});
});

test('settings, reviews, activity', () => {
  resetAll();
  setSettings({ theme: 'oled' });
  assert.equal(getSettings().theme, 'oled');
  setReviews({ a: { box: 1, dueAt: 5, lastTs: 1 } });
  assert.deepEqual(getReviews(), { a: { box: 1, dueAt: 5, lastTs: 1 } });
  const ts = new Date(2026, 5, 10, 12).getTime();
  addActivityMs(5000, ts);
  addActivityMs(5000, ts + 1000);
  assert.deepEqual(getActivity(), { '2026-06-10': 10000 });
  assert.equal(load().settings.theme, 'oled');
});

test('Activity: max. 400 Tage', () => {
  resetAll();
  for (let i = 0; i < 410; i++) addActivityMs(1000, new Date(2025, 0, 1 + i, 12).getTime());
  const keys = Object.keys(getActivity()).sort();
  assert.equal(keys.length, 400);
  assert.equal(keys[keys.length - 1], '2026-02-14');
  assert.ok(!('2025-01-01' in getActivity()));
});

test('Kaputtes localStorage fällt auf Memory zurück', () => {
  resetAll();
  globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  try {
    addActivityMs(1000, new Date(2026, 0, 1, 12).getTime());
    assert.equal(getActivity()['2026-01-01'], 1000);
  } finally {
    delete globalThis.localStorage;
    resetAll();
  }
});
