import { test } from 'node:test';
import assert from 'node:assert/strict';
import TEXT from '../src/koans/text/mumonkan.js';

test('committed artifact has 49 complete entries', () => {
  const ids = Object.keys(TEXT).map(Number).sort((a, b) => a - b);
  assert.equal(ids.length, 49);
  assert.equal(ids[0], 1);
  assert.equal(ids[48], 49);
  for (const id of ids) {
    for (const f of ['title', 'case', 'comment', 'verse']) {
      assert.ok(TEXT[id][f] && TEXT[id][f].trim().length > 0, `case ${id} ${f} empty`);
    }
  }
  assert.equal(TEXT[49].extra, true);
});

test('case 29 is the wind-and-flag koan', () => {
  assert.match(TEXT[29].title, /Flag/i);
});
