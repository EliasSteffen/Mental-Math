import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../src/i18n/index.ts';
import {
  buildShareCard, cardSummary, fitLines, hostOf, rgba, wrapLines,
  type Measure, type ParallelCardInput, type TrainCardInput,
} from '../src/features/share-card.ts';

afterEach(() => setLang('de'));

const URL_ = 'https://mentalmath.example/';
// 1. November 2026, 18:30 Ortszeit
const TS = new Date(2026, 10, 1, 18, 30).getTime();

const train = (o: Partial<TrainCardInput> = {}): TrainCardInput => ({
  kind: 'train', mode: 'all', n: 10, correct: 8, points: 1240, totalMs: 32000, ts: TS, dailyKey: null,
  marks: [true, true, false, true, true, true, false, true, true, true], ...o,
});
const parallel = (o: Partial<ParallelCardInput> = {}): ParallelCardInput => ({
  kind: 'parallel', level: 2, correct: 3, total: 4, points: 1234, bestChains: 4, bestStreak: 2, ts: TS,
  marks: [true, true, false, true], ...o,
});

test('Training (de): Titel, Kennzahlen mit deutscher Formatierung, Datum, Fußzeile', () => {
  const c = buildShareCard(train(), URL_);
  assert.equal(c.title, 'Alle Kategorien');
  assert.deepEqual(c.stats, [
    { label: 'richtig', value: '8/10' },
    { label: 'Genauigkeit', value: '80 %' },
    { label: 'Ø pro Aufgabe', value: '3,2 s' },
    { label: 'Punkte', value: '1.240' },
  ]);
  assert.equal(c.date, '1. November 2026');
  assert.deepEqual(c.footer, { app: 'Mental Math', host: 'mentalmath.example' });
  assert.equal(c.marks.length, 10);
  assert.equal(c.text, `Mein Ergebnis bei Mental Math (Alle Kategorien): 8/10 richtig\n${URL_}`);
  assert.equal(c.fileName, 'mental-math-2026-11-01.png');
});

test('Training (en): englische Zahlen, Prozent und Datum', () => {
  setLang('en');
  const c = buildShareCard(train({ points: 12345, totalMs: 125000 }), URL_);
  assert.equal(c.title, 'All categories');
  assert.deepEqual(c.stats, [
    { label: 'correct', value: '8/10' },
    { label: 'Accuracy', value: '80%' },
    { label: 'Avg. per task', value: '12.5 s' },
    { label: 'Points', value: '12,345' },
  ]);
  assert.equal(c.date, 'November 1, 2026');
  assert.equal(c.text, `My Mental Math result (All categories): 8/10 correct\n${URL_}`);
});

test('Training: Subtyp-Modus nutzt modeName, leere Runde ohne Division durch 0', () => {
  const sub = buildShareCard(train({ mode: 'mult.2x1' }), URL_);
  assert.match(sub.title, / · /);
  const empty = buildShareCard(train({ n: 0, correct: 0, points: 0, totalMs: 0, marks: [] }), URL_);
  assert.deepEqual(empty.stats.map((s) => s.value), ['0/0', '0 %', '0 s', '0']);
});

test('Daily: Label „Daily Challenge“, Datum aus dem Daily-Tag, Begleittext = dailyShareText', () => {
  // Runde kurz nach Mitternacht beendet: das Datum der Challenge zählt, nicht der Zeitstempel
  const c = buildShareCard(train({ dailyKey: '2026-10-31', mode: 'daily', n: 15, correct: 13, points: 1240, totalMs: 151000 }), URL_);
  assert.equal(c.title, 'Daily Challenge');
  assert.equal(c.date, '31. Oktober 2026');
  assert.equal(c.text, `Mental Math Daily 31.10.2026: 13/15 · 1.240 Pkt · 2:31 min\n${URL_}`);
  assert.equal(c.fileName, 'mental-math-daily-2026-10-31.png');
  setLang('en');
  const e = buildShareCard(train({ dailyKey: '2026-10-31', mode: 'daily', n: 15, correct: 13, points: 1240, totalMs: 151000 }), URL_);
  assert.equal(e.date, 'October 31, 2026');
  assert.equal(e.text, `Mental Math Daily 10/31/2026: 13/15 · 1,240 pts · 2:31 min\n${URL_}`);
});

