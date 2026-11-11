import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_ADVANCE_MS, shouldAutoAdvance } from '../src/core/auto-advance.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/data/schema.ts';

test('Auto-Weiter: nur richtig, nicht abgelaufen, eingeschaltet', () => {
  assert.equal(AUTO_ADVANCE_MS, 700);
  assert.equal(shouldAutoAdvance({ enabled: true, correct: true, timedOut: false }), true);
  assert.equal(shouldAutoAdvance({ enabled: true, correct: false, timedOut: false }), false);
  assert.equal(shouldAutoAdvance({ enabled: true, correct: true, timedOut: true }), false);
  assert.equal(shouldAutoAdvance({ enabled: false, correct: true, timedOut: false }), false);
});

test('Einstellung autoAdvance: Default an, nur Boolean', () => {
  assert.equal(DEFAULT_SETTINGS.autoAdvance, true);
  assert.equal(normalizeSettings({}).autoAdvance, true);
  assert.equal(normalizeSettings({ autoAdvance: false }).autoAdvance, false);
  assert.equal(normalizeSettings({ autoAdvance: 'nein' }).autoAdvance, true);
  assert.equal(normalizeSettings({ autoAdvance: 0 }).autoAdvance, true);
});
