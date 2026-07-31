import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeKoi } from '../src/kit/koi.js';

const run = (o, secs, step = 1 / 60) => {
  for (let i = 0; i * step < secs; i++) o.update(step, i * step);
};

const bodyOf = (k, i = 0) => k.group.children[i].getObjectByName('koi-body');

// half of the z-spread among vertices whose local x lies in [x0, x1] — the
// half-width of the fish's silhouette in that band, as a straight-down camera
// would see it. Spread rather than max |z| because the swim wave is live: it
// shifts a whole band sideways together, and spread cancels that shift.
function halfWidth(mesh, x0, x1) {
  const p = mesh.geometry.attributes.position;
  let lo = Infinity, hi = -Infinity;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v);
    if (x >= x0 && x <= x1) { lo = Math.min(lo, p.getZ(v)); hi = Math.max(hi, p.getZ(v)); }
  }
  return (hi - lo) / 2;
}

test('the same pond holds the same fish every run', () => {
  const at = (t) => {
    const k = makeKoi({ count: 4, seed: 30 });
    run(k, t);
    return k.group.children.map((f) => [
      +f.position.x.toFixed(6), +f.position.z.toFixed(6), +f.rotation.y.toFixed(6),
    ]);
  };
  assert.deepEqual(at(5), at(5));
  assert.notDeepEqual(at(5), at(8), 'the school is frozen');
});

test('the fish hang under the surface and stay in the pond', () => {
  const k = makeKoi({ count: 5, seed: 30, radius: 2.0, depth: 0.13, length: 0.95 });
  for (let t = 0; t < 60; t += 0.3) {
    k.update(1 / 60, t);
    for (const f of k.group.children) {
      // never breaks the surface (group sits AT the surface; fish hang below)
      assert.ok(f.position.y < 0, `a koi surfaced: ${f.position.y}`);
      // and stays within a sane radius of the pond centre
      assert.ok(Math.hypot(f.position.x, f.position.z) < 3.2, 'a koi swam onto the bank');
    }
  }
  assert.equal(k.fishCount(), 5);
});

test('a koi is one mesh shaped like a fish: full shoulder, pinched peduncle, wide fan', () => {
  const L = 0.95;
  const k = makeKoi({ count: 1, seed: 30, length: L });
  const fish = k.group.children[0];
  assert.equal(fish.children.length, 1, 'one mesh per fish — no butted primitives');
  const body = bodyOf(k);
  assert.ok(body, 'no body');
  k.update(0, 0);
  // bands along the length axis (nose at +0.45L, tail tip at -0.55L). The
  // sine displacement is live, so compare with its worst case in mind: the
  // structural differences below are far larger than the wave amplitude.
  const shoulder = halfWidth(body, 0.15 * L, 0.3 * L);
  const peduncle = halfWidth(body, -0.31 * L, -0.23 * L);
  const fan = halfWidth(body, -0.6 * L, -0.5 * L);
  assert.ok(peduncle < shoulder * 0.55, `no pinch before the tail: ${peduncle} vs ${shoulder}`);
  assert.ok(fan > shoulder * 1.3, `the tail fan does not flare: ${fan} vs ${shoulder}`);
  // the fork: some tail-cap vertex sits forward of the fan tips on the spine
  const p = body.geometry.attributes.position;
  let notch = false;
  for (let v = 0; v < p.count; v++) {
    if (p.getX(v) > -0.5 * L && p.getX(v) < -0.4 * L
      && Math.abs(p.getY(v)) < 0.01 * L && Math.abs(p.getZ(v)) < 0.05 * L) notch = true;
  }
  assert.ok(notch, 'no fork notch in the trailing edge');
});

test('the swim is a travelling wave: the tail sweeps, the head barely does', () => {
  const L = 0.95;
  const k = makeKoi({ count: 1, seed: 30, length: L });
  const body = bodyOf(k);
  const p = body.geometry.attributes.position;
  // one vertex near the nose, one at the fan
  let nose = -1, tail = -1;
  for (let v = 0; v < p.count; v++) {
    if (nose < 0 && p.getX(v) > 0.4 * L) nose = v;
    if (tail < 0 && p.getX(v) < -0.5 * L) tail = v;
  }
  assert.ok(nose >= 0 && tail >= 0);
  let noseMin = Infinity, noseMax = -Infinity, tailMin = Infinity, tailMax = -Infinity;
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    k.update(1 / 60, i / 60);
    noseMin = Math.min(noseMin, p.getZ(nose)); noseMax = Math.max(noseMax, p.getZ(nose));
    tailMin = Math.min(tailMin, p.getZ(tail)); tailMax = Math.max(tailMax, p.getZ(tail));
    seen.add(+p.getZ(tail).toFixed(4));
  }
  assert.ok(seen.size > 20, `the tail never beats: ${seen.size}`);
  const noseSwing = noseMax - noseMin, tailSwing = tailMax - tailMin;
  assert.ok(tailSwing > noseSwing * 4,
    `amplitude does not grow toward the tail: head ${noseSwing}, tail ${tailSwing}`);
});

test('the flex is deterministic: same seed and simTime, same vertices', () => {
  const flex = () => {
    const k = makeKoi({ count: 2, seed: 30 });
    k.update(0, 3.7);
    return Array.from(bodyOf(k, 1).geometry.attributes.position.array,
      (x) => +x.toFixed(6));
  };
  assert.deepEqual(flex(), flex());
  const k = makeKoi({ count: 2, seed: 30 });
  k.update(0, 3.7);
  const a = Array.from(bodyOf(k, 1).geometry.attributes.position.array, (x) => +x.toFixed(6));
  k.update(0, 3.9);
  const b = Array.from(bodyOf(k, 1).geometry.attributes.position.array, (x) => +x.toFixed(6));
  assert.notDeepEqual(a, b, 'update() never moves the vertices');
});

test('two seeds give two different schools', () => {
  const swim = (seed) => {
    const k = makeKoi({ count: 4, seed });
    run(k, 4);
    return k.group.children.map((f) => +f.position.x.toFixed(5));
  };
  assert.notDeepEqual(swim(30), swim(7));
});
