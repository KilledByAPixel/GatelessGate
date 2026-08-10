import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeGround, groundHeight } from '../src/kit/ground.js';
import { makeMountains } from '../src/kit/mountains.js';
import { makeForest } from '../src/kit/forest.js';
import { composeWorld, setGrassStyle } from '../src/kit/scenery.js';

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

test('composeWorld hands the case ground function through to its grass', () => {
  // The wire-through matters as much as the option: k11's fix is the CASE
  // passing composeWorld the surface its rise makes, and the field planting on
  // it. Both renderers must honour it — the debug panel swaps between them.
  const fn = (x, z) => 1.5 + 0.02 * x;
  const grassOf = (opts) => {
    const scene = new THREE.Scene();
    composeWorld(scene, { seed: 3, grass: 1200, trees: 0, rocks: 0, bushes: 0, ...opts });
    return scene.children.find((c) => c.name === 'grassfield');
  };
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  try {
    for (const style of ['tufts', 'blades']) {
      setGrassStyle(style);
      const lifted = grassOf({ groundFn: fn });
      assert.ok(lifted && lifted.count > 100, `${style}: field built (${lifted && lifted.count})`);
      for (let i = 0; i < lifted.count; i++) {
        lifted.getMatrixAt(i, m);
        m.decompose(p, q, s);
        assert.ok(Math.abs(p.y - (fn(p.x, p.z) - 0.02)) < 1e-5,
          `${style} instance ${i} stands on the case ground: y ${p.y}`);
      }
      // and WITHOUT one, the field keeps standing on the world's own terrain
      const plain = grassOf({});
      for (let i = 0; i < plain.count; i++) {
        plain.getMatrixAt(i, m);
        m.decompose(p, q, s);
        const want = groundHeight(p.x, p.z, { seed: 21 });
        assert.ok(Math.abs(p.y - want) < 1e-5,
          `${style} instance ${i} stays on the terrain: y ${p.y} vs ${want}`);
      }
    }
  } finally {
    setGrassStyle('tufts');   // the shipped default — leave the module as found
  }
});

// A case's own weather has to reach the shader AND survive the workbench. The
// second half is the whole point: debug.apply() runs on every page build in
// every mode, so while it assigned the uniforms outright a case could not have
// weather at all — whatever it asked for was overwritten on the frame its
// field was born. The panel adopts `caseWind`/`caseGustScale`/`caseGustSpeed`
// into its sliders now, so this pins the wire-through and the records the
// panel goes looking for.
test('composeWorld gives each case its own grass weather, in the sliders\' own units', () => {
  const fieldFor = (opts) => {
    const scene = new THREE.Scene();
    composeWorld(scene, { seed: 3, grass: 800, trees: 0, rocks: 0, bushes: 0, ...opts });
    return scene.children.find((c) => c.name === 'grassfield');
  };
  try {
    for (const style of ['tufts', 'blades']) {
      setGrassStyle(style);
      // no weather asked for: the field keeps the builder's own values and says
      // so, which is the panel's cue to leave its sliders alone
      const plain = fieldFor({});
      assert.equal(plain.userData.caseWind, null, `${style}: unpinned wind follows the slider`);
      assert.equal(plain.userData.caseGustScale, null, `${style}: unpinned gust patch follows the slider`);
      assert.equal(plain.userData.caseGustSpeed, null, `${style}: unpinned gust drift follows the slider`);

      // ABSOLUTE, not multipliers: 5 must mean 5 whatever the field was built
      // with, or a case reads differently depending on where a slider was left
      for (const w of [0, 0.35, 5]) {
        const f = fieldFor({ grassWind: w });
        assert.equal(f.userData.uniforms.uWind.value, w, `${style}: grassWind ${w} IS the uniform`);
        assert.equal(f.userData.caseWind, w, `${style}: grassWind ${w} is recorded for the panel`);
      }
      const gusty = fieldFor({ grassGustScale: 0.08, grassGustSpeed: 3.5 });
      assert.equal(gusty.userData.uniforms.uGustScale.value, 0.08, `${style}: gust patch pins the uniform`);
      assert.equal(gusty.userData.uniforms.uGustSpeed.value, 3.5, `${style}: gust drift pins the uniform`);
      assert.equal(gusty.userData.caseGustScale, 0.08, `${style}: gust patch recorded for the panel`);
      assert.equal(gusty.userData.caseGustSpeed, 3.5, `${style}: gust drift recorded for the panel`);
      // 0 is a real request (a dead-still scene), not "unset"
      assert.notEqual(fieldFor({ grassWind: 0 }).userData.caseWind, null, `${style}: 0 pins, not falls through`);
      assert.notEqual(fieldFor({ grassGustSpeed: 0 }).userData.caseGustSpeed, null, `${style}: drift 0 pins too`);
    }
  } finally {
    setGrassStyle('tufts');   // the shipped default — leave the module as found
  }
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
