import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTitle } from '../src/ui/title.ts';

test('formatTitle', () => {
  assert.equal(formatTitle('Analyse'), 'Analyse | Mental Math');
  assert.equal(formatTitle(), 'Mental Math');
  assert.equal(formatTitle('  '), 'Mental Math');
  assert.equal(formatTitle(null), 'Mental Math');
});
