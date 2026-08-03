import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDissolve } from '../src/render/dissolve.js';

const DT = 1 / 60;

test('starts covered, dissolveIn reveals and hides the quad', async () => {
  const d = makeDissolve();
  assert.equal(d.t, 0);
  assert.equal(d.mesh.visible, true);
  const done = d.dissolveIn(0.5);
  let resolved = false;
  done.then(() => { resolved = true; });
  for (let i = 0; i < 40; i++) d.update(DT); // 0.66s > 0.5s
  await Promise.resolve();
  assert.equal(resolved, true, 'promise should resolve after duration');
  assert.equal(d.t, 1);
  assert.equal(d.mesh.visible, false);
});

test('dissolveOut covers again; tween is monotonic', () => {
  const d = makeDissolve();
  d.set(1);
  assert.equal(d.mesh.visible, false);
  d.dissolveOut(0.5);
  let prev = d.t;
  for (let i = 0; i < 40; i++) {
    d.update(DT);
    assert.ok(d.t <= prev + 1e-9, `t rose during dissolveOut: ${prev} -> ${d.t}`);
    prev = d.t;
  }
  assert.equal(d.t, 0);
  assert.equal(d.mesh.visible, true);
});

test('deterministic: same update sequence gives same t', () => {
  const a = makeDissolve();
  const b = makeDissolve();
  a.dissolveIn(0.7);
  b.dissolveIn(0.7);
  for (let i = 0; i < 20; i++) { a.update(DT); b.update(DT); }
  assert.equal(a.t, b.t);
});

test('interrupting an active tween settles the superseded promise', async () => {
  const d = makeDissolve();
  const first = d.dissolveIn(1.0);
  let firstResolved = false;
  first.then(() => { firstResolved = true; });
  for (let i = 0; i < 6; i++) d.update(DT); // partway through
  const second = d.dissolveOut(0.5);
  await Promise.resolve();
  assert.equal(firstResolved, true, 'superseded promise must settle');
  for (let i = 0; i < 40; i++) d.update(DT);
  assert.equal(d.t, 0);
  await second;
});

// ---- a different stain every time -------------------------------------------
// Frank: "can we randomize the noise seed for that effect when we transition,
// every time we transition to a new scene... so if you press the button rapidly
// it's not doing the exact same effect, the exact same noise."
//
// The field is a fixed function of position, so a fixed domain meant every
// transition in the book spread ink through the paper in identically the same
// blotches. The domain slides now — and the two rules that make that safe are
// what these pin: it must actually change between transitions, and it must NOT
// change while a tear is on screen.

const seedOf = (d) => [...d.mesh.material.uniforms.uSeed.value.toArray()];

test('every dissolve from rest spreads a different stain', () => {
  const d = makeDissolve();
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    d.set(0);
    d.dissolveIn(0.4);
    const s = seedOf(d);
    assert.ok(s.every(Number.isFinite), `the seed must be a real offset, got ${s}`);
    seen.add(s.join(','));
    d.set(1);                     // land it, ready for the next one
  }
  assert.equal(seen.size, 8, 'eight transitions, eight different fields');
});

test('but an interrupted dissolve keeps the stain it started with', () => {
  // Re-seeding mid-tear would pop one set of blotches into another in a single
  // frame. At t = 0 the quad is solid paper and at t = 1 it is hidden, so those
  // are the only two moments the field can be swapped unseen.
  const d = makeDissolve();
  d.dissolveIn(1.0);
  for (let i = 0; i < 20; i++) d.update(DT);      // a third of the way in
  assert.ok(d.t > 0.05 && d.t < 0.95, `mid-tear, got t = ${d.t}`);
  const mid = seedOf(d);
  d.dissolveOut(1.0);                            // the reader turned back
  assert.deepEqual(seedOf(d), mid, 'the stain on screen must not change under them');
  d.dissolveIn(1.0);
  assert.deepEqual(seedOf(d), mid, 'still the same one, however many times they poke it');
});

test('the seed is a counter, not a die roll — the book stays reproducible', async () => {
  // The determinism rule is what lets this book be driven headlessly and
  // screenshotted reproducibly. Different every press, identical every replay:
  // consecutive seeds must differ, and nothing here may reach for Math.random.
  const { nextInkSeed } = await import('../src/render/inknoise.js');
  const a = nextInkSeed(), b = nextInkSeed();
  assert.equal(a.length, 2);
  assert.notDeepEqual(a, b);
  const src = await import('node:fs').then((fs) => fs.readFileSync('src/render/inknoise.js', 'utf8'));
  // comments stripped first — the file explains at length why it is NOT a die
  // roll, and the words for that contain the words this is looking for
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/Math\.random/.test(code), 'seeded noise everywhere — no Math.random outside src/audio');
});

test('both ink shaders ask the domain for a seed', async () => {
  // A stale two-argument inkDomain() call is a GLSL compile error that Node
  // never sees and a screenshot shows as a black screen. Cheap to pin here.
  const fs = await import('node:fs');
  for (const f of ['src/render/dissolve.js', 'src/render/freeze.js']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /inkDomain\(vUv, uAspect, uSeed\)/, `${f} must pass its seed through`);
    assert.match(src, /uSeed: \{ value: new THREE\.Vector2/, `${f} must declare the uniform`);
  }
});
