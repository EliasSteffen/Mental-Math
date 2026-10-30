import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAiText, isAiAvailable } from '../public/js/ai.js';

const plain = (parts) => parts.map((p) => p.text).join('');

test('Absätze durch Leerzeilen', () => {
  const b = parseAiText('Eins\nzwei\n\nDrei');
  assert.equal(b.length, 2);
  assert.equal(b[0].type, 'p');
  assert.equal(plain(b[0].parts), 'Eins zwei');
  assert.equal(plain(b[1].parts), 'Drei');
});

test('fett und kursiv', () => {
  const [b] = parseAiText('Das ist **wichtig** und *leicht*.');
  assert.deepEqual(b.parts, [
    { text: 'Das ist ', bold: false, italic: false },
    { text: 'wichtig', bold: true, italic: false },
    { text: ' und ', bold: false, italic: false },
    { text: 'leicht', bold: false, italic: true },
    { text: '.', bold: false, italic: false },
  ]);
});

test('nummerierte Listen (. und ))', () => {
  const b = parseAiText('1. Erst\n2) Dann **fett**\n3. Ende');
  assert.equal(b.length, 1);
  assert.equal(b[0].type, 'ol');
  assert.equal(b[0].items.length, 3);
  assert.equal(b[0].items[1][1].bold, true);
});

test('Bullets mit - und *', () => {
  const b = parseAiText('- a\n* b');
  assert.equal(b.length, 1);
  assert.equal(b[0].type, 'ul');
  assert.equal(b[0].items.length, 2);
  assert.equal(plain(b[0].items[1]), 'b');
});

test('Überschriften-Marker und Backticks werden entfernt', () => {
  const b = parseAiText('## Titel\n`34 × 27`');
  assert.equal(plain(b[0].parts), 'Titel 34 × 27');
});

test('Liste und Absatz getrennt, kein HTML', () => {
  const b = parseAiText('Intro\n1. A\n2. B\nSchluss <b>x</b>');
  assert.deepEqual(b.map((x) => x.type), ['p', 'ol', 'p']);
  assert.equal(plain(b[2].parts), 'Schluss <b>x</b>');
});

test('leer', () => {
  assert.deepEqual(parseAiText(''), []);
  assert.deepEqual(parseAiText(null), []);
});

test('isAiAvailable ohne sessionStorage', () => {
  assert.equal(isAiAvailable(), true);
});
