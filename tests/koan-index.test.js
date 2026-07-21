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

test('the built chapter loads via the registry; unbuilt cases do not', async () => {
  const BUILT = [1, 6, 7, 29, 37];
  for (const id of BUILT) {
    assert.equal(isRegistered(byId(id).slug), true, `case ${id} should be registered`);
  }
  const mod = await loadKoan('not-the-wind-not-the-flag');
  assert.equal(mod.id, 29);

  // a case we have not built yet stays unregistered and unloadable, so the menu
  // can grey it out rather than entering an empty scene
  const unbuilt = CASES.find((c) => !BUILT.includes(c.id));
  assert.ok(unbuilt, 'there should still be unbuilt cases');
  assert.equal(isRegistered(unbuilt.slug), false);
  assert.equal(await loadKoan(unbuilt.slug), null);
});
