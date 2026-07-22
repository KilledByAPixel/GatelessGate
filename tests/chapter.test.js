import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bySlug } from '../src/koans/index.js';
import { isRegistered, isStaged, loadKoan } from '../src/koans/registry.js';

// The staged cases. Each must satisfy the koan module contract so the app can
// enter it, drive it, and tear it down without special-casing. Every case that
// gets a diorama of its own belongs in this list — that is what makes the
// contract a contract rather than a description of whatever case 29 happens to do.
const CHAPTER = [
  { id: 1, slug: 'joshu-s-dog' },
  { id: 2, slug: 'hyakujo-s-fox' },
  { id: 3, slug: 'gutei-s-finger' },
  { id: 5, slug: 'kyogen-mounts-the-tree' },
  { id: 6, slug: 'buddha-twirls-a-flower' },
  { id: 7, slug: 'joshu-washes-the-bowl' },
  { id: 14, slug: 'nansen-cuts-the-cat-in-two' },
  { id: 16, slug: 'bells-and-robes' },
  { id: 19, slug: 'everyday-life-is-the-path' },
  { id: 23, slug: 'do-not-think-good-do-not-think-not-good' },
  { id: 26, slug: 'two-monks-roll-up-the-screen' },
  { id: 29, slug: 'not-the-wind-not-the-flag' },
  { id: 37, slug: 'a-buffalo-passes-through-the-enclosure' },
  { id: 38, slug: 'an-oak-tree-in-the-garden' },
  { id: 40, slug: 'tipping-over-a-water-vase' },
  { id: 46, slug: 'proceed-from-the-top-of-the-pole' },
  { id: 47, slug: 'three-gates-of-tosotsu' },
];

// a minimal stand-in for the app's ctx: records the handlers a koan wires up
function stubCtx() {
  const taps = [];
  const hovers = [];
  return {
    audio: null,
    input: {
      onTap: (fn) => taps.push(fn),
      onHover: (fn) => hovers.push(fn),
      raycastFirst: () => null,      // nothing under the cursor during tests
      clear: () => { taps.length = 0; hovers.length = 0; },
    },
    taps,
    hovers,
  };
}

test('every chapter slug resolves and is registered', () => {
  for (const c of CHAPTER) {
    const entry = bySlug(c.slug);
    assert.ok(entry, `slug ${c.slug} is missing from the index`);
    assert.equal(entry.id, c.id, `${c.slug} should be case ${c.id}`);
    assert.ok(isStaged(c.slug), `${c.slug} is not registered in LOADERS`);
  }
});

for (const c of CHAPTER) {
  test(`case ${c.id} builds, runs, and reports a fragment`, async () => {
    const mod = await loadKoan(c.slug);
    assert.ok(mod, `loadKoan(${c.slug}) returned nothing`);
    assert.equal(mod.id, c.id);
    assert.equal(mod.slug, c.slug, 'module slug must match the derived index slug');
    assert.ok(mod.title && mod.accent, 'title + accent');
    for (const key of ['case', 'comment', 'verse']) {
      assert.ok(typeof mod.text[key] === 'string' && mod.text[key].length > 0, `text.${key}`);
    }

    const ctx = stubCtx();
    const built = mod.build(ctx);
    assert.ok(built.scene && built.scene.isScene, 'builds a scene');
    assert.equal(typeof built.update, 'function');
    assert.equal(typeof built.fragment, 'function');
    assert.equal(typeof built.dispose, 'function');

    built.setCamera && built.setCamera(null);
    built.onEnter && built.onEnter();
    // drive a couple of seconds: the meadow, cloth and any moment must all be
    // safe to step without a renderer present
    for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
    const frag = built.fragment();
    assert.equal(typeof frag, 'object');
    assert.ok(Object.keys(frag).length > 0, 'fragment reports something');
    for (const v of Object.values(frag)) {
      assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment values stay finite: ${JSON.stringify(frag)}`);
    }
    built.onExit && built.onExit();
    built.dispose();
  });
}

test('each case wires at least one tap handler for its moment', async () => {
  for (const c of CHAPTER) {
    const mod = await loadKoan(c.slug);
    const ctx = stubCtx();
    mod.build(ctx);
    assert.ok(ctx.taps.length > 0, `case ${c.id} should offer something to find`);
  }
});
