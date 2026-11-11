import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RACE_MAX_TASKS, altitudeAt, decodeRaceConfig, encodeRaceConfig, opponentsFromRuns, raceCategories, raceRanking, raceScore, raceTasks,
  replayMs, trackMax, visibleLanes, cleanRaceName, type RaceConfig, type RaceRun,
} from '../src/core/race.ts';
import { mixCategories } from '../src/core/catalog.ts';

const cfg: RaceConfig = { durationS: 60, cat: 'all', lvl: 2 };

test('raceTasks: deterministisch, 150 Stück, Gemischt reihum ohne Drill', () => {
  const a = raceTasks(42, cfg);
  const b = raceTasks(42, cfg);
  assert.equal(a.length, RACE_MAX_TASKS);
  assert.deepEqual(a.map((x) => x.prompt), b.map((x) => x.prompt));
  assert.notDeepEqual(a.map((x) => x.prompt), raceTasks(43, cfg).map((x) => x.prompt));
  const cats = mixCategories(null).map((c) => c.id);
  a.slice(0, cats.length * 2).forEach((x, i) => assert.equal(x.category, cats[i % cats.length]));
  assert.ok(a.every((x) => x.category !== 'table'));
  assert.equal(raceTasks(1, cfg, 5).length, 5);
});

test('raceTasks: nur gewählte Kategorie und Stufe, 1×1 als eigene Kategorie wählbar', () => {
  const t = raceTasks(7, { durationS: 30, cat: 'mult', lvl: 3 }, 40);
  assert.ok(t.every((x) => x.category === 'mult' && x.level === 3));
  const tab = raceTasks(7, { durationS: 30, cat: 'table', lvl: 1 }, 10);
  assert.ok(tab.every((x) => x.category === 'table'));
  assert.ok(raceCategories().includes('table'));
  assert.ok(!raceCategories().includes('custom'));
  for (let i = 1; i < t.length; i++) assert.notEqual(t[i]?.prompt, t[i - 1]?.prompt);
});

test('raceScore: Antworten nach Ablauf zählen nicht', () => {
  const steps = [{ ms: 1000, ok: true }, { ms: 2000, ok: false }, { ms: 30000, ok: true }, { ms: 30001, ok: true }];
  assert.deepEqual(raceScore(steps, 30000), { correct: 2, wrong: 1, lastOkMs: 30000 });
  assert.deepEqual(raceScore([], 1000), { correct: 0, wrong: 0, lastOkMs: 0 });
});

test('raceRanking: richtig, dann weniger falsche, dann früher; echter Gleichstand teilt den Rang', () => {
  const ok = (...ms: number[]) => ms.map((m) => ({ ms: m, ok: true }));
  const runs: RaceRun[] = [
    { name: 'A', steps: [...ok(1000, 2000), { ms: 2500, ok: false }] },
    { name: 'B', steps: ok(1000, 3000) },
    { name: 'C', steps: ok(1000, 2000) },
    { name: 'D', steps: ok(500, 900, 1500) },
    { name: 'E', steps: ok(1000, 2000) },
  ];
  const r = raceRanking(runs, 10000);
  assert.equal(r[0]?.name, 'D');
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 2, 4, 5]);
  // C/E (2 richtig, 0 falsch, 2000) vor B (3000) vor A (1 falsch)
  assert.deepEqual(r.map((x) => x.name), ['D', 'C', 'E', 'B', 'A']);
  assert.equal(r[0]?.index, 3);
});

test('altitudeAt: Grenzen einschließlich', () => {
  const s = [{ ms: 1000, ok: true }, { ms: 2000, ok: false }, { ms: 3000, ok: true }];
  assert.equal(altitudeAt(s, 999), 0);
  assert.equal(altitudeAt(s, 1000), 1);
  assert.equal(altitudeAt(s, 2999), 1);
  assert.equal(altitudeAt(s, 3000), 2);
  assert.equal(altitudeAt(s, 1e9), 2);
});

test('Gegner-Quelle aus Zeitleisten, Skala, sichtbare Bahnen, Zeitraffer', () => {
  const o = opponentsFromRuns([{ name: 'X', steps: [{ ms: 100, ok: true }] }, { name: 'Y', steps: [] }]);
  assert.deepEqual(o.names(), ['X', 'Y']);
  assert.deepEqual(o.altitudes(100), [1, 0]);
  assert.equal(trackMax(0), 12);
  assert.equal(trackMax(10), 12);
  assert.equal(trackMax(11), 18);
  assert.deepEqual(visibleLanes([1, 2, 3], 0), [0, 1, 2]);
  const alts = [5, 0, 9, 6, 20, 4, 5, 7, 8, 1];
  const v = visibleLanes(alts, 0);
  assert.equal(v.length, 8);
  assert.ok(v.includes(0));
  assert.ok(!v.includes(4) && !v.includes(1));
  assert.equal(replayMs(60000), 10000);
  assert.equal(replayMs(30000), 6000);
});

test('Konfiguration: Rundreise und strenge Prüfung', () => {
  assert.equal(encodeRaceConfig(cfg), '60.all.2');
  assert.deepEqual(decodeRaceConfig('90.mult.3'), { durationS: 90, cat: 'mult', lvl: 3 });
  for (const bad of ['45.all.2', '60.all.4', '60.custom.2', '60.nix.2', '60.all', '', null, 5, '60.all.2 ', '060.all.2']) {
    assert.equal(decodeRaceConfig(bad), null, String(bad));
  }
  assert.equal(cleanRaceName('  Anna​   Lena  '), 'Anna Lena');
  assert.equal(cleanRaceName('x'.repeat(40)).length, 16);
});
