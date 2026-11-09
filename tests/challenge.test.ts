// Gewertete Challenges: Regeln aus src/core/challenge.ts (Zeit, IDs, Namen, Aufgaben, Wertung)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTEMPT_WINDOW_MS, DAILY_CONFIG, addDays, challengeDay, challengeTaskSet, challengeTasks, compareRank, dailyId,
  dayOfDailyId, dayStart, isChallengeId, isDay, newCompetitionId, newGroupCode, normalizeDisplayName, normalizeGroupCode,
  normalizeGroupName, parseAnswers, parseConfig, parseTitle, percentile, scoreAttempt, stateOf, weekDays, weekStart,
} from '../src/core/challenge.ts';
import { getLang } from '../src/i18n/index.ts';
import { evaluate } from '../src/core/scoring.ts';

test('challengeDay: Tag in Europe/Berlin, nicht in UTC', () => {
  assert.equal(challengeDay(Date.parse('2026-11-08T22:59:59Z')), '2026-11-08');
  assert.equal(challengeDay(Date.parse('2026-11-08T23:00:00Z')), '2026-11-09'); // Winterzeit: UTC+1
  assert.equal(challengeDay(Date.parse('2026-07-01T21:59:59Z')), '2026-07-01');
  assert.equal(challengeDay(Date.parse('2026-07-01T22:00:00Z')), '2026-07-02'); // Sommerzeit: UTC+2
});

