import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeGround } from '../src/kit/ground.js';
import { makeMountains } from '../src/kit/mountains.js';
import { makeForest } from '../src/kit/forest.js';

test('ground rolls in the distance but stays flat at center', () => {
  const g = makeGround({ seed: 21 });
  assert.equal(g.name, 'ground');
  assert.equal(g.userData.noOutline, true);
  const pos = g.geometry.attributes.position;
  let centerMax = 0, outerMax = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const y = Math.abs(pos.getY(i));
    if (r < 8) centerMax = Math.max(centerMax, y);
    if (r > 25 && r < 60) outerMax = Math.max(outerMax, y);
  }
  assert.ok(centerMax < 0.01, `center should be flat, got ${centerMax}`);
  assert.ok(outerMax > 0.3, `outer ground should roll, got ${outerMax}`);
  // deterministic
  const g2 = makeGround({ seed: 21 });
  assert.deepEqual(Array.from(g.geometry.attributes.position.array), Array.from(g2.geometry.attributes.position.array));
});

test('mountains form a distant arc of faceted cones', () => {
  const m = makeMountains({ count: 7, distance: 46, seed: 31 });
  assert.equal(m.children.length, 7);
  for (const peak of m.children) {
    assert.equal(peak.userData.noOutline, true);
    const d = Math.hypot(peak.position.x, peak.position.z);
    assert.ok(d > 46 * 0.7, `mountain too close: ${d}`);
    assert.ok(peak.position.z < 0, 'mountains sit behind the scene (-z)');
  }
  const m2 = makeMountains({ count: 7, distance: 46, seed: 31 });
  assert.deepEqual(
    m.children.map((c) => c.position.toArray()).flat(),
    m2.children.map((c) => c.position.toArray()).flat(),
  );
});

test('forest mixes species into one merged mesh, still a single draw call', () => {
  // Species mixing (pine/tree/oak) replaced the old single-shape InstancedMesh
  // with every instance baked into one static merged geometry — the point
  // being that the draw-call cost stays flat (ONE mesh, not a Group of
  // per-species meshes) no matter how many trees or species the stand mixes.
  const f = makeForest({ count: 40, seed: 41 });
  assert.ok(f.isMesh, 'forest is a Mesh');
  assert.ok(!f.isInstancedMesh, 'no longer instanced — species vary the geometry itself');
  assert.equal(f.children.length, 0, 'one mesh, not a group of per-species meshes');
  assert.equal(f.name, 'forest');
  assert.equal(f.userData.noOutline, true);
  assert.ok(f.geometry.attributes.position.count > 0);
  // deterministic: same seed -> byte-identical merged geometry
  const f2 = makeForest({ count: 40, seed: 41 });
  assert.deepEqual(
    Array.from(f.geometry.attributes.position.array),
    Array.from(f2.geometry.attributes.position.array),
  );
  // draw-call cost doesn't grow with `count` or with species variety
  const bigger = makeForest({ count: 90, seed: 41 });
  assert.ok(bigger.isMesh && !bigger.isInstancedMesh && bigger.children.length === 0);
});

test('forest count scales the built geometry, and instances actually spread out', () => {
  // The old InstancedMesh-based test pinned `count` via `f.count` (an actual
  // instance count the object carried) and placement variety via comparing
  // two instances' matrices directly. Neither reads off the new merged-mesh
  // contract — there is no `.count` and no per-instance matrix any more — so
  // both guarantees have to be re-earned against vertex data instead. This
  // closes a real gap the mesh/material/determinism test above left open: it
  // never actually proved `count` does anything, or that instances land
  // anywhere other than on top of each other.

  // (a) count scaling: a bigger forest must contain more geometry. Manually
  // verified at these exact counts/seed: 40 -> 78,408 vertices, 90 -> 181,608
  // — comfortably in the same ratio as the requested counts. Asserting the
  // relationship (not the exact numbers) keeps this from breaking on a
  // legitimate future retune of template detail (lobe counts, tree depth).
  const small = makeForest({ count: 40, seed: 41 });
  const big = makeForest({ count: 90, seed: 41 });
  const smallN = small.geometry.attributes.position.count;
  const bigN = big.geometry.attributes.position.count;
  assert.ok(bigN > smallN, `bigger count should mean more vertices: ${smallN} (count 40) vs ${bigN} (count 90)`);

  // (b) placement variety: if every instance collapsed onto the same spot (a
  // "single repeated block" bug — e.g. the placement matrix silently stopped
  // being applied), a stand's bounding box would be no bigger than one tree's
  // own footprint, however many vertices it has. `spread` defaults to a
  // 16-unit-radius ring, so a real stand's horizontal footprint should dwarf
  // a lone tree's by a wide margin.
  const one = makeForest({ count: 1, seed: 41 });
  const oneSize = new THREE.Box3().setFromBufferAttribute(one.geometry.attributes.position).getSize(new THREE.Vector3());
  const standSize = new THREE.Box3().setFromBufferAttribute(small.geometry.attributes.position).getSize(new THREE.Vector3());
  const oneSpan = Math.hypot(oneSize.x, oneSize.z);
  const standSpan = Math.hypot(standSize.x, standSize.z);
  assert.ok(
    standSpan > oneSpan * 3,
    `a 40-tree stand should spread far wider than one tree's own footprint: one=${oneSpan.toFixed(2)} stand=${standSpan.toFixed(2)}`,
  );
});
