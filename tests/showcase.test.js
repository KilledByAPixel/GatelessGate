import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { CASES } from '../src/koans/index.js';
import { loadKoan, isRegistered, isStaged } from '../src/koans/registry.js';
import { readingOrder, readingEntries, neighborSlug } from '../src/spine.js';
import MATTER from '../src/koans/text/matter.js';
import { SHOWCASE_SLUG, DEV_PAGES, isDevPage } from '../src/koans/dev/index.js';
import { PAPER } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// THE SHOWCASE — every model in the kit, in one room.
//
// It is a developer TOOL, not a page of the book, and almost everything worth
// asserting about it is about that boundary: it must be reachable (its own
// loader table, its own hash) and it must be invisible to everything that
// walks the book — the spine, the contents, and above all the staging net,
// whose draw-call budget it would blow by design. The scene itself gets the
// same smoke treatment a case gets, minus the budget.

test('the showcase loads through its own table', async () => {
  assert.ok(isRegistered(SHOWCASE_SLUG), 'enter() checks this before it will navigate anywhere');
  const mod = await loadKoan(SHOWCASE_SLUG);
  assert.ok(mod, 'loadKoan should resolve to a module');
  assert.equal(mod.slug, SHOWCASE_SLUG);
  assert.equal(mod.id, null, 'no number: no seal, and nothing that counts cases sees it');
  assert.equal(mod.dev, true, 'the flag main.js reads to keep it out of reading progress');
});

test('the sit guard has what it needs — isDevPage(showcase) is true', () => {
  // The showcase has a Sit button like any case, so a completed sit calls
  // main.js's sit.onComplete, which guards save.markSat with
  // `koanSlug && !isDevPage(koanSlug)` — the same class of leak the markRead
  // guard above (mod.dev) exists to prevent, but driven from koanSlug alone
  // rather than the module, which is why the sit guard reads isDevPage()
  // instead. main.js itself isn't Node-testable (DOM + Three.js), so this is
  // the pure seam: if isDevPage ever stopped recognising the showcase, the
  // guard in main.js would silently stop guarding it and a finished sit would
  // persist sat['showcase'] into save state.
  assert.ok(isDevPage(SHOWCASE_SLUG), 'a completed sit on the showcase must never reach save.markSat');
});

test('the showcase is not in the book', async () => {
  // The spine is the reading order; the showcase is not in it, so nothing pages
  // into it and the arrow keys stop before it.
  const spine = readingOrder(CASES);
  assert.ok(!spine.includes(SHOWCASE_SLUG), 'not in the reading spine');
  assert.equal(neighborSlug(spine, SHOWCASE_SLUG, +1), null);
  assert.equal(neighborSlug(spine, SHOWCASE_SLUG, -1), null);

  const entries = readingEntries(CASES, MATTER);
  assert.ok(!entries.some((e) => e.slug === SHOWCASE_SLUG), 'not a row of the contents');
  assert.ok(!CASES.some((c) => c.slug === SHOWCASE_SLUG), 'not a case');
});

test('the showcase is outside the staging net — that is what exempts it from the draw budget', async () => {
  // tests/staging.test.js walks `CASES` filtered by isStaged() and holds each
  // one to the <150 draw budget. The showcase is deliberately over it: it draws
  // the whole kit at once. Its own loader table (DEV_LOADERS) is what keeps it
  // out of that walk, and this is the assertion that says so — if someone ever
  // moves it into LOADERS or MATTER_LOADERS, this fails before the budget does.
  const walked = CASES.filter((c) => isStaged(c.slug)).map((c) => c.slug);
  assert.ok(!walked.includes(SHOWCASE_SLUG), 'the staging net must never build the showcase');
  assert.equal(isStaged(SHOWCASE_SLUG), false, '"has this page of the book art" is not a question about a tool');
});

test('the dev manifest is a plain list anyone can extend', () => {
  assert.ok(Array.isArray(DEV_PAGES) && DEV_PAGES.length >= 1);
  assert.equal(DEV_PAGES[0].slug, SHOWCASE_SLUG);
  assert.ok(isDevPage(SHOWCASE_SLUG));
  assert.ok(!isDevPage('joshu-s-dog'));
  assert.ok(!isDevPage('preface'));
});

