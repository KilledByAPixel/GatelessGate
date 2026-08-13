import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k28 from '../src/koans/k28.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Case 28 is the only page in the book that goes dark, and the dark is now a
// HELD BREATH rather than a state the page settles into: the candle relights
// itself a few seconds after it is blown out. Which also means a reader who
// taps once and reads on gets the whole event — the dark arriving and the dark
// leaving — without having to know to tap again.

function staged() {
  const ctx = fakeCtx({
    // breath is the blow-out's swish and setWindLevel the bed it swells — both
    // landed in the interaction audit alongside the widened hit cylinder
    audio: { knock() {}, chimeStrike() {}, cylinderStrike() {}, breath() {}, setWindLevel() {} },
  });
  const root = k28.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  // the flame's own generous hit cylinder — the tap target
  const hit = root.scene.getObjectByName('flame-hit');
  const blow = () => {
    ctx.input.raycastFirst = (cam, targets) => (targets.includes(hit)
      ? { object: hit, point: new THREE.Vector3(), distance: 1 } : null);
    ctx._taps.forEach((cb) => cb());
  };
  run(1);
  return { ctx, root, run, blow };
}

test('case 28: the wick catches again on its own', () => {
  const { root, run, blow } = staged();
  assert.equal(root.fragment().lit, true, 'it starts burning');
  blow();
  run(1);
  assert.equal(root.fragment().lit, false, 'and goes out when it is blown out');
  run(2.5);
  assert.equal(root.fragment().lit, false, 'it stays out long enough to be a dark page');
  assert.equal(root.fragment().dark, 1, 'and the stars are fully up while it is');
  run(3);
  const f = root.fragment();
  assert.equal(f.lit, true, 'then it comes back by itself');
  assert.equal(f.relights, 1);
  assert.equal(f.blows, 1, 'and the reader is not credited with a tap they did not make');
  run(2);
  assert.equal(root.fragment().dark, 0, 'the stars go back where they came from');
});

test('case 28: a hand on the wick is not overruled by the clock', () => {
  const { root, run, blow } = staged();
  blow();
  run(1);
  blow();                                    // lit again by hand, well inside the five
  assert.equal(root.fragment().lit, true);
  run(10);
  const f = root.fragment();
  assert.equal(f.lit, true, 'and it is still burning ten seconds later');
  assert.equal(f.relights, 0, 'nothing fired behind the reader');
  assert.equal(f.blows, 2);
});

test('case 28: blowing it out again buys another full five seconds', () => {
  const { root, run, blow } = staged();
  blow();
  run(4);                                    // one second short of the relight
  assert.equal(root.fragment().lit, false);
  blow();                                    // relit by hand...
  run(0.5);
  blow();                                    // ...and out again: the clock restarts
  run(4);
  assert.equal(root.fragment().lit, false, 'still dark four seconds into the second breath');
  run(1.5);
  assert.equal(root.fragment().lit, true, 'and back a moment after five');
  assert.equal(root.fragment().relights, 1, 'exactly one of the three lightings was the clock');
});

test('case 28: nothing goes non-finite over a long run of blowing it out', () => {
  const { root, run, blow } = staged();
  for (let i = 0; i < 12; i++) { blow(); run(1.7); }
  const f = root.fragment();
  for (const [k, v] of Object.entries(f)) {
    assert.ok(typeof v === 'boolean' || Number.isFinite(v), `fragment.${k} is ${v}`);
  }
  const flame = root.scene.getObjectByName('flame');
  assert.ok(Number.isFinite(flame.scale.x) && flame.scale.x >= 0);
});
