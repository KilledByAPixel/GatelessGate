import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCardLabel, HOLD_MS } from '../src/ui/page_card.js';
import MATTER from '../src/koans/text/matter.js';
import { CASES } from '../src/koans/index.js';

// The card is the only thing on screen in the reading that says which page you
// are on, so the one fact worth pinning is that a page without a number does not
// try to show one.

test('a numbered case shows its number above its name', () => {
  assert.deepEqual(pageCardLabel({ id: 29, title: 'Not the Wind, Not the Flag' }),
    { number: '29', title: 'Not the Wind, Not the Flag' });
});

test('a page with no number shows no number, not an empty one', () => {
  // '' rather than 'null' or '0' — the caller hides the element on an empty
  // string, and any of those other values would render literally.
  assert.deepEqual(pageCardLabel({ id: null, title: 'Preface' }), { number: '', title: 'Preface' });
});

test('case 1 keeps its number rather than being read as absent', () => {
  // id 1 is truthy, but id 0 would not be and neither is null — this is the
  // check that stops the numbering being written as a truthiness test.
  assert.equal(pageCardLabel({ id: 1, title: 'Joshu\'s Dog' }).number, '1');
  assert.equal(pageCardLabel({ id: 0, title: 'nought' }).number, '0');
});

test('every page of the book produces a card with something to say', () => {
  for (const c of CASES) {
    const label = pageCardLabel({ id: c.id, title: c.title });
    assert.ok(label.title.trim(), `case ${c.id} has no title to show`);
    assert.equal(label.number, String(c.id));
  }
  for (const slug of ['preface', 'afterword']) {
    const label = pageCardLabel({ id: null, title: MATTER[slug].title });
    assert.ok(label.title.trim(), `${slug} has no title to show`);
    assert.equal(label.number, '');
  }
});

test('the card is gone well before the shortest page is read', () => {
  // A caption that outlives the reading of the page becomes furniture, which is
  // the thing this deliberately is not. The shortest unit in the book runs about
  // sixteen seconds, so the hold has to be a small fraction of that.
  assert.ok(HOLD_MS < 15000, 'the card must not sit through a whole page');
  assert.ok(HOLD_MS > 2000, 'and it must be readable without hurrying');
});