test('dayStart: Mitternacht Berlin, auch an Tagen der Zeitumstellung', () => {
  assert.equal(new Date(dayStart('2026-11-08')).toISOString(), '2026-11-07T23:00:00.000Z');
  assert.equal(new Date(dayStart('2026-07-01')).toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(new Date(dayStart('2026-03-29')).toISOString(), '2026-03-28T23:00:00.000Z'); // Umstellung auf Sommerzeit
  assert.equal(new Date(dayStart('2026-03-30')).toISOString(), '2026-03-29T22:00:00.000Z');
  assert.equal(new Date(dayStart('2026-10-25')).toISOString(), '2026-10-24T22:00:00.000Z'); // Umstellung auf Winterzeit
  assert.equal(new Date(dayStart('2026-10-26')).toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(dayStart('2026-03-30') - dayStart('2026-03-29'), 23 * 3600_000);
  assert.throws(() => dayStart('2026-13-01x'));
});

test('Tage und Wochen: addDays, isDay, weekStart (Montag), weekDays', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.ok(isDay('2026-02-28'));
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(isDay('20261108'), false);
  assert.equal(weekStart('2026-11-08'), '2026-11-02'); // Sonntag → Montag davor
  assert.equal(weekStart('2026-11-09'), '2026-11-09'); // Montag
  assert.deepEqual(weekDays('2026-11-02'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
});

test('IDs: Daily, Wettbewerb, Gruppen-Code', () => {
  assert.equal(dailyId('2026-11-08'), 'daily-2026-11-08');
  assert.equal(dayOfDailyId('daily-2026-11-08'), '2026-11-08');
  assert.equal(dayOfDailyId('daily-2026-02-30'), null);
  assert.ok(isChallengeId('comp-prozente-kw47'));
  assert.ok(isChallengeId(newCompetitionId()));
  assert.equal(isChallengeId('comp-'), false);
  assert.equal(isChallengeId('DROP TABLE'), false);
  assert.equal(isChallengeId(42), false);
  const code = newGroupCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(normalizeGroupCode(` ${code.toLowerCase().slice(0, 3)}-${code.slice(3)} `), code);
  assert.equal(normalizeGroupCode('ABC10O'), null); // 0, 1 und O gibt es nicht
  assert.equal(normalizeGroupCode('ABCDE'), null);
});

test('normalizeDisplayName: 3–20 Zeichen, Buchstaben/Ziffern/._-, gesperrte Wörter', () => {
  assert.equal(normalizeDisplayName('  Anna   M. '), 'Anna M.');
  assert.equal(normalizeDisplayName('Jörg_99'), 'Jörg_99');
  assert.equal(normalizeDisplayName('ab'), null);
  assert.equal(normalizeDisplayName('x'.repeat(21)), null);
  assert.equal(normalizeDisplayName('<script>'), null);
  assert.equal(normalizeDisplayName('-anna'), null);
  assert.equal(normalizeDisplayName('Admin'), null);
  assert.equal(normalizeDisplayName('Mental Math'), null);
  assert.equal(normalizeDisplayName(null), null);
  assert.equal(normalizeGroupName('Team Strategy & Ops'), 'Team Strategy & Ops');
  assert.equal(normalizeGroupName('a'), null);
});

test('parseConfig und parseTitle: nur gültige Werte', () => {
  assert.deepEqual(parseConfig({ count: 15, level: 2, categories: null }), { count: 15, level: 2, categories: null });
  assert.deepEqual(parseConfig({ count: 10, level: 3, categories: ['pct', 'mult'] }), { count: 10, level: 3, categories: ['pct', 'mult'] });
  assert.equal(parseConfig({ count: 4, level: 2 }), null);
  assert.equal(parseConfig({ count: 15, level: 4 }), null);
  assert.equal(parseConfig({ count: 15, level: 2, categories: ['nope'] }), null);
  assert.equal(parseConfig({ count: 15, level: 2, categories: ['pct', 'pct'] }), null);
  assert.equal(parseConfig({ count: 15, level: 2, categories: [] }), null);
  assert.deepEqual(parseTitle({ de: ' Prozente ' }), { de: 'Prozente', en: 'Prozente' });
  assert.equal(parseTitle({ de: 'x' }), null);
});

test('challengeTasks: deterministisch, gleiche Zahlen in de und en, Sprache bleibt unverändert', () => {
  const before = getLang();
  const a = challengeTasks('seed-123', DAILY_CONFIG, 'de', 'daily-2026-11-08');
  const b = challengeTasks('seed-123', DAILY_CONFIG, 'de', 'daily-2026-11-08');
  const set = challengeTaskSet('seed-123', DAILY_CONFIG, 'daily-2026-11-08');
  assert.equal(getLang(), before);
  assert.equal(a.length, 15);
  assert.deepEqual(a, b);
  assert.deepEqual(set.de, a);
  assert.equal(set.en.length, set.de.length);
  set.de.forEach((t, i) => {
    const e = set.en[i];
    assert.ok(e);
    assert.equal(e.subtype, t.subtype);
    assert.equal(e.expected, t.expected);
    const nums = (o: Record<string, unknown>): unknown[] => Object.values(o).filter((v) => typeof v === 'number');
    assert.deepEqual(nums(e.params), nums(t.params));
    assert.equal(t.id, `daily-2026-11-08-${i}`);
    assert.equal(t.level, 2);
  });
  assert.notDeepEqual(challengeTasks('other-seed', DAILY_CONFIG, 'de', 'x').map((t) => t.expected), a.map((t) => t.expected));
  const pct = challengeTasks('s', { count: 10, level: 1, categories: ['pct'] }, 'de', 'comp-x');
  assert.equal(pct.length, 10);
  assert.ok(pct.every((t) => t.category === 'pct' && t.level === 1));
});

test('parseAnswers: begrenzt, sortiert, je Aufgabe die erste, ungültige → null', () => {
  assert.deepEqual(parseAnswers([{ i: 1, input: 5, ms: 2000.4 }, { i: 0, input: null, ms: 10 }, { i: 1, input: 9, ms: 1 }], 3),
    [{ i: 0, input: null, ms: 10 }, { i: 1, input: 5, ms: 2000 }]);
  assert.deepEqual(parseAnswers([{ i: 0, input: 1, ms: 10 ** 9 }], 1), [{ i: 0, input: 1, ms: 5 * 60_000 }]);
  assert.equal(parseAnswers([{ i: 3, input: 1, ms: 1 }], 3), null);
  assert.equal(parseAnswers([{ i: 0, input: '1', ms: 1 }], 3), null);
  assert.equal(parseAnswers([{ i: 0, input: 1, ms: -1 }], 3), null);
  assert.equal(parseAnswers('x', 3), null);
  assert.equal(parseAnswers(Array.from({ length: 4 }, (_, i) => ({ i, input: 1, ms: 1 })), 3), null);
});

test('scoreAttempt: wie evaluate() mit Zeit, fehlende = Weiß nicht, schnelle richtige gezählt', () => {
  const tasks = challengeTasks('score', DAILY_CONFIG, 'de', 'x');
  const answers = tasks.slice(0, 5).map((t, i) => ({ i, input: t.expected, ms: i === 0 ? 100 : 4000 }));
  const s = scoreAttempt(tasks, answers);
  assert.equal(s.n, 15);
  assert.equal(s.correct, 5);
  assert.equal(s.fast, 1);
  assert.equal(s.timeMs, 100 + 4 * 4000);
  const expected = tasks.slice(0, 5).reduce((sum, t, i) => sum + evaluate(t, t.expected, i === 0 ? 100 : 4000).points, 0);
  assert.equal(s.points, expected);
  assert.deepEqual(s.marks.slice(0, 6), [true, true, true, true, true, false]);
});

test('compareRank, percentile, stateOf', () => {
  const rows = [
    { points: 900, timeMs: 50_000, finishedAt: 3 },
    { points: 1000, timeMs: 60_000, finishedAt: 2 },
    { points: 1000, timeMs: 40_000, finishedAt: 5 },
    { points: 1000, timeMs: 40_000, finishedAt: 1 },
  ].sort(compareRank);
  assert.deepEqual(rows.map((r) => r.finishedAt), [1, 5, 2, 3]);
  assert.equal(percentile(1, 10), 100);
  assert.equal(percentile(10, 10), 0);
  assert.equal(percentile(1, 1), null);
  const c = { startsAt: 1000, endsAt: 2000 };
  assert.equal(stateOf(c, null, 500), 'upcoming');
  assert.equal(stateOf(c, null, 1500), 'open');
  assert.equal(stateOf(c, null, 2000), 'closed');
  assert.equal(stateOf(c, { status: 'running', startedAt: 1500 }, 1600), 'running');
  assert.equal(stateOf(c, { status: 'running', startedAt: 1500 }, 1500 + ATTEMPT_WINDOW_MS + 1), 'done');
  assert.equal(stateOf(c, { status: 'finished', startedAt: 1500 }, 1600), 'done');
});
