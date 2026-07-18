import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, byId, bySlug, slugify } from '../src/koans/index.js';
import { isRegistered, loadKoan } from '../src/koans/registry.js';

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

test('registration table (k29 load verified in Task 13)', async () => {
  assert.equal(isRegistered('not-the-wind-not-the-flag'), true);
  assert.equal(isRegistered('joshu-s-dog'), false);
  assert.equal(await loadKoan('joshu-s-dog'), null);
});
