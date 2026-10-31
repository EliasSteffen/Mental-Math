import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REMINDER_PREFS, MIN_GAP_MS, RECENT_ACTIVITY_MS, decide, formatTime, goalDoneToday, localDay, localToUtc, replan,
  nextAt, nextLocalTime, normalizeTimeZone, parsePrefs, parseSchedule, parseState, parseTime, planAll, planKind,
  reviewsDueAt, shiftDay, streakAtRisk,
} from '../src/core/reminders.ts';
import type { ReminderPrefs, ReminderSchedule, ReminderState } from '../src/core/reminders.ts';

const BER = 'Europe/Berlin';
const iso = (t: number | null): string | null => (t === null ? null : new Date(t).toISOString());
const at = (s: string): number => Date.parse(s);

const state = (o: Partial<ReminderState> = {}): ReminderState => ({
  day: '2026-01-15', todayMin: 0, goalMin: 15, goalDone: false, streak: 0, reviewsDue: 0, nextReviewAt: null,
  weak: [], at: at('2026-01-15T06:00:00Z'), ...o,
});
const prefs = (o: Partial<ReminderPrefs> = {}): ReminderPrefs => ({ ...DEFAULT_REMINDER_PREFS, ...o });
const sched = (o: Partial<ReminderSchedule> = {}): ReminderSchedule => ({ daily: null, streak: null, review: null, tip: null, ...o });

test('parsePrefs: Standardwerte, Typen und Grenzen', () => {
  assert.deepEqual(parsePrefs({}), DEFAULT_REMINDER_PREFS);
  assert.deepEqual(parsePrefs({ daily: false, dailyAt: 0, days: 0 }), { ...DEFAULT_REMINDER_PREFS, daily: false, dailyAt: 0, days: 0 });
  assert.equal(parsePrefs({ dailyAt: 1439 })?.dailyAt, 1439);
  for (const bad of [null, [], 'x', { daily: 'yes' }, { dailyAt: 1440 }, { dailyAt: -1 }, { dailyAt: 7.5 }, { days: 128 }, { tip: 1 }]) {
    assert.equal(parsePrefs(bad), null, JSON.stringify(bad));
  }
});

test('parseState: gültig, Kappung, schwache Typen gefiltert', () => {
  const s = parseState({ ...state({ weak: ['pct.of', '<script>', 'mult.2x2', 'div.x', 'growth.cagr'] }), todayMin: 99999 });
  assert.ok(s);
  assert.deepEqual(s.weak, ['pct.of', 'mult.2x2', 'div.x']);
  assert.equal(s.todayMin, 1440);
  for (const bad of [null, { ...state(), day: '15.01.2026' }, { ...state(), goalDone: 'no' }, { ...state(), streak: -1 },
    { ...state(), nextReviewAt: 'soon' }, { ...state(), weak: 'pct.of' }, { ...state(), at: undefined }]) {
    assert.equal(parseState(bad), null, JSON.stringify(bad));
  }
});

test('normalizeTimeZone: gültig, kanonisch, Fallback UTC', () => {
  assert.equal(normalizeTimeZone(BER), BER);
  assert.equal(normalizeTimeZone('Nope/Zone'), 'UTC');
  assert.equal(normalizeTimeZone(''), 'UTC');
  assert.equal(normalizeTimeZone(42), 'UTC');
  assert.equal(normalizeTimeZone('x'.repeat(65)), 'UTC');
});

test('nextLocalTime: Zeitzone, Wochentage, strikt nach now', () => {
  // Do 15.01.2026, 11:00 in Berlin (UTC+1)
  const now = at('2026-01-15T10:00:00Z');
  assert.equal(iso(nextLocalTime(now, BER, 18 * 60)), '2026-01-15T17:00:00.000Z');
  assert.equal(iso(nextLocalTime(now, BER, 9 * 60)), '2026-01-16T08:00:00.000Z', 'heute schon vorbei → morgen');
  assert.equal(iso(nextLocalTime(at('2026-01-15T17:00:00Z'), BER, 18 * 60)), '2026-01-16T17:00:00.000Z', 'genau jetzt → morgen');
  assert.equal(iso(nextLocalTime(now, BER, 18 * 60, 1 << 0)), '2026-01-19T17:00:00.000Z', 'nur montags');
  assert.equal(iso(nextLocalTime(now, BER, 18 * 60, 1 << 3)), '2026-01-15T17:00:00.000Z', 'donnerstags = heute');
  assert.equal(nextLocalTime(now, BER, 18 * 60, 0), null);
  assert.equal(iso(nextLocalTime(now, 'America/New_York', 18 * 60)), '2026-01-15T23:00:00.000Z');
  assert.equal(iso(nextLocalTime(now, 'UTC', 18 * 60)), '2026-01-15T18:00:00.000Z');
});

