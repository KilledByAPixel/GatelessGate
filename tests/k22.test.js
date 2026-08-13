import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k22 from '../src/koans/k22.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Case 22: Kashyapa's flagpole. The sign turns when you touch it — and for a
// while it did not appear to, for a reason that had nothing to do with the
// rotation and everything to do with what a raycast will agree to hit.
// THE CLOTH WAS UNTAPPABLE WHEREVER IT FLEW. three.js's Mesh.raycast tests the
// geometry's bounding SPHERE before it looks at a single triangle, and this
// banner is simulated: the sphere was computed once from the flat undisplaced
// plane and never again, so every frame the cloth streamed somewhere the stale
// sphere did not cover, and a tap aimed at the flying half was rejected before
// any triangle was considered. That is why this case read as doing nothing at
// all some of the time (Frank: "twenty two does not seem to do anything").
test('the banner can be touched where it actually is, not where it was built', () => {
  const ctx = fakeCtx();
  const root = k22.build(ctx);
  const cloth = root.scene.getObjectByName('cloth');

  for (let i = 0; i < 60 * 5; i++) root.update(1 / 60, i / 60);

  const sphere = cloth.geometry.boundingSphere;
  assert.ok(sphere, 'the cloth has bounds at all');
  const pos = cloth.geometry.attributes.position;
  const v = new THREE.Vector3();
  let outside = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.distanceTo(sphere.center) > sphere.radius + 1e-6) outside++;
  }
  assert.equal(outside, 0, `${outside} vertices of the flying cloth sit outside its own pick bounds`);
});

// TWO OBJECTS, TWO ANSWERS. The banner on the pole is the flag — touch it and
// the wind stops, which is the case. The SIGN is the red board standing beside
// it, and touching that turns it half a round; touch it again and it goes on
// round the same way (Frank: "when you click again it rotates again, 180 each
// time"). The turn was briefly wired to the flag's pole, which was the wrong
// object entirely — the banner already had a job and the sign had none.
test('the sign rests square, then sweeps 180 degrees per tap, always the same way', () => {
  const ctx = fakeCtx();
  ctx.audio = { chimeStrike() {}, knock() {} };
  const root = k22.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  const sign = root.scene.getObjectByName('sign');
  assert.ok(sign, 'the red board is staged');
  const rest = sign.rotation.y;

  let t = 0;
  for (let i = 0; i < 60; i++, t += 1 / 60) root.update(1 / 60, t);
  assert.equal(root.fragment().turned, 0, 'it waits square until it is touched');
  assert.equal(sign.rotation.y, rest);

  const board = [];
  sign.traverse((o) => { if (o.isMesh) board.push(o); });
  ctx.input.raycastFirst = (cam, objs) => {
    const hit = (objs || []).find((o) => board.includes(o));
    return hit ? { object: hit, point: new THREE.Vector3() } : null;
  };

  const seen = [];
  for (let k = 0; k < 3; k++) {
    ctx._taps.forEach((cb) => cb());
    // it is genuinely mid-sweep partway through, not a snap
    for (let i = 0; i < 30; i++, t += 1 / 60) root.update(1 / 60, t);
    const half = root.fragment().turned;
    assert.ok(half > k && half < k + 1, `tap ${k + 1} is still turning at the halfway mark (${half})`);
    for (let i = 0; i < 120; i++, t += 1 / 60) root.update(1 / 60, t);
    seen.push(root.fragment().turned);
  }
  assert.deepEqual(seen, [1, 2, 3], 'a half-turn per tap, and it never comes back');
  assert.ok(Math.abs(sign.rotation.y - (rest + 3 * Math.PI)) < 1e-6, 'three half-turns, all the same way');
});

// ...and the banner kept its own job. Turning the sign must not touch the wind,
// and stilling the wind must not turn the sign.
test('the sign and the banner answer separately', () => {
  const ctx = fakeCtx();
  ctx.audio = { chimeStrike() {}, knock() {} };
  const root = k22.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  const sign = root.scene.getObjectByName('sign');
  const cloth = root.scene.getObjectByName('cloth');
  const board = [];
  sign.traverse((o) => { if (o.isMesh) board.push(o); });

  const only = (targets) => { ctx.input.raycastFirst = (cam, objs) => {
    const hit = (objs || []).find((o) => targets.includes(o));
    return hit ? { object: hit, point: new THREE.Vector3() } : null;
  }; };

  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++, t += 1 / 60) root.update(1 / 60, t); };
  step(60);
  const windAtRest = root.fragment().windOn;

  only(board);
  ctx._taps.forEach((cb) => cb());
  step(150);
  assert.equal(root.fragment().turns, 1, 'the board turned');
  assert.equal(root.fragment().windOn, windAtRest, 'and the wind was left alone');

  only([cloth]);
  ctx._taps.forEach((cb) => cb());
  step(30);
  assert.notEqual(root.fragment().windOn, windAtRest, 'the banner stilled');
  assert.equal(root.fragment().turns, 1, 'and the board did not turn again');
});
