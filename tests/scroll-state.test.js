import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, narrationQueue } from '../src/ui/scroll_state.js';

test('sections are case, comment, verse in order', () => {
  assert.deepEqual(SECTIONS, ['case', 'comment', 'verse']);
});

test('narrationQueue skips empty sections, keeps order', () => {
  assert.deepEqual(narrationQueue({ case: 'a', comment: 'b', verse: 'c' }), ['case', 'comment', 'verse']);
  assert.deepEqual(narrationQueue({ case: 'a', comment: '  ', verse: 'c' }), ['case', 'verse']);
  assert.deepEqual(narrationQueue({ case: '', comment: '', verse: '' }), []);
});
