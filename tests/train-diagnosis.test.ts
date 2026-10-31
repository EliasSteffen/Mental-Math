import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { answerText, diagnose, givenAnswerText, roundInsight, zeroShift } from '../src/views/train/diagnosis.ts';
import { evaluate } from '../src/core/scoring.ts';
import { setLang } from '../src/i18n/index.ts';
import { mkTask } from './helpers.ts';
import type { ChoiceTask, ErrorType, NumberTask } from '../src/types.ts';

afterEach(() => setLang('de'));

const task = (o: Partial<NumberTask> = {}): NumberTask => mkTask({ expected: 45, targetMs: 20000, ...o });
const run = (tk: NumberTask | ChoiceTask, given: number | null, timeMs = 12400, extra: { timedOut?: boolean; showPoints?: boolean; why?: string } = {}) =>
  diagnose({ task: tk, given, ev: evaluate(tk, given, timeMs), timeMs, ...extra });

test('diagnose: richtig mit Zeit und Ziel, Punkte nur bei präziser Anzeige', () => {
  const tk = task();
  assert.deepEqual(run(tk, 45), { kind: 'good', title: 'Richtig', detail: '12,4 s · Ziel 20 s' });
  const p = run(tk, 45, 12400, { showPoints: true });
  assert.equal(p.detail, `12,4 s · Ziel 20 s · +${evaluate(tk, 45, 12400).points} Pkt`);
});

test('diagnose: Nullen-Fehler nach Richtung (Faktor 10 / 0,1 / sonst)', () => {
  const tk = task();
  assert.deepEqual(run(tk, 450), { kind: 'bad', title: 'Eine Null zu viel', detail: '450 statt 45 · Nullen getrennt zählen' });
  assert.equal(run(tk, 4.5).title, 'Eine Null zu wenig');
  assert.equal(run(tk, 4500).title, 'Nullen verrutscht');
  assert.equal(run(tk, 0.45).title, 'Nullen verrutscht');
});

test('diagnose: Nullen-Fehler mit Einheit (volle Zahl statt „Mio. €“)', () => {
  const tk = task({ expected: 3, unit: 'Mio. €' });
  // 30.000.000 → 30 Mio. € statt 3 Mio. €
  const d = run(tk, 30_000_000);
  assert.equal(d.title, 'Eine Null zu viel');
  assert.equal(d.detail, '30 Mio. € statt 3 Mio. € · Nullen getrennt zählen');
  assert.deepEqual(zeroShift(tk, 0.3), { k: -1, value: 0.3 });
});

test('diagnose: Antwort als volle Zahl wird in der Einheit der Aufgabe angezeigt', () => {
  const tk = task({ expected: 3, unit: 'Mio. €' });
  // 5.000.000 wird als 5 Mio. € gewertet – nicht „5.000.000 Mio. €“
  const d = run(tk, 5_000_000);
  assert.equal(d.title, 'Nicht ganz. Richtig ist 3 Mio. €');
  assert.equal(d.detail, 'Deine Antwort: 5 Mio. €');
  assert.equal(run(task({ expected: 3, unit: 'Mio. €' }), 3_200_000).detail, 'Deine Antwort: 3,2 Mio. €');
  // Eingabe schon in der Einheit bleibt unverändert
  assert.equal(run(tk, 5).detail, 'Deine Antwort: 5 Mio. €');
  assert.equal(givenAnswerText(tk, 5_000_000), '5 Mio. €');
  // Prozent als Anteil (0,3 → 30 %), Tausender mit englischer Einheit
  assert.equal(givenAnswerText(task({ expected: 25, unit: '%' }), 0.3), '30 %');
  assert.equal(givenAnswerText(task({ expected: 12, unit: 'K' }), 15_000), '15 K');
  // ohne Einheit bleibt die Zahl, wie sie ist
  assert.equal(givenAnswerText(task(), 60), '60');
});

test('diagnose: knapp, falsch, übersprungen', () => {
  const tk = task();
  assert.deepEqual(run(tk, 46), { kind: 'bad', title: 'Fast. Richtig ist 45', detail: 'Deine Antwort: 46' });
  assert.deepEqual(run(tk, 60), { kind: 'bad', title: 'Nicht ganz. Richtig ist 45', detail: 'Deine Antwort: 60' });
  assert.deepEqual(run(tk, null), { kind: 'skip', title: 'Kein Problem', detail: 'So kommst du auf 45' });
  assert.equal(run(task({ expected: 1200, unit: 'Jahre' }), 1100).title, 'Fast. Richtig ist 1.200 Jahre');
});

test('diagnose: Auto-Fail nennt „Zeit abgelaufen“ im Detail', () => {
  const tk = task();
  assert.equal(run(tk, null, 21000, { timedOut: true }).detail, 'Zeit abgelaufen · So kommst du auf 45');
  assert.equal(run(tk, 60, 21000, { timedOut: true }).detail, 'Zeit abgelaufen · Deine Antwort: 60');
});

test('diagnose: Auswahlaufgaben', () => {
  const ch: ChoiceTask = { ...mkTask(), kind: 'choice', choices: ['km/h', 'km', 'h', '1/km'], expected: 0 };
  assert.equal(answerText(ch), 'km/h');
  assert.equal(run(ch, 0).kind, 'good');
  assert.deepEqual(run(ch, 2, 5000, { why: 'Einheiten kürzen' }), { kind: 'bad', title: 'Richtig ist km/h', detail: 'Einheiten kürzen' });
  assert.deepEqual(run(ch, null, 5000, { why: 'Einheiten kürzen' }), { kind: 'skip', title: 'Kein Problem. Richtig ist km/h', detail: 'Einheiten kürzen' });
});

test('diagnose: Englisch', () => {
  setLang('en');
  const tk = task();
  assert.equal(run(tk, 450).title, 'One zero too many');
  assert.equal(run(tk, 450).detail, '450 instead of 45 · count the zeros separately');
  assert.equal(run(tk, 45).detail, '12.4 s · target 20 s');
});

test('roundInsight: erst ab 2 Fehlern, häufigster Fehlertyp und Subtyp', () => {
  const r = (subtype: string, errorType: ErrorType | null) => ({ task: { subtype }, ev: { correct: errorType === null, errorType } });
  assert.equal(roundInsight([r('a', null), r('b', 'nullen')]), null);
  assert.equal(roundInsight([]), null);
  assert.deepEqual(roundInsight([r('a', 'nullen'), r('b', 'falsch'), r('b', 'nullen'), r('c', null)]), { type: 'nullen', count: 2, subtype: 'a' });
  assert.deepEqual(roundInsight([r('x', 'falsch'), r('y', 'falsch'), r('y', 'falsch'), r('z', 'skip')]), { type: 'falsch', count: 3, subtype: 'y' });
  // Gleichstand: aussagekräftigerer Typ gewinnt
  assert.equal(roundInsight([r('a', 'skip'), r('b', 'knapp')])?.type, 'knapp');
});
