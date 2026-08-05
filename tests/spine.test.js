import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readingOrder, readingEntries, neighborSlug, pageTarget, PREFACE_SLUG, AFTERWORD_SLUG,
} from '../src/spine.js';
import { CASES } from '../src/koans/index.js';
import MATTER from '../src/koans/text/matter.js';

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

test('the book ends — nothing wraps from the afterword back to the preface', () => {
  // There used to be a nextInLoop() beside neighborSlug that did wrap, for the
  // hands-free reading that turned its own pages. That reading is gone: a page
  // read aloud stops at the end of that page. So there is exactly ONE walk
  // through the book now, and it stops at both ends.
  assert.equal(neighborSlug(ORDER, AFTERWORD_SLUG, +1), null);
  assert.equal(neighborSlug(ORDER, PREFACE_SLUG, -1), null);
});

test('the walk touches every page of the book exactly once', () => {
  // Stepping forward from the preface should reach the afterword having touched
  // all fifty-one pages. A duplicated or skipped slug in readingOrder would show
  // up here as a short walk rather than as a wrong neighbour.
  const seen = [];
  let slug = PREFACE_SLUG;
  while (slug) { seen.push(slug); slug = neighborSlug(ORDER, slug, +1); }
  assert.deepEqual(seen, ORDER);
  assert.equal(new Set(seen).size, ORDER.length, 'no page is visited twice');
});

test('the reading entries carry a title and a null id for the matter pages', () => {
  const entries = readingEntries(CASES, MATTER);
  assert.equal(entries.length, CASES.length + 2);
  assert.equal(entries[0].slug, PREFACE_SLUG);
  assert.equal(entries[0].id, null);
  assert.equal(entries[0].title, MATTER.preface.title);
  assert.equal(entries.at(-1).slug, AFTERWORD_SLUG);
  assert.equal(entries.at(-1).id, null);
  assert.equal(entries.at(-1).title, MATTER.afterword.title);
});

test('the entries and the order cannot drift apart', () => {
  // Two functions know the book's shape. This is what stops one being edited
  // without the other.
  assert.deepEqual(readingEntries(CASES, MATTER).map((e) => e.slug), readingOrder(CASES));
});

test('every case entry keeps its own number', () => {
  const entries = readingEntries(CASES, MATTER);
  const numbered = entries.filter((e) => e.id !== null);
  assert.equal(numbered.length, 49);
  assert.deepEqual(numbered.map((e) => e.id), CASES.map((c) => c.id));
});

test('backing off the front of the book returns to the Contents', () => {
  // THE BUG, pinned. Frank, having opened the preface from the Contents: "I
  // can go right and it goes to the preface, but then I can't go back left
  // again... it's not just in the look at the scene, it's also in the text
  // itself." Both sets of arrows and the left arrow key all bottomed out in
  // neighborSlug's own null, so the first page of the book was somewhere you
  // could enter and then not leave the way you came in.
  //
  // The Contents is not IN the reading order — it is not a page of the book —
  // which is why this is a rule layered on top of the walk rather than an
  // extra entry in the list.
  assert.deepEqual(pageTarget(ORDER, PREFACE_SLUG, -1), { contents: true });

  // and the arrow is ENABLED, which is the half a reader actually sees: a
  // truthy return is what un-greys it (main.js's hasPrev)
  assert.ok(pageTarget(ORDER, PREFACE_SLUG, -1), 'the back arrow should not be greyed out on the preface');
});

test('the far end is NOT symmetric — the book still has a last page', () => {
  // Deliberate, not an oversight. Going BACK to where you came from is a
  // retreat and the Contents is the honest answer; walking FORWARD off the
  // afterword into the index would be the book eating its own tail, which is
  // the exact thing removing nextInLoop() was about.
  assert.equal(pageTarget(ORDER, AFTERWORD_SLUG, +1), null);
});

test('pageTarget agrees with the plain spine walk everywhere in between', () => {
  // The new rule must touch ONE cell of the table and no others — a version
  // that returned {contents:true} for any missing neighbour, or that shifted
  // the walk by one, would still pass the two tests above.
  for (const slug of ORDER) {
    for (const dir of [-1, +1]) {
      const walked = neighborSlug(ORDER, slug, dir);
      const target = pageTarget(ORDER, slug, dir);
      if (walked) {
        assert.deepEqual(target, { slug: walked },
          `${slug} ${dir > 0 ? 'forward' : 'back'} should page to ${walked}`);
      } else {
        // the only place the walk runs out and the reader still goes somewhere
        const isFrontEdge = dir < 0 && slug === ORDER[0];
        assert.deepEqual(target, isFrontEdge ? { contents: true } : null,
          `${slug} ${dir > 0 ? 'forward' : 'back'} should ${isFrontEdge ? 'reach the Contents' : 'go nowhere'}`);
      }
    }
  }
});

test('a slug that is not in the book pages nowhere, in either direction', () => {
  // Including backward: the front-edge rule keys off "is this the FIRST page",
  // not "did the walk fail", so an unknown slug must not fall into it.
  assert.equal(pageTarget(ORDER, 'not-a-page', -1), null);
  assert.equal(pageTarget(ORDER, 'not-a-page', +1), null);
  assert.equal(pageTarget([], 'anything', -1), null, 'an empty book has no front edge to back off');
});
