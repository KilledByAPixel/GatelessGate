import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, byId, bySlug, slugify } from '../src/koans/index.js';
import { isRegistered, isStaged, loadKoan } from '../src/koans/registry.js';

test('slugify', () => {
  assert.equal(slugify('Not the Wind, Not the Flag'), 'not-the-wind-not-the-flag');
  assert.equal(slugify("Joshu's Dog"), 'joshu-s-dog');
});

test('CASES has 49 unique ids and slugs', () => {
  assert.equal(CASES.length, 49);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 49);
  assert.equal(new Set(CASES.map((c) => c.slug)).size, 49);
  assert.equal(CASES[0].id, 1);
  assert.equal(CASES[48].id, 49);
  assert.equal(CASES[48].extra, true);
});

test('byId / bySlug', () => {
  const c = byId(29);
  assert.equal(c.slug, 'not-the-wind-not-the-flag');
  assert.equal(bySlug(c.slug).id, 29);
  assert.equal(byId(999), null);
  assert.equal(bySlug('nope'), null);
});

test('every case in the book is readable, staged or not', async () => {
  // The whole collection opens. The text for all forty-nine is generated and in
  // the bundle already; only the LOADERS table ever stood in front of it, and
  // "has a diorama" is not a reason to withhold a koan from the reader.
  for (const c of CASES) {
    assert.ok(isRegistered(c.slug), `${c.slug} should be readable`);
  }

  // The staging roster is read from the registry rather than pinned here: this
  // test is about READABILITY, and a hardcoded list of staged ids turns every
  // new diorama into a failure in an unrelated file. tests/staging.test.js is
  // where staged cases are held to their contract.
  assert.equal(isStaged(byId(29).slug), true, 'the vertical-slice case is staged');
  assert.equal((await loadKoan('not-the-wind-not-the-flag')).id, 29);

  // an unstaged case falls back to the default landscape, carrying its own text
  const unstaged = CASES.find((c) => !isStaged(c.slug));
  assert.ok(unstaged, 'there should still be unstaged cases');
  const mod = await loadKoan(unstaged.slug);
  assert.ok(mod, `${unstaged.slug} should load the default case`);
  assert.equal(mod.id, unstaged.id);
  assert.equal(mod.staged, false);
  assert.equal(mod.title, unstaged.title);
  assert.ok(mod.text.case && mod.text.comment && mod.text.verse,
    'the default case carries the real text, which is the whole point');
});

test('all forty-nine resolve to a module with their own text', async () => {
  const seen = new Set();
  for (const c of CASES) {
    const mod = await loadKoan(c.slug);
    assert.ok(mod, `${c.slug} resolved nothing`);
    assert.equal(mod.id, c.id);
    assert.ok(mod.text.case.length > 20, `case ${c.id} has no case text`);
    assert.ok(mod.text.verse.length > 10, `case ${c.id} has no verse`);
    assert.ok(!seen.has(mod.text.case), `case ${c.id} duplicates another's text`);
    seen.add(mod.text.case);
  }
});
