// Lokale Erinnerungen der iOS-App: planLocal spielt die Server-Regeln (decide/replan) im Voraus durch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLocal } from '../src/core/reminder-plan.ts';
import { DEFAULT_REMINDER_PREFS } from '../src/core/reminders.ts';
import type { ReminderState } from '../src/core/reminders.ts';

const TZ = 'Europe/Berlin';
// Montag, 2. November 2026 (MEZ = UTC+1)
const at = (day: number, hh: number, mm = 0): number => Date.UTC(2026, 10, day, hh - 1, mm);
const DAY = 86_400_000;

const state = (now: number, o: Partial<ReminderState> = {}): ReminderState => ({
  day: '2026-11-02', todayMin: 0, goalMin: 15, goalDone: false, streak: 3, reviewsDue: 0, nextReviewAt: null, weak: [], at: now, ...o,
});

const plan = (now: number, s: ReminderState, horizonDays = 2, max = 60) => planLocal({
  prefs: { ...DEFAULT_REMINDER_PREFS }, state: s, tz: TZ, now, lastSentAt: null, lastReviewSent: null, horizonMs: horizonDays * DAY, max,
});

test('planLocal: täglich 18 Uhr, Serie retten um 20 Uhr nur solange die Serie heute noch zu retten ist', () => {
  const now = at(2, 8);
  assert.deepEqual(plan(now, state(now)), [
    { at: at(2, 18), kind: 'daily' },
    { at: at(2, 20), kind: 'streak' },
    { at: at(3, 18), kind: 'daily' },
  ]);
});

test('planLocal: wer gerade in der App war, bekommt die nächsten 20 Minuten nichts', () => {
  const now = at(2, 17, 50);
  assert.deepEqual(plan(now, state(now)), [
    { at: at(2, 20), kind: 'streak' },
    { at: at(3, 18), kind: 'daily' },
  ]);
});

test('planLocal: Tagesziel erreicht → heute nichts, morgen täglich und Serie retten', () => {
  const now = at(2, 8);
  assert.deepEqual(plan(now, state(now, { goalDone: true, todayMin: 15 })), [
    { at: at(3, 18), kind: 'daily' },
    { at: at(3, 20), kind: 'streak' },
  ]);
});

test('planLocal: Lern-Hinweis sonntags um 10 Uhr, Höchstzahl und Horizont gelten', () => {
  const now = at(2, 8);
  const week = plan(now, state(now), 7);
  assert.ok(week.some((p) => p.kind === 'tip' && p.at === at(8, 10)));
  assert.ok(week.every((p) => p.at > now && p.at <= now + 7 * DAY));
  assert.equal(plan(now, state(now), 7, 2).length, 2);
});

test('planLocal: ausgeschaltete Arten werden nicht geplant', () => {
  const now = at(2, 8);
  const off = planLocal({
    prefs: { ...DEFAULT_REMINDER_PREFS, daily: false, streak: false, tip: false }, state: state(now), tz: TZ, now,
    lastSentAt: null, lastReviewSent: null, horizonMs: 7 * DAY, max: 60,
  });
  assert.deepEqual(off, []);
});