test('nextLocalTime: Sommerzeit (Lücke und Wiederholung)', () => {
  // 29.03.2026: 02:00 → 03:00 in Berlin
  assert.equal(iso(nextLocalTime(at('2026-03-28T20:00:00Z'), BER, 18 * 60)), '2026-03-29T16:00:00.000Z', '18:00 MESZ');
  assert.equal(iso(nextLocalTime(at('2026-03-28T12:00:00Z'), BER, 18 * 60)), '2026-03-28T17:00:00.000Z', '18:00 MEZ');
  assert.equal(iso(nextLocalTime(at('2026-03-28T20:00:00Z'), BER, 150)), '2026-03-29T01:30:00.000Z', '02:30 fehlt → 03:30');
  // 25.10.2026: 03:00 → 02:00
  assert.equal(iso(nextLocalTime(at('2026-10-24T20:00:00Z'), BER, 18 * 60)), '2026-10-25T17:00:00.000Z');
  assert.equal(iso(localToUtc(2026, 7, 1, 0, BER)), '2026-06-30T22:00:00.000Z');
});

test('localDay / shiftDay', () => {
  assert.equal(localDay(at('2026-01-15T23:30:00Z'), BER), '2026-01-16');
  assert.equal(localDay(at('2026-01-15T23:30:00Z'), 'UTC'), '2026-01-15');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('Lernstand: Ziel heute, Serie in Gefahr, fällige Wiederholungen', () => {
  const today = '2026-01-15';
  assert.equal(goalDoneToday(state({ goalDone: true }), today), true);
  assert.equal(goalDoneToday(state({ day: '2026-01-14', goalDone: true }), today), false);
  assert.equal(goalDoneToday(null, today), false);

  assert.equal(streakAtRisk(state({ streak: 4 }), today), 4, 'heute offen, Serie bis gestern');
  assert.equal(streakAtRisk(state({ streak: 5, goalDone: true }), today), 0, 'heute schon gesichert');
  assert.equal(streakAtRisk(state({ day: '2026-01-14', goalDone: true, streak: 5 }), today), 5, 'letzte Meldung gestern, Ziel erreicht');
  assert.equal(streakAtRisk(state({ day: '2026-01-14', goalDone: false, streak: 5 }), today), 0, 'gestern verpasst → Serie weg');
  assert.equal(streakAtRisk(state({ day: '2026-01-12', goalDone: true, streak: 5 }), today), 0);

  const now = at('2026-01-15T12:00:00Z');
  assert.equal(reviewsDueAt(state({ nextReviewAt: now - 1, reviewsDue: 3 }), now), 3);
  assert.equal(reviewsDueAt(state({ nextReviewAt: now - 1, reviewsDue: 0 }), now), 1, 'seit der Meldung fällig geworden');
  assert.equal(reviewsDueAt(state({ nextReviewAt: now + 1, reviewsDue: 0 }), now), 0);
  assert.equal(reviewsDueAt(state(), now), 0);
});

test('planAll: täglich, Serie 20 Uhr, Tipp sonntags 10 Uhr, Wiederholung im Tagesfenster', () => {
  const from = at('2026-01-15T10:00:00Z'); // Do 11:00 Berlin
  const p = prefs({ review: true });
  const s = planAll({ prefs: p, state: state({ nextReviewAt: at('2026-01-15T05:00:00Z') }), tz: BER, from });
  assert.equal(iso(s.daily), '2026-01-15T17:00:00.000Z');
  assert.equal(iso(s.streak), '2026-01-15T19:00:00.000Z');
  assert.equal(iso(s.tip), '2026-01-18T09:00:00.000Z', 'Sonntag 18.01., 10:00');
  assert.equal(iso(s.review), iso(from), 'schon fällig, im Fenster → sofort');
  assert.equal(iso(nextAt(s)), iso(from));

  const off = planAll({ prefs: prefs({ daily: false, streak: false, tip: false }), state: null, tz: BER, from });
  assert.deepEqual(off, sched());
  assert.equal(nextAt(off), null);
});

test('planKind review: frühestens 9 Uhr, nicht nach 20 Uhr, höchstens einmal pro Tag', () => {
  const p = prefs({ review: true });
  const early = state({ nextReviewAt: at('2026-01-15T04:00:00Z') }); // 05:00 lokal
  assert.equal(iso(planKind('review', { prefs: p, state: early, tz: BER, from: at('2026-01-15T04:30:00Z') })), '2026-01-15T08:00:00.000Z');
  assert.equal(iso(planKind('review', { prefs: p, state: early, tz: BER, from: at('2026-01-15T20:00:00Z') })), '2026-01-16T08:00:00.000Z', '21 Uhr → morgen 9 Uhr');
  assert.equal(iso(planKind('review', {
    prefs: p, state: early, tz: BER, from: at('2026-01-15T10:00:00Z'), lastReviewSent: at('2026-01-15T08:00:00Z'),
  })), '2026-01-16T08:00:00.000Z', 'heute schon gesendet');
  const later = state({ nextReviewAt: at('2026-01-17T13:15:00Z') });
  assert.equal(iso(planKind('review', { prefs: p, state: later, tz: BER, from: at('2026-01-15T10:00:00Z') })), '2026-01-17T13:15:00.000Z');
  assert.equal(planKind('review', { prefs: p, state: state(), tz: BER, from: at('2026-01-15T10:00:00Z') }), null, 'nichts fällig');
  assert.equal(planKind('review', { prefs: prefs(), state: early, tz: BER, from: at('2026-01-15T10:00:00Z') }), null, 'aus');
});

test('decide: tägliche Erinnerung, entfällt bei erreichtem Ziel', () => {
  const now = at('2026-01-15T17:00:30Z');
  const base = { now, tz: BER, prefs: prefs(), sched: sched({ daily: at('2026-01-15T17:00:00Z') }), lastSentAt: null };
  assert.deepEqual(decide({ ...base, state: state() }), { kind: 'daily', due: ['daily'] });
  assert.deepEqual(decide({ ...base, state: null }), { kind: 'daily', due: ['daily'] }, 'ohne Lernstand trotzdem');
  assert.deepEqual(decide({ ...base, state: state({ goalDone: true }) }), { kind: null, due: ['daily'] });
  assert.equal(decide({ ...base, prefs: prefs({ onlyIfOpen: false }), state: state({ goalDone: true }) }).kind, 'daily');
  assert.equal(decide({ ...base, state: state({ day: '2026-01-14', goalDone: true }) }).kind, 'daily', 'Ziel gestern zählt nicht');
  assert.equal(decide({ ...base, lastSentAt: now - 60_000, state: state() }).kind, 'daily', 'Abstand gilt nicht für die tägliche');
});

test('decide: nicht fällig, veraltet, gerade aktiv', () => {
  const now = at('2026-01-15T17:00:30Z');
  const base = { now, tz: BER, prefs: prefs(), lastSentAt: null, state: state() };
  assert.deepEqual(decide({ ...base, sched: sched({ daily: now + 1000 }) }), { kind: null, due: [] });
  assert.deepEqual(decide({ ...base, sched: sched({ daily: now - 3 * 3_600_000 }) }), { kind: null, due: ['daily'] }, 'veraltet');
  assert.equal(decide({ ...base, sched: sched({ daily: now - 1000 }), state: state({ at: now - RECENT_ACTIVITY_MS + 1000 }) }).kind, null);
  assert.equal(decide({ ...base, sched: sched({ daily: now - 1000 }), state: state({ at: now - RECENT_ACTIVITY_MS - 1000 }) }).kind, 'daily');
});

test('decide: Serie retten nur bei Gefahr; Mindestabstand; Priorität', () => {
  const now = at('2026-01-15T19:00:30Z');
  const base = { now, tz: BER, prefs: prefs(), sched: sched({ streak: at('2026-01-15T19:00:00Z') }), lastSentAt: null };
  assert.equal(decide({ ...base, state: state({ streak: 3 }) }).kind, 'streak');
  assert.equal(decide({ ...base, state: state({ streak: 0 }) }).kind, null);
  assert.equal(decide({ ...base, state: state({ streak: 3, goalDone: true }) }).kind, null);
  assert.equal(decide({ ...base, state: state({ streak: 3 }), lastSentAt: now - MIN_GAP_MS + 1000 }).kind, null, 'zu kurz nach der letzten');
  assert.equal(decide({ ...base, state: state({ streak: 3 }), lastSentAt: now - MIN_GAP_MS }).kind, 'streak');

  // täglich und Serie gleichzeitig fällig → eine Benachrichtigung (täglich), beide gelten als erledigt
  const both = decide({ ...base, prefs: prefs({ dailyAt: 20 * 60 }), state: state({ streak: 3 }),
    sched: sched({ daily: at('2026-01-15T19:00:00Z'), streak: at('2026-01-15T19:00:00Z') }) });
  assert.deepEqual(both, { kind: 'daily', due: ['daily', 'streak'] });
});

test('decide: Wiederholung und Tipp', () => {
  const now = at('2026-01-18T09:00:30Z'); // So 10:00 Berlin
  const base = { now, tz: BER, prefs: prefs({ review: true }), lastSentAt: null };
  assert.equal(decide({ ...base, state: state({ nextReviewAt: now - 1 }), sched: sched({ review: now - 1 }) }).kind, 'review');
  assert.equal(decide({ ...base, state: state({ nextReviewAt: now + 1 }), sched: sched({ review: now - 1 }) }).kind, null, 'inzwischen wiederholt');
  assert.equal(decide({ ...base, state: null, sched: sched({ tip: now - 1 }) }).kind, 'tip');
  assert.equal(decide({ ...base, prefs: prefs({ tip: false }), state: null, sched: sched({ tip: now - 1 }) }).kind, null);
});

test('replan: fällige Arten neu, andere bleiben; Wiederholung wartet Abstand und Nutzung ab', () => {
  const now = at('2026-01-15T17:00:30Z'); // Do 18:00 Berlin
  const p = prefs({ review: true });
  const st = state({ nextReviewAt: at('2026-01-15T05:00:00Z'), at: at('2026-01-15T06:00:00Z') });
  const base = { now, tz: BER, prefs: p, state: st, lastSentAt: null, lastReviewSent: null };
  const s0 = sched({ daily: at('2026-01-15T17:00:00Z'), streak: at('2026-01-15T19:00:00Z'), tip: at('2026-01-18T09:00:00Z') });

  const r = replan({ ...base, sched: s0, kinds: ['daily'] });
  assert.equal(iso(r.daily), '2026-01-16T17:00:00.000Z', 'morgen');
  assert.equal(r.streak, s0.streak, 'unverändert');
  assert.equal(r.tip, s0.tip);
  assert.equal(r.review, null, 'nicht aufgeführt → unverändert');
  assert.equal(iso(replan({ ...base, sched: s0, kinds: ['review'] }).review), iso(now), 'aufgeführt → neu geplant (sofort fällig)');
  // überfällig, aber nicht aufgeführt: bleibt für den Takt stehen
  const overdue = replan({ ...base, sched: { ...s0, daily: now - 20_000 }, kinds: ['review'] });
  assert.equal(overdue.daily, now - 20_000);

  // gerade gesendet → Wiederholung frühestens nach dem Mindestabstand
  const after = replan({ ...base, sched: s0, kinds: ['review'], lastSentAt: now });
  assert.equal(iso(after.review), iso(now + MIN_GAP_MS));
  // gerade aktiv → nach der Nutzung
  const active = replan({ ...base, state: { ...st, at: now - 60_000 }, sched: s0, kinds: ['review'] });
  assert.equal(iso(active.review), iso(now - 60_000 + RECENT_ACTIVITY_MS));
  // Wiederholung heute schon gesendet → morgen 9 Uhr
  const sent = replan({ ...base, sched: s0, kinds: ['review'], lastSentAt: now, lastReviewSent: now });
  assert.equal(iso(sent.review), '2026-01-16T08:00:00.000Z');
  // abgeschaltete Art → null
  assert.equal(replan({ ...base, prefs: prefs({ streak: false }), sched: s0, kinds: ['streak'] }).streak, null);
});

test('parseSchedule / formatTime / parseTime', () => {
  assert.deepEqual(parseSchedule({ daily: 5, streak: 'x', tip: Infinity }), sched({ daily: 5 }));
  assert.deepEqual(parseSchedule(null), sched());
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(18 * 60 + 5), '18:05');
  assert.equal(parseTime('7:30'), 450);
  assert.equal(parseTime('18:05'), 1085);
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('12:60'), null);
  assert.equal(parseTime('abc'), null);
});
