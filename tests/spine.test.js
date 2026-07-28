import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readingOrder, neighborSlug, isMatterSlug, PREFACE_SLUG, AFTERWORD_SLUG,
} from '../src/spine.js';
import { CASES } from '../src/koans/index.js';

const ORDER = readingOrder(CASES);

test('the book runs preface, forty-nine cases, afterword', () => {
  assert.equal(ORDER.length, CASES.length + 2);
  assert.equal(ORDER[0], PREFACE_SLUG);
  assert.equal(ORDER.at(-1), AFTERWORD_SLUG);
  assert.deepEqual(ORDER.slice(1, -1), CASES.map((c) => c.slug));
});

test('the two ends have nowhere further to go', () => {
  assert.equal(neighborSlug(ORDER, PREFACE_SLUG, -1), null);
  assert.equal(neighborSlug(ORDER, AFTERWORD_SLUG, +1), null);
});

test('the matter pages sit either side of the cases', () => {
  assert.equal(neighborSlug(ORDER, PREFACE_SLUG, +1), CASES[0].slug);
  assert.equal(neighborSlug(ORDER, CASES[0].slug, -1), PREFACE_SLUG);
  assert.equal(neighborSlug(ORDER, CASES.at(-1).slug, +1), AFTERWORD_SLUG);
  assert.equal(neighborSlug(ORDER, AFTERWORD_SLUG, -1), CASES.at(-1).slug);
});

test('every case keeps the neighbours it had before, in the middle of the book', () => {
  // The only two links that may change are case 1's previous and case 49's next.
  for (let i = 1; i < CASES.length - 1; i++) {
    assert.equal(neighborSlug(ORDER, CASES[i].slug, -1), CASES[i - 1].slug, `prev of ${CASES[i].slug}`);
    assert.equal(neighborSlug(ORDER, CASES[i].slug, +1), CASES[i + 1].slug, `next of ${CASES[i].slug}`);
  }
});

test('an unknown slug has no neighbours rather than throwing', () => {
  assert.equal(neighborSlug(ORDER, 'no-such-page', +1), null);
  assert.equal(neighborSlug(ORDER, 'no-such-page', -1), null);
});

test('the matter slugs are recognisable without a lookup', () => {
  assert.ok(isMatterSlug(PREFACE_SLUG));
  assert.ok(isMatterSlug(AFTERWORD_SLUG));
  assert.ok(!isMatterSlug(CASES[0].slug));
  assert.ok(!isMatterSlug('no-such-page'));
});
