// src/core/race-api.ts (v12 R2): Konfiguration, Abgabe-Form, Wertung und Plausibilität
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_FINISH_SLACK_MS, RACE_MIN_TASK_MS, isRaceId, judgeRaceRun, newRaceId, newRaceSeedFrom, parseRaceAnswers, parseRaceConfig,
  stepsOfRow, timeLeft, type RaceAnswerIn,
} from '../src/core/race-api.ts';
import { RACE_GRACE_MS, raceTasks, type RaceConfig } from '../src/core/race.ts';

const cfg: RaceConfig = { durationS: 30, cat: 'mult', lvl: 2 };
const SEED = 12345;
const tasks = raceTasks(SEED, cfg, 20);

/** Antworten aus den Aufgaben des Seeds: `right[i]` false → falsche Eingabe, null → „Weiter“; jede nach `gap` ms. */
function answers(right: Array<boolean | null>, gap = 1000, start = 1000): RaceAnswerIn[] {
  return right.map((r, i) => {
    const task = tasks[i];
    assert.ok(task);
    return { i, input: r === null ? null : r ? task.expected : task.expected + 7, ms: start + i * gap };
  });
}
const judge = (a: readonly RaceAnswerIn[], elapsedMs = Infinity) => judgeRaceRun({ seed: SEED, config: cfg, answers: a, elapsedMs });

test('parseRaceConfig: streng', () => {
  assert.deepEqual(parseRaceConfig({ durationS: 60, cat: 'all', lvl: 2 }), { durationS: 60, cat: 'all', lvl: 2 });
  assert.deepEqual(parseRaceConfig({ durationS: 30, cat: 'table', lvl: 1, extra: 1 }), { durationS: 30, cat: 'table', lvl: 1 });
  for (const bad of [null, [], 'x', {}, { durationS: 45, cat: 'all', lvl: 2 }, { durationS: 60, cat: 'nope', lvl: 2 }, { durationS: 60, cat: 'all', lvl: 4 },
    { durationS: '60', cat: 'all', lvl: 2 }, { durationS: 60, cat: 'custom', lvl: 2 }, { durationS: 60, cat: 'all.1', lvl: 2 }]) {
    assert.equal(parseRaceConfig(bad), null, JSON.stringify(bad));
  }
});

test('Kennungen und Seed', () => {
  const id = newRaceId();
  assert.ok(isRaceId(id), id);
  assert.ok(!isRaceId('create') && !isRaceId('ABCDEFGHIJKL') && !isRaceId(5));
  const seed = newRaceSeedFrom(() => 0.5);
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32);
});

test('parseRaceAnswers: Form, Grenzen', () => {
  assert.deepEqual(parseRaceAnswers([{ i: 0, input: 5, ms: 1200.4 }, { i: 1, input: null, ms: 2000 }]), [{ i: 0, input: 5, ms: 1200 }, { i: 1, input: null, ms: 2000 }]);
  assert.deepEqual(parseRaceAnswers([]), []);
  for (const bad of [null, {}, [null], [{ i: 0, input: '5', ms: 1 }], [{ i: -1, input: 1, ms: 1 }], [{ i: 0.5, input: 1, ms: 1 }], [{ i: 150, input: 1, ms: 1 }],
    [{ i: 0, input: 1, ms: -1 }], [{ i: 0, input: Infinity, ms: 1 }], [{ i: 0, input: 1, ms: NaN }], [{ i: 0, input: 1e16, ms: 1 }],
    Array.from({ length: 151 }, (_, i) => ({ i: i % 150, input: 1, ms: i }))]) {
    assert.equal(parseRaceAnswers(bad), null, JSON.stringify(bad).slice(0, 60));
  }
});

