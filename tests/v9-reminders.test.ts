// Paket B: Erinnerungen in Runden, abwärtskompatibel (alte Stände ohne Runden-Felder, alte Server-Logik)
process.env.TZ = 'Europe/Berlin';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReminderState } from '../src/core/reminder-state.ts';
import { composeMessage } from '../src/core/reminder-messages.ts';
import { parseState, streakAtRisk } from '../src/core/reminders.ts';
import type { ReminderState } from '../src/core/reminders.ts';
import { dayKey } from '../src/core/progress.ts';

const NOW = new Date(2026, 0, 15, 17, 0).getTime();
const day = (off: number): string => dayKey(new Date(2026, 0, 15 + off, 12).getTime());
const round = (off: number, k = 0): { ts: number } => ({ ts: new Date(2026, 0, 15 + off, 12, k).getTime() });
const base = { reviews: {}, attempts: [] as never[], enabledCategories: null };

const old = (o: Partial<ReminderState> = {}): ReminderState => ({
  day: day(0), todayMin: 0, goalMin: 15, goalDone: false, streak: 0, reviewsDue: 0, nextReviewAt: null, weak: [], at: NOW, ...o,
});

test('buildReminderState mit Runden: alte Felder gefüllt (echte Minuten, Altwert Minutenziel), neue optional dazu', () => {
  const activity = { [day(-1)]: 3 * 60_000, [day(0)]: 6 * 60_000 + 30_000 };
  const s = buildReminderState({
    ...base, activity, goalMin: 15, sessions: [round(-2), round(-1), round(0)], goalRounds: 3,
  }, NOW);
  assert.equal(s.todayMin, 6, 'echte aktive Minuten');
  assert.equal(s.goalMin, 15, 'Altwert dailyGoalMin');
  assert.equal(s.goalDone, false, 'Ziel (3 Runden) noch nicht erreicht');
  assert.equal(s.streak, 3);
  assert.equal(s.todayRounds, 1);
  assert.equal(s.goalRounds, 3);
  assert.equal(s.kept, true);
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s))), s, 'übersteht JSON und Server-Validierung');
  const done = buildReminderState({ ...base, activity, goalMin: 15, sessions: [round(0), round(0, 1), round(0, 2)], goalRounds: 3 }, NOW);
  assert.equal(done.goalDone, true);
});

test('buildReminderState ohne Runden: wie bisher, keine neuen Felder', () => {
  const s = buildReminderState({ ...base, activity: { [day(0)]: 20 * 60_000 }, goalMin: 15 }, NOW);
  assert.equal(s.goalDone, true);
  assert.equal('kept' in s, false);
  assert.equal('goalRounds' in s, false);
});

test('parseState: neue Felder optional, Ungültiges wird verworfen statt abzulehnen', () => {
  const plain = parseState(old());
  assert.ok(plain);
  assert.equal(plain.todayRounds, undefined);
  assert.equal(plain.goalRounds, undefined);
  assert.equal(plain.kept, undefined);

  const full = parseState({ ...old(), todayRounds: 2, goalRounds: 3, kept: true });
  assert.ok(full);
  assert.equal(full.todayRounds, 2);
  assert.equal(full.goalRounds, 3);
  assert.equal(full.kept, true);

  const capped = parseState({ ...old(), todayRounds: 9999, goalRounds: 500 });
  assert.equal(capped?.todayRounds, 100);
  assert.equal(capped?.goalRounds, 100);

  const junk = parseState({ ...old(), todayRounds: 'x', goalRounds: -2, kept: 'yes' });
  assert.ok(junk, 'ungültige Zusatzfelder lehnen den Stand nicht ab');
  assert.equal(junk.todayRounds, undefined);
  assert.equal(junk.goalRounds, undefined);
  assert.equal(junk.kept, undefined);
  assert.equal(parseState({ ...old(), goalRounds: 0 })?.goalRounds, undefined, 'Ziel 0 ist ungültig');
});

test('streakAtRisk: mit `kept` sichert eine Runde die Serie, ohne die alte Ziel-Logik', () => {
  const today = day(0);
  // neu: eine Runde reicht, auch wenn das Ziel noch offen ist
  assert.equal(streakAtRisk(old({ streak: 5, goalDone: false, kept: true }), today), 0);
  assert.equal(streakAtRisk(old({ streak: 5, goalDone: false, kept: false }), today), 5);
  // alt: Ziel entscheidet
  assert.equal(streakAtRisk(old({ streak: 5, goalDone: false }), today), 5);
  assert.equal(streakAtRisk(old({ streak: 5, goalDone: true }), today), 0);
  // gestern gemeldet: Serie nur, wenn gestern gesichert
  assert.equal(streakAtRisk(old({ day: day(-1), streak: 5, goalDone: false, kept: true }), today), 5);
  assert.equal(streakAtRisk(old({ day: day(-1), streak: 5, goalDone: true, kept: false }), today), 0);
  assert.equal(streakAtRisk(old({ day: day(-1), streak: 5, goalDone: true }), today), 5);
  assert.equal(streakAtRisk(null, today), 0);
});

const ctx = (state: ReminderState, lang: 'de' | 'en' = 'de') => ({ lang, state, now: NOW, tz: 'Europe/Berlin' });

test('Nachrichten: mit Runden-Feldern Runden-Texte', () => {
  const s = old({ streak: 12, goalRounds: 3, todayRounds: 0, kept: false });
  const streak = composeMessage('streak', ctx(s));
  assert.match(streak.body, /Eine Runde reicht/);
  assert.doesNotMatch(streak.body, /Minuten/);
  assert.equal(composeMessage('streak', ctx(s, 'en')).body, 'One round is enough – or your streak ends at midnight.');

  const daily = composeMessage('daily', ctx(s));
  assert.match(daily.body, /Eine kurze Runde heute, dann hält deine Serie\./);

  const calm = old({ streak: 1, goalRounds: 3, todayRounds: 1, kept: true });
  assert.equal(composeMessage('daily', ctx(calm)).body, 'Noch 2 Runden bis zu deinem Tagesziel.');
  assert.equal(composeMessage('daily', ctx(old({ goalRounds: 3, todayRounds: 2, kept: true }))).body, 'Noch 1 Runde bis zu deinem Tagesziel.');
  assert.equal(composeMessage('daily', ctx(calm, 'en')).body, '2 more rounds to reach your daily goal.');

  const fresh = composeMessage('daily', ctx(old({ goalRounds: 3, todayRounds: 0, kept: false })));
  assert.doesNotMatch(fresh.body, /Minuten/);
});

test('Nachrichten: ohne Runden-Felder bleiben die Minuten-Texte', () => {
  const s = old({ streak: 12, todayMin: 5 });
  const streak = composeMessage('streak', ctx(s));
  assert.equal(streak.body, 'Trainiere heute noch 10 Minuten, sonst reißt deine Serie um Mitternacht.');
  const daily = composeMessage('daily', ctx(s));
  assert.equal(daily.body, 'Heute 10 Minuten, dann hält deine Serie.');
});
