import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderState } from '../src/core/reminder-state.ts';
import { detectSupport } from '../src/platform/web-push.ts';
import { dayKey } from '../src/core/progress.ts';
import { parseState } from '../src/core/reminders.ts';
import type { Attempt } from '../src/types.ts';

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 0, sessionId: 's', mode: 'all', prompt: '', unit: '', expected: 0, given: 0, weight: 1,
  category: 'pct', subtype: 'pct.of', correct: true, errorType: null, timeMs: 5000, targetMs: 10000, points: 100, ...o,
});

test('detectSupport: Push, iOS ohne Installation, sonst nicht unterstützt', () => {
  assert.equal(detectSupport({ serviceWorker: true, push: true, ios: false, standalone: false }), 'ok');
  assert.equal(detectSupport({ serviceWorker: true, push: true, ios: true, standalone: true }), 'ok');
  assert.equal(detectSupport({ serviceWorker: true, push: false, ios: true, standalone: false }), 'ios-install');
  assert.equal(detectSupport({ serviceWorker: true, push: false, ios: true, standalone: true }), 'unsupported', 'altes iOS');
  assert.equal(detectSupport({ serviceWorker: false, push: false, ios: false, standalone: false }), 'unsupported');
});

test('buildReminderState: Tagesziel, Serie, Wiederholungen, Schwächen – gültig für den Server', () => {
  const now = new Date(2026, 0, 15, 17, 0).getTime();
  const day = (offset: number): string => dayKey(new Date(2026, 0, 15 + offset, 12).getTime());
  const activity = { [day(-2)]: 16 * 60_000, [day(-1)]: 15 * 60_000, [day(0)]: 6 * 60_000 + 30_000 };
  const reviews = {
    'pct.of': { box: 0, dueAt: now - 1000, lastTs: 0 },
    'mult.2x2': { box: 1, dueAt: now + 86_400_000, lastTs: 0 },
  };
  const bad = Array.from({ length: 5 }, () => att({ subtype: 'mult.2x2', category: 'mult', correct: false, errorType: 'falsch' }));
  const s = buildReminderState({ activity, goalMin: 15, reviews, attempts: bad, enabledCategories: null }, now);
  assert.deepEqual(s, {
    day: day(0), todayMin: 6, goalMin: 15, goalDone: false, streak: 2, reviewsDue: 1, nextReviewAt: now - 1000,
    weak: ['mult.2x2'], at: now,
  });
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s))), s, 'übersteht JSON und Server-Validierung');

  const done = buildReminderState({ activity: { ...activity, [day(0)]: 20 * 60_000 }, goalMin: 15, reviews: {}, attempts: [], enabledCategories: null }, now);
  assert.equal(done.goalDone, true);
  assert.equal(done.streak, 3);
  assert.equal(done.nextReviewAt, null);
  assert.deepEqual(done.weak, []);
});