test('judgeRaceRun: richtig, falsch, Weiter – Wertung aus dem Seed', () => {
  const v = judge(answers([true, true, false, null, true]));
  assert.equal(v.status, 'finished');
  assert.equal(v.correct, 3);
  assert.equal(v.wrong, 2);
  assert.equal(v.lastOkMs, 5000);
  assert.deepEqual(v.steps, [[1000, 1], [2000, 1], [3000, 0], [4000, 0], [5000, 1]]);
  assert.deepEqual(stepsOfRow(v.steps).slice(0, 2), [{ ms: 1000, ok: true }, { ms: 2000, ok: true }]);
  const none = judge([]);
  assert.deepEqual([none.status, none.correct, none.wrong, none.lastOkMs], ['finished', 0, 0, 0]);
});

test('judgeRaceRun: Antworten nach Dauer und Kulanz werden verworfen, bis Dauer zählt', () => {
  const dur = cfg.durationS * 1000;
  const a: RaceAnswerIn[] = [
    { i: 0, input: tasks[0]?.expected ?? 0, ms: dur - 500 }, // zählt
    { i: 1, input: tasks[1]?.expected ?? 0, ms: dur + 1500 }, // in der Kulanz: nicht gewertet, kein Flag
    { i: 2, input: tasks[2]?.expected ?? 0, ms: dur + RACE_GRACE_MS + 1 }, // verworfen
  ];
  const v = judge(a);
  assert.equal(v.status, 'finished');
  assert.equal(v.correct, 1);
  assert.equal(v.wrong, 0);
  assert.deepEqual(v.steps, [[dur - 500, 1]]);
});

test('judgeRaceRun: Flagging', () => {
  // zu schnell: richtige Antwort in unter 250 ms nach der vorigen
  assert.equal(judge(answers([true, true], RACE_MIN_TASK_MS - 1, 1000)).status, 'flagged');
  assert.equal(judge(answers([true, true], RACE_MIN_TASK_MS, 1000)).status, 'finished');
  // erste richtige sofort
  assert.equal(judge(answers([true], 1000, 100)).status, 'flagged');
  // schnelles „Weiter“ ist kein Betrug
  assert.equal(judge(answers([null, null, null], 50, 1000)).status, 'finished');
  // nicht aufsteigend
  const a = answers([true, true, true]);
  assert.equal(judge([a[0] as RaceAnswerIn, { ...(a[1] as RaceAnswerIn), ms: 500 }]).status, 'flagged');
  // Aufgaben nicht der Reihe nach / doppelt / Lücke
  assert.equal(judge([{ ...(a[1] as RaceAnswerIn) }, { ...(a[0] as RaceAnswerIn), ms: 3000 }]).status, 'flagged');
  assert.equal(judge([a[0] as RaceAnswerIn, a[0] as RaceAnswerIn]).status, 'flagged');
  assert.equal(judge([a[0] as RaceAnswerIn, a[2] as RaceAnswerIn]).status, 'flagged');
  // später datiert als überhaupt Zeit verging (Kulanz 3 s)
  assert.equal(judge(answers([true, true], 1000, 10_000), 11_000 - RACE_GRACE_MS).status, 'finished');
  assert.equal(judge(answers([true, true], 1000, 10_000), 11_000 - RACE_GRACE_MS - 1).status, 'flagged');
});

test('judgeRaceRun: zu spät abgegeben → expired ohne Wertung', () => {
  const a = answers([true, true]);
  const edge = cfg.durationS * 1000 + RACE_GRACE_MS + RACE_FINISH_SLACK_MS;
  assert.equal(judge(a, edge).status, 'finished');
  const late = judge(a, edge + 1);
  assert.deepEqual([late.status, late.correct, late.wrong, late.steps.length], ['expired', 0, 0, 0]);
});

test('timeLeft: Einheiten', () => {
  assert.deepEqual(timeLeft(20 * 3_600_000, 0), { n: 20, unit: 'h' });
  assert.deepEqual(timeLeft(3 * 86_400_000, 0), { n: 3, unit: 'd' });
  assert.deepEqual(timeLeft(90 * 60_000 - 1, 0), { n: 1, unit: 'h' });
  assert.deepEqual(timeLeft(10 * 60_000, 0), { n: 10, unit: 'min' });
  assert.deepEqual(timeLeft(0, 5), { n: 1, unit: 'min' });
});
