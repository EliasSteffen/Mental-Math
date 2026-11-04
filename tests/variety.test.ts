// Aufgabenvielfalt je Subtyp/Level und Wiederholungssperre im Training
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECENT_WINDOW, SUBTYPES, generate, generateForMode, noRepeat, pickFresh, taskKey } from '../src/core/generators/index.ts';
import { mulberry32, seedFromString } from '../src/core/daily.ts';
import type { Rng } from '../src/core/numbers.ts';
import type { Level, Task } from '../src/types.ts';
import { mkTask } from './helpers.ts';

const LEVELS: readonly Level[] = [1, 2, 3];
/** custom.* hängt vom selbst gewählten Bereich ab */
const IDS = Object.keys(SUBTYPES).filter((id) => SUBTYPES[id]?.category !== 'custom');
/** Mindestzahl verschiedener Aufgaben je Subtyp und Level: größer als das Sperrfenster, damit eine Runde nie wiederholen muss */
const FLOOR = 10;
const DRAWS = 600;

const rngFor = (s: string): Rng => mulberry32(seedFromString(s));
const keyed = (key: string): Task => mkTask({ prompt: key, params: { key } });

/** Wiederholungen in einer Aufgabenfolge: direkt hintereinander bzw. innerhalb der letzten `window` Aufgaben */
function repeats(keys: readonly string[], window = RECENT_WINDOW): { direct: number; inWindow: number } {
  let direct = 0, inWindow = 0;
  keys.forEach((k, i) => {
    if (i > 0 && keys[i - 1] === k) direct++;
    if (keys.slice(Math.max(0, i - window), i).includes(k)) inWindow++;
  });
  return { direct, inWindow };
}

test(`Vielfalt: jeder Subtyp hat je Level mindestens ${FLOOR} verschiedene Aufgaben`, () => {
  const low: string[] = [];
  for (const id of IDS) {
    for (const level of LEVELS) {
      const rng = rngFor(`variety:${id}:${level}`);
      const seen = new Set<string>();
      for (let i = 0; i < DRAWS; i++) seen.add(taskKey(generate(id, rng, { level })));
      if (seen.size < FLOOR) low.push(`${id} L${level}: ${seen.size}`);
    }
  }
  assert.deepEqual(low, [], `zu kleine Aufgabenpools: ${low.join(', ')}`);
});

test('taskKey: Subtyp + Prompt + Parameter; Reihenfolge der Auswahl-Optionen und der Parameter zählt nicht', () => {
  const a = mkTask({ prompt: '12 × 13', params: { a: 12, b: 13 } });
  assert.equal(taskKey(a), taskKey(mkTask({ prompt: '12 × 13', params: { b: 13, a: 12 } })));
  assert.notEqual(taskKey(a), taskKey(mkTask({ prompt: '12 × 13', params: { a: 12, b: 14 } })));
  assert.notEqual(taskKey(a), taskKey(mkTask({ prompt: '12 × 14', params: { a: 12, b: 13 } })));
  assert.notEqual(taskKey(a), taskKey(mkTask({ subtype: 'mult.2x2', prompt: '12 × 13', params: { a: 12, b: 13 } })));
  // Auswahl-Aufgabe: dieselbe Frage mit anders gemischten Optionen ist dieselbe Aufgabe
  const q = { ua: '€/h', o1: '×', ub: 'h/Jahr' };
  assert.equal(
    taskKey(mkTask({ subtype: 'units.result', prompt: 'p', params: { ...q, c0: '€/Jahr', c1: '€', c2: 'h', c3: 'Jahr' } })),
    taskKey(mkTask({ subtype: 'units.result', prompt: 'p', params: { ...q, c0: 'h', c1: '€/Jahr', c2: 'Jahr', c3: '€' } })),
  );
});

test('pickFresh: überspringt gesperrte Aufgaben und lässt das Eingabefenster unverändert', () => {
  const recent = Object.freeze([taskKey(keyed('A')), taskKey(keyed('B'))]);
  const queue = ['A', 'B', 'A', 'C', 'D'];
  let calls = 0;
  const r = pickFresh(() => keyed(queue[calls++] ?? 'Z'), recent);
  assert.equal(r.task.prompt, 'C');
  assert.equal(calls, 4);
  assert.equal(r.key, taskKey(keyed('C')));
  assert.deepEqual(r.recent, [...recent, taskKey(keyed('C'))]);
  assert.deepEqual(recent, [taskKey(keyed('A')), taskKey(keyed('B'))]);
});

