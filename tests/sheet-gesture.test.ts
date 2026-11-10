import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullIntent } from '../src/ui/sheet-gesture.ts';

test('pullIntent: unter der Entscheidungsstrecke noch offen', () => {
  assert.equal(pullIntent(0, 0, true), 'undecided');
  assert.equal(pullIntent(1, 1, true), 'undecided');
});

test('pullIntent: nach unten zieht das Sheet, wenn es ganz oben steht', () => {
  assert.equal(pullIntent(0, 3, true), 'pull');
  assert.equal(pullIntent(2, 2, true), 'pull', 'genau diagonal zählt noch als senkrecht');
});

test('pullIntent: gescrollter Inhalt behält den Wisch', () => {
  assert.equal(pullIntent(0, 12, false), 'none');
});

test('pullIntent: nach oben und waagerecht bleiben beim Inhalt', () => {
  assert.equal(pullIntent(0, -5, true), 'none', 'nach oben scrollt');
  assert.equal(pullIntent(6, 2, true), 'none', 'waagerechte Scroller');
});