test('the showcase builds, runs, and tears down', async () => {
  const mod = await loadKoan(SHOWCASE_SLUG);

  assert.ok(Array.isArray(mod.ambience) && mod.ambience.length > 0);
  for (const a of mod.ambience) assert.equal(typeof a, 'string');
  assert.ok(Array.isArray(mod.sections) && mod.sections.length > 0);
  assert.deepEqual(Object.keys(mod.text).sort(), [...mod.sections].sort());
  assert.deepEqual(Object.keys(mod.labels).sort(), [...mod.sections].sort());

  const ctx = fakeCtx();
  const root = mod.build(ctx);
  for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
    assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
  }
  assert.ok(root.scene instanceof THREE.Scene);
  assert.ok(root.scene.fog, 'nothing may meet a horizon, here either');
  assert.equal('#' + root.scene.background.getHexString(), PAPER.toLowerCase());
  assert.ok(root.scene.getObjectByName('ground'), 'no ground');

  root.onEnter && root.onEnter();
  for (let i = 0; i < 240; i++) root.update(1 / 60, i / 60);

  // nothing may go NaN — every model's behaviour is running at once in here,
  // which makes this the cheapest place in the suite to catch one that does
  root.scene.updateMatrixWorld(true);
  let bad = null;
  root.scene.traverse((o) => {
    if (bad) return;
    const p = o.position, s = o.scale, r = o.rotation;
    if (![p.x, p.y, p.z, s.x, s.y, s.z, r.x, r.y, r.z].every(Number.isFinite)) bad = o.name || o.type;
  });
  assert.equal(bad, null, `${bad} has a non-finite transform`);

  const frag = root.fragment();
  assert.ok(frag && typeof frag === 'object');
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
  }

  // taps are safe before a camera arrives, and with no audio engine at all
  assert.doesNotThrow(() => ctx._taps.forEach((cb) => cb()));
  assert.doesNotThrow(() => { root.onExit && root.onExit(); root.dispose(); });
});

test('the showcase frames itself, wide, and the clamps let you get right out', async () => {
  const mod = await loadKoan(SHOWCASE_SLUG);
  const c = mod.camera;
  assert.ok(c, 'a room this size cannot use the standard diorama shot');
  assert.equal(c.target.length, 3);
  assert.ok(c.target.every(Number.isFinite));
  assert.ok(c.pitch > -78 && c.pitch < 78);
  assert.ok(c.maxDist > 30, 'the whole room must fit in the frame at full zoom-out');
  assert.ok(c.minDist <= 4, 'and a single model must be reachable up close');
  assert.ok(c.distance >= c.minDist && c.distance <= c.maxDist);
});

// A digest of the whole scene graph: name, transform and geometry size for
// every object, in traversal order. Two builds of a seeded scene must agree on
// all of it — a single Math.random anywhere in the kit shows up here.
function digest(scene) {
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const p = o.getWorldPosition(new THREE.Vector3());
    const q = o.getWorldQuaternion(new THREE.Quaternion());
    const s = o.getWorldScale(new THREE.Vector3());
    const n = o.geometry && o.geometry.attributes && o.geometry.attributes.position
      ? o.geometry.attributes.position.count : 0;
    out.push([o.name || o.type,
      p.x.toFixed(5), p.y.toFixed(5), p.z.toFixed(5),
      q.x.toFixed(5), q.y.toFixed(5), q.z.toFixed(5), q.w.toFixed(5),
      s.x.toFixed(5), s.y.toFixed(5), s.z.toFixed(5), n].join(' '));
  });
  return out.join('\n');
}

test('the showcase is seeded — two builds are the same room', async () => {
  const mod = await loadKoan(SHOWCASE_SLUG);
  const a = mod.build(fakeCtx());
  const b = mod.build(fakeCtx());
  for (let i = 0; i < 120; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.equal(digest(a.scene), digest(b.scene));
  a.dispose(); b.dispose();
});