test('pickFresh: nach `tries` Versuchen gewinnt der am längsten nicht gestellte Kandidat', () => {
  const recent = ['A', 'B', 'C'].map((k) => taskKey(keyed(k)));
  const queue = ['C', 'B', 'C', 'A'];
  let calls = 0;
  const make = (): Task => keyed(queue[calls++] ?? 'Z');
  // nur 2 Versuche: C (zuletzt) und B (vorletzt) → B
  const r = pickFresh(make, recent, { tries: 2 });
  assert.equal(r.task.prompt, 'B');
  assert.equal(calls, 2);
  assert.deepEqual(r.recent, ['A', 'B', 'C', 'B'].map((k) => taskKey(keyed(k))));
  // mit genug Versuchen kommt A (am ältesten)
  calls = 0;
  assert.equal(pickFresh(make, recent, { tries: 4 }).task.prompt, 'A');
});

test('pickFresh: Fenstergröße begrenzt die Sperre; window 0 schaltet sie ab', () => {
  const old = taskKey(keyed('A'));
  const others = Array.from({ length: RECENT_WINDOW }, (_, i) => taskKey(keyed(`x${i}`)));
  // A liegt genau ein Element vor dem Fenster → wieder erlaubt
  const r = pickFresh(() => keyed('A'), [old, ...others]);
  assert.equal(r.task.prompt, 'A');
  assert.equal(r.recent.length, RECENT_WINDOW);
  assert.equal(r.recent.at(-1), old);
  // innerhalb eines kleineren Fensters gesperrt
  let calls = 0;
  const seq = ['A', 'B'];
  assert.equal(pickFresh(() => keyed(seq[calls++] ?? 'Z'), [old], { window: 1 }).task.prompt, 'B');
  // window 0: keine Sperre, kein Fenster
  const off = pickFresh(() => keyed('A'), [old], { window: 0 });
  assert.equal(off.task.prompt, 'A');
  assert.deepEqual(off.recent, []);
});

test('noRepeat: kleiner Pool → nie zweimal dieselbe Aufgabe hintereinander, alle kommen dran', () => {
  for (const size of [2, 3, 5]) {
    const rng = rngFor(`pool:${size}`);
    const fresh = noRepeat();
    const keys: string[] = [];
    for (let i = 0; i < 60; i++) keys.push(taskKey(fresh.next(() => keyed(`t${Math.floor(rng() * size)}`))));
    assert.equal(repeats(keys).direct, 0, `Pool ${size}`);
    assert.equal(new Set(keys.slice(0, size)).size, size, `Pool ${size}: die ersten ${size} sind verschieden`);
  }
});

test('noRepeat.remember: vorgemerkte Aufgabe (Beispiel vor der Übungsrunde) kommt nicht gleich wieder', () => {
  const fresh = noRepeat();
  fresh.remember(keyed('Beispiel'));
  let calls = 0;
  const seq = ['Beispiel', 'Beispiel', 'Neu'];
  assert.equal(fresh.next(() => keyed(seq[calls++] ?? 'Z')).prompt, 'Neu');
});

test('Training: Runden je Subtyp und Level ohne direkte Wiederholung, kaum Wiederholung im Fenster', () => {
  // je Subtyp/Level 20 Runden à 10 Aufgaben (Standard-Sitzungslänge) mit Sperre
  let tasks = 0, inWindow = 0;
  const bad: string[] = [];
  for (const id of IDS) {
    for (const level of LEVELS) {
      const rng = rngFor(`session:${id}:${level}`);
      for (let s = 0; s < 20; s++) {
        const fresh = noRepeat();
        const keys = Array.from({ length: 10 }, () => taskKey(fresh.next(() => generate(id, rng, { level }))));
        const r = repeats(keys);
        if (r.direct > 0) bad.push(`${id} L${level}`);
        tasks += keys.length;
        inWindow += r.inWindow;
      }
    }
  }
  assert.deepEqual(bad, [], 'direkt wiederholt');
  // Restrisiko nur bei Pools knapp über dem Fenster
  assert.ok(inWindow / tasks < 0.005, `Wiederholungen im Fenster: ${inWindow} von ${tasks}`);
});

test('Training: gemischte Runde (Modus all, Level 1) ohne Wiederholung im Fenster', () => {
  const rng = rngFor('session:all');
  for (let s = 0; s < 200; s++) {
    const fresh = noRepeat();
    const keys = Array.from({ length: 20 }, () => taskKey(fresh.next(() => generateForMode('all', { levelFor: () => 1 }, rng))));
    assert.equal(repeats(keys).inWindow, 0, keys.join('\n'));
  }
});
