import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { bakeStatic } from '../src/kit/bake.js';
import { makeMonk } from '../src/kit/monk.js';

// THE WHOLE CORRECTNESS CLAIM, in one helper: a bake is a pure regrouping of
// triangles. Not fewer, not moved, not flipped — the same set of triangles in
// world space, differently parcelled into meshes. Every way a bake can go
// wrong (a dropped part, a mis-applied matrix, a normal left in the old
// frame) shows up as a difference here.
//
// Positions AND normals, because a merge that forgets the normal matrix looks
// perfect from the front and is lit wrong. Sorted, because the merge is free
// to reorder. Keyed at 4 decimals and compared at 1e-3 so that a key collision
// can only happen between triangles already inside the tolerance.
function worldTriangles(root) {
  root.updateWorldMatrix(true, true);
  const rows = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    nm.getNormalMatrix(o.matrixWorld);
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i += 3) {
      const row = [];
      for (let k = 0; k < 3; k++) {
        p.fromBufferAttribute(pos, i + k).applyMatrix4(o.matrixWorld);
        n.fromBufferAttribute(nor, i + k).applyMatrix3(nm).normalize();
        row.push(p.x, p.y, p.z, n.x, n.y, n.z);
      }
      rows.push(row);
    }
  });
  rows.sort((a, b) => {
    const ka = a.map((v) => v.toFixed(4)).join(',');
    const kb = b.map((v) => v.toFixed(4)).join(',');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return rows;
}

function assertSameTriangles(before, after) {
  assert.equal(after.length, before.length, 'same number of triangles');
  for (let i = 0; i < before.length; i++) {
    for (let k = 0; k < 18; k++) {
      assert.ok(Math.abs(before[i][k] - after[i][k]) < 1e-3,
        `triangle ${i} coord ${k}: ${before[i][k]} vs ${after[i][k]}`);
    }
  }
}

test('a bake is a pure regrouping of triangles', () => {
  const scene = new THREE.Scene();
  const monk = makeMonk({ height: 1.6, elder: true });
  monk.position.set(2, 0, -1);
  monk.rotation.y = 0.7;
  scene.add(monk);

  const before = worldTriangles(scene);
  bakeStatic(monk);
  const after = worldTriangles(scene);

  assertSameTriangles(before, after);
});

// A PART CAN HANG OFF ANOTHER PART. A folded arm parents its forearm to the
// upper sleeve's own MESH (figure.js: `arm.add(fore)`), so a walk that stopped
// descending at the first mesh it merged would quietly drop both forearms of
// every seated figure in the book. Only a triangle count catches that, which
// is why there is a test for it on its own.
test('parts parented to other parts are not lost', () => {
  const scene = new THREE.Scene();
  const monk = makeMonk({ height: 1.6, pose: 'fold' });
  scene.add(monk);
  const before = worldTriangles(scene);
  assert.ok(before.length > 0);

  bakeStatic(monk);

  assertSameTriangles(before, worldTriangles(scene));
});

test('a monk on one material bakes down to one mesh, in place', () => {
  const scene = new THREE.Scene();
  const monk = makeMonk({ height: 1.6, elder: true });
  scene.add(monk);
  const partsBefore = monk.children.length;
  assert.ok(partsBefore >= 5, `an elder is several parts: ${partsBefore}`);

  const out = bakeStatic(monk);

  assert.equal(out, monk, 'the single form mutates in place and returns the prop');
  assert.equal(monk.parent, scene, 'still where it was in the scene');
  assert.equal(monk.name, 'monk', 'and still called what it was called');
  assert.equal(monk.children.length, 1, 'one material, one mesh');
  assert.deepEqual(monk.userData.bakedFrom, ['monk'], 'the record of what it ate');
});

test('a baked prop still moves as a whole', () => {
  const scene = new THREE.Scene();
  const monk = makeMonk({ height: 1.6 });
  scene.add(monk);
  bakeStatic(monk);

  const box = new THREE.Box3().setFromObject(monk);
  monk.position.set(3, 0, -2);
  const moved = new THREE.Box3().setFromObject(monk);
  assert.ok(Math.abs(moved.min.x - (box.min.x + 3)) < 1e-4, 'the whole thing carries');
  assert.ok(Math.abs(moved.min.z - (box.min.z - 2)) < 1e-4);
});

test('meshes on different materials stay different meshes', () => {
  const scene = new THREE.Scene();
  const prop = new THREE.Group();
  prop.name = 'prop';
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x0000ff });
  for (const [mat, x] of [[red, 0], [red, 1], [blue, 2], [blue, 3]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    m.position.x = x;
    prop.add(m);
  }
  scene.add(prop);

  bakeStatic(prop);
  assert.equal(prop.children.length, 2, 'four meshes, two colours, two draws');
});

test('a mesh passed directly is a mistake, not a no-op', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  assert.throws(() => bakeStatic(m), /group/i);
});