test('Parallel (de/en): Ketten richtig, Punkte, Bestwert, beste Serie', () => {
  const c = buildShareCard(parallel(), URL_);
  assert.equal(c.title, 'Paralleles Kettenrechnen · Level 2');
  assert.deepEqual(c.stats, [
    { label: 'Ketten richtig', value: '3/4' },
    { label: 'Punkte', value: '1.234' },
    { label: 'Bestwert', value: '4 Ketten' },
    { label: 'Beste Serie', value: '2 Runden' },
  ]);
  assert.equal(c.text, `Mein Ergebnis bei Mental Math (Paralleles Kettenrechnen · Level 2): 3/4 Ketten richtig\n${URL_}`);
  assert.equal(c.fileName, 'mental-math-parallel-2026-11-01.png');
  assert.equal(buildShareCard(parallel({ bestStreak: 1 }), URL_).stats[3]?.value, '1 Runde');
  // noch kein Bestwert / keine Serie → Strich statt „0 Ketten“
  const none = buildShareCard(parallel({ bestChains: 0, bestStreak: 0 }), URL_);
  assert.deepEqual(none.stats.slice(2).map((s) => s.value), ['–', '–']);
  setLang('en');
  const e = buildShareCard(parallel(), URL_);
  assert.equal(e.title, 'Parallel chains · Level 2');
  assert.deepEqual(e.stats.map((s) => s.value), ['3/4', '1,234', '4 chains', '2 rounds']);
  assert.equal(e.stats[0]?.label, 'chains correct');
});

test('cardSummary: Alternativtext mit Titel, Datum und allen Kennzahlen', () => {
  const s = cardSummary(buildShareCard(train(), URL_));
  assert.equal(s, 'Alle Kategorien, 1. November 2026: 8/10 richtig, Genauigkeit 80 %, Ø pro Aufgabe 3,2 s, Punkte 1.240');
});

test('hostOf: Host mit Port, ungültige URL → leer', () => {
  assert.equal(hostOf('http://localhost:8080/'), 'localhost:8080');
  assert.equal(hostOf('https://mentalmath.example/app/'), 'mentalmath.example');
  assert.equal(hostOf('kaputt'), '');
});

// Messfunktion für die Tests: jedes Zeichen ist size/2 breit
const measure: Measure = (s, size) => s.length * size * 0.5;

test('wrapLines: bricht an Leerzeichen, überlange Wörter bleiben allein', () => {
  assert.deepEqual(wrapLines('aaa bbb ccc', 40, 10, measure), ['aaa bbb', 'ccc']);
  assert.deepEqual(wrapLines('  eins  ', 40, 10, measure), ['eins']);
  assert.deepEqual(wrapLines('Überlangeswort x', 40, 10, measure), ['Überlangeswort', 'x']);
});

test('fitLines: größte passende Größe, sonst kleinste mit Auslassungspunkten', () => {
  assert.deepEqual(fitLines('Prozente', 200, 2, [40, 30, 20], measure), { size: 40, lines: ['Prozente'] });
  // passt erst in 30 px auf zwei Zeilen
  const mid = fitLines('Große Zahlen · Nullen', 200, 2, [40, 30, 20], measure);
  assert.equal(mid.size, 30);
  assert.ok(mid.lines.length <= 2 && mid.lines.every((l) => measure(l, 30) <= 200));
  // zu lang: kleinste Größe, höchstens 2 Zeilen, letzte mit „…“ und innerhalb der Breite
  const long = fitLines('sehr langer Name '.repeat(8), 200, 2, [40, 20], measure);
  assert.equal(long.size, 20);
  assert.equal(long.lines.length, 2);
  assert.ok(long.lines[1]?.endsWith('…'));
  assert.ok(long.lines.every((l) => measure(l, 20) <= 200));
  // ein einzelnes überlanges Wort wird gekürzt
  const word = fitLines('Donaudampfschifffahrtsgesellschaft', 100, 1, [20], measure);
  assert.ok(word.lines[0]?.endsWith('…') && measure(word.lines[0], 20) <= 100);
});

test('rgba: Hex mit Deckkraft, andere Angaben → null', () => {
  assert.equal(rgba('#3A5A8A', 0.2), 'rgba(58, 90, 138, 0.2)');
  assert.equal(rgba('#fff', 0), 'rgba(255, 255, 255, 0)');
  assert.equal(rgba('rgba(255,255,255,.06)', 1), null);
});
