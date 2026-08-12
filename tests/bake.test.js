import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { bakeStatic } from '../src/kit/bake.js';
import { makeMonk } from '../src/kit/monk.js';
import { addOutlines } from '../src/render/outlines.js';

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

// Everything below is a thing the bake must LEAVE ALONE. The rule is the same
// in each case — it survives as an ordinary child of the baked prop, so a bake
// can never make part of a scene vanish.
test('an invisible hit proxy survives the bake', () => {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const hit = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'prop-hit';
  hit.visible = false;
  prop.add(hit);
  new THREE.Scene().add(prop);

  bakeStatic(prop);
  assert.equal(prop.children.length, 2, 'one merged mesh plus the proxy');
  assert.ok(prop.children.includes(hit), 'the proxy is untouched');
});

test('a foliage-wind mesh survives the bake', () => {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const leafy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  leafy.name = 'canopy';
  leafy.userData.foliageWind = true;      // carries wind attributes and a matched shell
  prop.add(leafy);
  new THREE.Scene().add(prop);

  bakeStatic(prop);
  assert.ok(prop.children.includes(leafy), 'the canopy keeps its own geometry');
});

test('an instanced field survives the bake', () => {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const field = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat, 20);
  field.name = 'field';
  prop.add(field);
  new THREE.Scene().add(prop);

  bakeStatic(prop);
  assert.ok(prop.children.includes(field), 'already one draw; left alone');
});

test('a geometry carrying more than position and normal survives the bake', () => {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  const rich = new THREE.BoxGeometry(1, 1, 1);
  rich.setAttribute('aSway', new THREE.BufferAttribute(
    new Float32Array(rich.attributes.position.count), 1));
  const swaying = new THREE.Mesh(rich, mat);
  swaying.name = 'swaying';
  prop.add(swaying);
  new THREE.Scene().add(prop);

  bakeStatic(prop);
  assert.ok(prop.children.includes(swaying), 'mergeSimple would have dropped aSway');
});

// ORDER IS THE CONTRACT. Baking after the ink pass would merge the shells into
// the prop and hang fresh ones on top of that — silently doubling the exact
// thing the bake exists to halve. Loud instead.
test('baking after addOutlines throws', () => {
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
  new THREE.Scene().add(prop);
  addOutlines(prop, { width: 0.03, wobble: 0.7 });

  assert.throws(() => bakeStatic(prop), /before addOutlines/i);
});

test('several props on the same material become one mesh', () => {
  const scene = new THREE.Scene();
  const monks = [];
  for (let i = 0; i < 4; i++) {
    const m = makeMonk({ height: 1.5 + i * 0.02, hat: i % 2 === 0 });
    m.position.set(i * 1.5, 0, -i);
    m.rotation.y = i * 0.4;
    scene.add(m);
    monks.push(m);
  }
  const before = worldTriangles(scene);

  const crowd = bakeStatic(monks, { name: 'crowd' });

  assertSameTriangles(before, worldTriangles(scene));
  assert.equal(crowd.name, 'crowd');
  assert.equal(crowd.parent, scene, 'it took their place in the scene');
  assert.equal(crowd.children.length, 1, 'four people, one colour, one draw');
  assert.deepEqual(crowd.userData.bakedFrom, ['monk', 'monk', 'monk', 'monk']);
  for (const m of monks) assert.equal(m.parent, null, 'the originals are gone from the scene');
});

test('props that do not share a parent are a mistake unless you say where', () => {
  const scene = new THREE.Scene();
  const nook = new THREE.Group();
  scene.add(nook);
  const a = makeMonk({ height: 1.5 });
  const b = makeMonk({ height: 1.5 });
  scene.add(a);
  nook.add(b);

  assert.throws(() => bakeStatic([a, b]), /into/);
  const crowd = bakeStatic([a, b], { into: scene, name: 'crowd' });
  assert.equal(crowd.parent, scene);
});

// The buffalo of case 24 is the motivating case: sixteen still pieces and a
// tail that swings. Without this the whole animal has to stay unbaked for the
// sake of two segments.
test('keep leaves a named subtree out of the merge, still animatable', () => {
  const scene = new THREE.Scene();
  const beast = new THREE.Group();
  beast.name = 'beast';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
    m.position.x = i * 0.5;
    beast.add(m);
  }
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-0.6, 0.5, 0);
  for (let i = 0; i < 2; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), mat);
    seg.name = 'seg';
    seg.position.y = -i * 0.3;
    tail.add(seg);
  }
  beast.add(tail);
  scene.add(beast);
  const before = worldTriangles(scene);

  bakeStatic(beast, { keep: ['tail'] });

  assertSameTriangles(before, worldTriangles(scene));
  assert.equal(beast.children.length, 2, 'one merged body plus the tail');
  const kept = beast.children.find((c) => c.name === 'tail');
  assert.ok(kept, 'the tail is still a group of its own');
  assert.equal(kept.children.length, 2, 'with both its segments');
  assert.ok(Math.abs(kept.position.x - (-0.6)) < 1e-6, 'and still where it hung');
});

// A bake clones every geometry it consumes, so the originals are garbage the
// moment they leave the scene — and a diorama that leaks a monk's worth of
// buffers on every page turn is a real cost. But geometry is sometimes SHARED,
// and one dispose would empty every mesh using it, so only geometries this
// bake alone consumed are released.
test('consumed geometries are disposed, shared ones are not', () => {
  const scene = new THREE.Scene();
  const prop = new THREE.Group();
  prop.name = 'prop';
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 });

  const lone = new THREE.BoxGeometry(1, 1, 1);
  const shared = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const a = new THREE.Mesh(lone, mat);
  const b = new THREE.Mesh(shared, mat);
  const c = new THREE.Mesh(shared, mat);
  c.position.x = 1;
  prop.add(a, b, c);
  scene.add(prop);

  let loneGone = false, sharedGone = false;
  lone.addEventListener('dispose', () => { loneGone = true; });
  shared.addEventListener('dispose', () => { sharedGone = true; });

  bakeStatic(prop);

  assert.equal(loneGone, true, 'used once, released');
  assert.equal(sharedGone, false, 'used twice — something else may hold it');
});
