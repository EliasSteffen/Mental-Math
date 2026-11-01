// Bitte um eine App-Store-Bewertung (features/review-prompt.ts): Nutzung, gute Runde, einmal je Version, 60 Tage Pause.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_MIN_DAYS, REVIEW_MIN_SESSIONS, REVIEW_PAUSE_MS, distinctDays, shouldAskForReview, type ReviewInput,
} from '../src/features/review-prompt.ts';

const DAY = 86_400_000;
/** Lokale Zeit (wie dayKey), damit die Tage unabhängig von der Zeitzone des Rechners stimmen. */
const at = (d: number, h: number, m = 0): number => new Date(2026, 9, d, h, m).getTime();
const s = (ts: number, n = 10): { ts: number; n: number } => ({ ts, n });

/** 5 Runden an 3 Tagen */
const USED = [s(at(1, 9)), s(at(1, 18)), s(at(2, 12)), s(at(3, 8)), s(at(3, 20))];
const NOW = at(10, 12);
const base: ReviewInput = {
  sessions: USED, now: NOW, round: { correct: 8, n: 10, newBest: false }, askedVersion: '', askedAt: 0, version: '1.15.0',
};

test('distinctDays: lokale Kalendertage, Mitternacht trennt', () => {
  assert.equal(distinctDays([]), 0);
  assert.equal(distinctDays([at(1, 0, 1), at(1, 23, 59)]), 1, 'gleicher Tag, fast 24 h auseinander');
  assert.equal(distinctDays([at(1, 23, 59), at(2, 0, 1)]), 2, 'zwei Minuten, aber über Mitternacht');
  assert.equal(distinctDays([at(1, 12), at(2, 12), at(2, 13), at(31, 12)]), 3);
});

test('shouldAskForReview: alle Bedingungen erfüllt', () => {
  assert.equal(REVIEW_MIN_SESSIONS, 5);
  assert.equal(REVIEW_MIN_DAYS, 3);
  assert.equal(shouldAskForReview(base), true);
});

test('shouldAskForReview: zu wenig Nutzung (Runden bzw. Tage)', () => {
  assert.equal(shouldAskForReview({ ...base, sessions: USED.slice(0, 4) }), false, '4 Runden');
  const twoDays = [s(at(1, 9)), s(at(1, 10)), s(at(1, 11)), s(at(2, 9)), s(at(2, 10)), s(at(2, 11))];
  assert.equal(shouldAskForReview({ ...base, sessions: twoDays }), false, '6 Runden an 2 Tagen');
  const leere = [...USED.slice(0, 4), s(at(4, 9), 0)];
  assert.equal(shouldAskForReview({ ...base, sessions: leere }), false, 'Runde ohne Aufgaben zählt nicht');
});

test('shouldAskForReview: Tage über Mitternacht', () => {
  // 23:50 und 00:10 sind zwei Tage: 5 Runden an 3 Tagen innerhalb von gut 24 h
  const night = [s(at(1, 23, 50)), s(at(2, 0, 10)), s(at(2, 12)), s(at(2, 23, 55)), s(at(3, 0, 5))];
  assert.equal(shouldAskForReview({ ...base, sessions: night }), true);
  // dieselbe Spanne ohne Mitternacht dazwischen: ein Tag
  const oneDay = [s(at(2, 0, 10)), s(at(2, 6)), s(at(2, 12)), s(at(2, 18)), s(at(2, 23, 55))];
  assert.equal(shouldAskForReview({ ...base, sessions: oneDay }), false);
});

test('shouldAskForReview: nur nach einer guten Runde (≥ 80 % oder Bestwert)', () => {
  assert.equal(shouldAskForReview({ ...base, round: { correct: 7, n: 10, newBest: false } }), false);
  assert.equal(shouldAskForReview({ ...base, round: { correct: 4, n: 5, newBest: false } }), true, 'genau 80 %');
  assert.equal(shouldAskForReview({ ...base, round: { correct: 2, n: 5, newBest: true } }), true, 'Bestwert');
  assert.equal(shouldAskForReview({ ...base, round: { correct: 0, n: 0, newBest: false } }), false, 'leere Runde');
});

test('shouldAskForReview: einmal je Version und frühestens nach 60 Tagen', () => {
  assert.equal(REVIEW_PAUSE_MS, 60 * DAY);
  assert.equal(shouldAskForReview({ ...base, askedVersion: '1.15.0', askedAt: NOW - 400 * DAY }), false, 'diese Version schon');
  assert.equal(shouldAskForReview({ ...base, askedVersion: '1.14.0', askedAt: NOW - 59 * DAY }), false, 'vor 59 Tagen');
  assert.equal(shouldAskForReview({ ...base, askedVersion: '1.14.0', askedAt: NOW - 60 * DAY }), true, 'vor 60 Tagen');
});
