// Heute (Ruhiger Fokus): Begrüßung (E11), Median-Zeit und Zeit-Balken (E9), Ziel und Dauer der Empfehlung (E10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METHOD_MS, MIN_TIMED, dateLine, daypart, heroPlan, medianTimeMs, minutesFor, timeGap, typicalTargetMs,
} from '../src/views/home-data.ts';
import { SUBTYPES } from '../src/core/catalog.ts';
import type { Attempt, Recommendation } from '../src/types.ts';

let ts = 0;
function att(subtype: string, timeMs: number, o: Partial<Attempt> = {}): Attempt {
  const s = SUBTYPES[subtype];
  return {
    ts: ++ts, sessionId: 's', mode: subtype, category: s?.category ?? 'mult', subtype, prompt: '', unit: '',
    expected: 1, given: 1, correct: true, errorType: null, timeMs, targetMs: s?.targetMs ?? 10000, weight: 1, points: 10,
    ...o,
  };
}

const rec = (o: Partial<Recommendation>): Recommendation => ({ kind: 'mixed', mode: 'all', subtype: null, title: 'x', reason: 'y', ...o });

test('daypart: vor 11 Morgen, vor 17 Tag, danach Abend (E11)', () => {
  assert.equal(daypart(0), 'morning');
  assert.equal(daypart(10), 'morning');
  assert.equal(daypart(11), 'day');
  assert.equal(daypart(16), 'day');
  assert.equal(daypart(17), 'evening');
  assert.equal(daypart(23), 'evening');
});

test('dateLine: Wochentag, Tag und Monat in der Sprache der App', () => {
  const d = new Date(2026, 9, 31, 20).getTime();
  assert.equal(dateLine(d, 'de-DE'), 'Samstag, 31. Oktober');
  assert.equal(dateLine(d, 'en-US'), 'Saturday, October 31');
});

test('medianTimeMs: Median ab 3 gemessenen Versuchen, ohne untimed und „Weiß nicht“', () => {
  const sub = 'pct.of';
  assert.equal(MIN_TIMED, 3);
  assert.equal(medianTimeMs([], sub), null);
  assert.equal(medianTimeMs([att(sub, 9000), att(sub, 12000)], sub), null);
  assert.equal(medianTimeMs([att(sub, 9000), att(sub, 20000), att(sub, 12000)], sub), 12000);
  // gerade Anzahl: Mittel der beiden mittleren Werte
  assert.equal(medianTimeMs([att(sub, 4000), att(sub, 10000), att(sub, 12000), att(sub, 30000)], sub), 11000);
  // andere Subtypen, untimed, skip und 0 ms zählen nicht
  const noise = [att('mult.2x1', 1000), att(sub, 1000, { untimed: true }), att(sub, 500, { errorType: 'skip', correct: false }), att(sub, 0)];
  assert.equal(medianTimeMs([...noise, att(sub, 9000), att(sub, 15000)], sub), null);
  assert.equal(medianTimeMs([...noise, att(sub, 9000), att(sub, 15000), att(sub, 14000)], sub), 14000);
  // falsche Antworten sind echte Lösezeit
  assert.equal(medianTimeMs([att(sub, 9000), att(sub, 15000, { correct: false, errorType: 'falsch' }), att(sub, 14000)], sub), 14000);
});

test('medianTimeMs: nur die letzten 25 Versuche', () => {
  const sub = 'mult.2x1';
  const old = Array.from({ length: 30 }, () => att(sub, 60000));
  const recent = Array.from({ length: 25 }, () => att(sub, 5000));
  assert.equal(medianTimeMs([...old, ...recent], sub), 5000);
});

test('timeGap (E9): nur mit Subtyp, ≥ 3 Versuchen und Median über der Zielzeit', () => {
  const sub = 'pct.of';
  const target = SUBTYPES[sub]?.targetMs ?? 0;
  const slow = [att(sub, target + 6000), att(sub, target + 4000), att(sub, target + 8000)];
  assert.deepEqual(timeGap(slow, sub), { targetMs: target, medianMs: target + 6000 });
  assert.equal(timeGap(slow, null), null);
  assert.equal(timeGap(slow, 'gibt.es.nicht'), null);
  assert.equal(timeGap(slow.slice(0, 2), sub), null);
  // schneller als das Ziel → kein „Hier verlierst du am meisten Zeit“
  assert.equal(timeGap([att(sub, target - 1000), att(sub, target - 2000), att(sub, target)], sub), null);
});

test('minutesFor: gerundet, mindestens 1', () => {
  assert.equal(minutesFor(0), 1);
  assert.equal(minutesFor(29_000), 1);
  assert.equal(minutesFor(89_000), 1);
  assert.equal(minutesFor(91_000), 2);
  assert.equal(minutesFor(4 * 60_000 + 10_000), 4);
  assert.equal(minutesFor(Number.NaN), 1);
});

test('typicalTargetMs: Subtyp, Kategorie oder gleich verteilt über aktive Kategorien', () => {
  assert.equal(typicalTargetMs('pct.of'), SUBTYPES['pct.of']?.targetMs);
  const pct = Object.values(SUBTYPES).filter((s) => s.category === 'pct').map((s) => s.targetMs);
  assert.equal(typicalTargetMs('pct'), pct.reduce((a, b) => a + b, 0) / pct.length);
  // nur eine aktive Kategorie: 'all' entspricht ihrem Mittel
  assert.equal(typicalTargetMs('all', ['pct']), typicalTargetMs('pct'));
  assert.ok(typicalTargetMs('all') > 0);
});

test('heroPlan (E10): Ziel und Dauer wie die Empfehlung', () => {
  // Subtyp → Methode + 5 Aufgaben
  const sub = 'pct.of';
  const target = SUBTYPES[sub]?.targetMs ?? 0;
  assert.deepEqual(heroPlan(rec({ kind: 'weak', mode: sub, subtype: sub }), { sessionLength: 10 }), {
    href: `#/train/${sub}?n=5&intro=1`, kind: 'method', tasks: 5, minutes: minutesFor(METHOD_MS + 5 * target),
  });
  assert.equal(heroPlan(rec({ kind: 'new', mode: sub, subtype: sub }), { sessionLength: 10 }).href, `#/train/${sub}?n=5&intro=1`);
  // Review → #/train/review, sessionLength × Zielzeit der fälligen Subtypen
  const review = heroPlan(rec({ kind: 'review', mode: 'review' }), { sessionLength: 20, reviewSubtypes: [sub] });
  assert.deepEqual(review, { href: '#/train/review', kind: 'review', tasks: 20, minutes: minutesFor(20 * target) });
  // Fällige Subtypen deaktivierter Kategorien zählen nicht
  const filtered = heroPlan(rec({ kind: 'review', mode: 'review' }), { sessionLength: 20, reviewSubtypes: [sub], enabledCategories: ['mult'] });
  assert.equal(filtered.minutes, minutesFor(20 * typicalTargetMs('all', ['mult'])));
  // Gemischt → #/train/all
  const mixed = heroPlan(rec({}), { sessionLength: 10 });
  assert.equal(mixed.href, '#/train/all');
  assert.equal(mixed.kind, 'round');
  assert.equal(mixed.tasks, 10);
  assert.equal(mixed.minutes, minutesFor(10 * typicalTargetMs('all')));
  // Unbekannter Subtyp fällt auf den Modus zurück; ungültige Rundenlänge → 10
  assert.equal(heroPlan(rec({ kind: 'weak', mode: 'all', subtype: 'weg' }), { sessionLength: 0 }).tasks, 10);
});
