import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFlower } from '../src/kit/flower.js';
import { makeBowl } from '../src/kit/bowl.js';
import { makeWater } from '../src/kit/water.js';
import { makeHut } from '../src/kit/hut.js';
import { makeLattice } from '../src/kit/lattice.js';
import { makeStall } from '../src/kit/stall.js';

test('makeFlower is a two-ring lotus and can drop petals one by one', () => {
  // `petals` is the OUTER ring; the inner ring is two fewer. The layering is
  // what reads as a lotus rather than a daisy, so it is worth asserting.
  const f = makeFlower({ petals: 7 });
  assert.equal(f.name, 'flower');
  const count = () => f.children.filter((c) => c.name === 'petal').length;
  assert.ok(f.children.some((c) => c.name === 'stem'));
  assert.ok(f.children.some((c) => c.name === 'pod'), 'a seed pod at the heart');
  const TOTAL = 7 + 5;
  assert.equal(count(), TOTAL);

  // the outer ring opens out further than the inner one
  const tilts = f.children.filter((c) => c.name === 'petal').map((p) => {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(p.quaternion);
    return Math.acos(Math.max(-1, Math.min(1, up.y)));   // radians from vertical
  }).sort((a, b) => a - b);
  assert.ok(tilts[0] < 0.8, `inner ring still cupped: ${tilts[0].toFixed(2)}`);
  assert.ok(tilts[TOTAL - 1] > 1.0, `outer ring opened out: ${tilts[TOTAL - 1].toFixed(2)}`);

  const p = f.dropPetal();
  assert.ok(p && p.isMesh, 'returns a detached mesh');
  assert.equal(count(), TOTAL - 1, 'one fewer petal on the flower');
  for (let i = 0; i < TOTAL - 1; i++) f.dropPetal();
  assert.equal(count(), 0);
  assert.equal(f.dropPetal(), null, 'null when empty');
});

test('dropPetal returns the petal at its world position (for reparenting)', () => {
  const f = makeFlower({ petals: 6 });
  const holder = new THREE.Group();
  holder.position.set(2, 1, -3);
  holder.add(f);
  f.position.set(0.5, 0, 0);
  holder.updateWorldMatrix(true, true);
  const before = f.children.find((c) => c.name === 'petal').getWorldPosition(new THREE.Vector3());
  const petal = f.dropPetal();
  assert.ok(petal.position.distanceTo(before) < 1e-6, 'petal keeps its world position after detaching');
});

test('makeBowl is an open bowl standing on the ground', () => {
  const b = makeBowl({ radius: 0.22 });
  assert.equal(b.name, 'bowl');
  assert.ok(b.children.some((c) => c.name === 'foot'));
  assert.ok(b.children.some((c) => c.name === 'shell'), 'shell child name is distinct from the group');
  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.01, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.1 && box.max.y < 0.4, `bowl height: ${box.max.y}`);
});

test('makeWater is a flat surface that ripples on demand', () => {
  const w = makeWater({ size: 2 });
  assert.equal(w.group.name, 'water');
  const surface = w.group.children.find((c) => c.name === 'surface');
  assert.ok(surface, 'water has a surface mesh');
  const box = new THREE.Box3().setFromObject(surface);
  assert.ok(Math.abs(box.max.y) < 0.05 && Math.abs(box.min.y) < 0.05, 'flat at y=0');
  assert.equal(w.rippleCount(), 0);
  w.ripple(0, 0);
  assert.equal(w.rippleCount(), 1, 'a ring appears');
  for (let i = 0; i < 720; i++) w.update(1 / 60, i / 60);
  assert.equal(w.rippleCount(), 0, 'the ring expires');
});

test('makeHut is a roofed hall on the ground, and cheap to draw', () => {
  const hut = makeHut({ width: 2.4, height: 2.2, depth: 2.0 });
  assert.equal(hut.name, 'hut');

  // The four corner posts are ONE merged mesh, not four children — same reason
  // makeLattice bakes its bars: every mesh is a draw call, and the hall
  // appears in fourteen cases, two of them twice. They stay a mesh of their
  // own rather than joining the walls because they are the one round,
  // smooth-shaded part of the building.
  const posts = hut.children.filter((c) => c.name === 'post');
  assert.equal(posts.length, 1, 'the posts are merged');
  assert.equal(posts[0].children.length, 0, 'no child meshes to draw separately');
  const pb = new THREE.Box3().setFromObject(posts[0]);
  assert.ok(pb.min.x < -1.0 && pb.max.x > 1.0, 'a post at each end of the width');
  assert.ok(pb.min.z < -0.8 && pb.max.z > 0.8, 'and at each end of the depth');
  assert.ok(pb.max.y >= 2.2 - 0.02, 'full height');

  // ...and there are FOUR of them, not two on a diagonal. The bounding box above
  // cannot tell those apart, so bucket the merged mesh's own vertices by which
  // corner they belong to: each post is well clear of both centre planes, so
  // sign(x)/sign(z) partitions them cleanly. All four buckets must exist, carry
  // an equal share of the geometry, stand at their own corner, and reach the
  // eave — a merge that silently dropped a post fails all four ways.
  const pos = posts[0].geometry.attributes.position;
  assert.equal(pos.count % 4, 0, 'four equal posts share the merged geometry');
  const quads = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.sign(x)},${Math.sign(z)}`;
    const q = quads.get(key) || { n: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: -Infinity };
    q.n++;
    q.minX = Math.min(q.minX, x); q.maxX = Math.max(q.maxX, x);
    q.minZ = Math.min(q.minZ, z); q.maxZ = Math.max(q.maxZ, z);
    q.maxY = Math.max(q.maxY, y);
    quads.set(key, q);
  }
  assert.deepEqual([...quads.keys()].sort(), ['-1,-1', '-1,1', '1,-1', '1,1'],
    `a post in each corner, got ${[...quads.keys()].sort()}`);
  for (const [key, q] of quads) {
    const [sx, sz] = key.split(',').map(Number);
    assert.equal(q.n, pos.count / 4, `corner ${key} carries its quarter of the merge`);
    assert.ok(q.maxY >= 2.2 - 0.02, `corner ${key} reaches the eave: ${q.maxY}`);
    // the post's axis sits on the corner of the plan, within its own radius
    const cx = (q.minX + q.maxX) / 2, cz = (q.minZ + q.maxZ) / 2;
    assert.ok(Math.abs(cx - sx * 2.4 / 2) < 0.02, `corner ${key} is on the width: ${cx}`);
    assert.ok(Math.abs(cz - sz * 2.0 / 2) < 0.02, `corner ${key} is on the depth: ${cz}`);
  }

  // the whole hall stays inside a small, fixed mesh budget
  const meshes = [];
  hut.traverse((o) => { if (o.isMesh) meshes.push(o.name); });
  assert.ok(meshes.length <= 6, `hall draws ${meshes.length} meshes: ${meshes}`);

  const roof = hut.children.find((c) => c.name === 'roof');
  assert.ok(roof, 'has a roof');
  const box = new THREE.Box3().setFromObject(hut);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(roof.position.y > 2.0, 'roof up top');
  // the eave carries well past the walls it covers
  assert.ok(box.max.x > 2.4 / 2 + 0.25, `deep overhang: ${box.max.x}`);
  // and the door is a solid, dark panel — an open void looks straight through
  // the hall at lit ground and blows out to paper-white
  const doorway = hut.children.find((c) => c.name === 'doorway');
  const wall = hut.children.find((c) => c.name === 'wall');
  assert.ok(doorway, 'the doorway is closed');
  const lum = (m) => m.material.color.r + m.material.color.g + m.material.color.b;
  assert.ok(lum(doorway) < lum(wall) * 0.6,
    'and reads well darker than the wall it sits in');
});

test('makeLattice is a single merged mesh, framed and full height', () => {
  const l = makeLattice({ width: 2.2, height: 2.0, bars: 5 });
  assert.equal(l.name, 'lattice');
  // one mesh, not a group of bars: every mesh is a draw call, so a lattice
  // made of dozens of children would cost dozens of draws
  assert.ok(l.isMesh, 'merged into one mesh');
  assert.equal(l.children.length, 0, 'no child meshes to draw separately');
  assert.deepEqual(l.userData.lattice, { width: 2.2, height: 2.0, bars: 5 });
  const box = new THREE.Box3().setFromObject(l);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(box.max.y >= 2.0 - 0.05, 'full height');
  assert.ok(box.max.x <= 2.2 / 2 + 0.02 && box.min.x >= -2.2 / 2 - 0.02, 'within its width');
});

// ---- the stall ------------------------------------------------------------
// The cloth sloped the wrong way — up toward the lane — so the tall rear posts
// stood through it as two blocks above the roof, and it was thin enough to
// vanish edge-on. These measure the awning's top surface and hold the frame
// under it.
function stallParts(opts) {
  const s = makeStall(opts);
  s.updateMatrixWorld(true);
  const world = (mesh, keep = () => true) => {
    const p = mesh.geometry.attributes.position, out = [];
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      if (keep(v)) out.push(v.applyMatrix4(mesh.matrixWorld));
    }
    return out;
  };
  const awning = s.getObjectByName('stall-awning');
  awning.geometry.computeBoundingBox();
  const ab = awning.geometry.boundingBox;
  const thick = ab.max.y - ab.min.y;
  // the top face's rear and front edges, in the world
  const top = world(awning, (v) => v.y > ab.max.y - 1e-6);
  const rear = top.reduce((a, b) => (b.z < a.z ? b : a));
  const front = top.reduce((a, b) => (b.z > a.z ? b : a));
  const topAt = (z) => rear.y + (front.y - rear.y) * (z - rear.z) / (front.z - rear.z);
  return { frame: world(s.getObjectByName('stall-frame')), thick, rear, front, topAt };
}

test('the stall awning is the top of the stall: it dips to the lane and nothing stands through it', () => {
  for (const opts of [{}, { width: 2.4, depth: 1.2, height: 2.0, seed: 52 }, { width: 1.5, height: 1.8 }]) {
    const { frame, rear, front, topAt } = stallParts(opts);
    assert.ok(front.y < rear.y - 0.1, `the front edge is the low one: front ${front.y}, rear ${rear.y}`);
    let worst = -Infinity;
    for (const v of frame) worst = Math.max(worst, v.y - topAt(v.z));
    assert.ok(worst <= 1e-3, `no timber above the cloth, worst is ${worst} over it`);
  }
});

test('the stall awning has an edge to see, on slim posts that reach it', () => {
  const width = 1.8, height = 2.0;
  const { frame, thick, topAt } = stallParts({ width, height });
  assert.ok(thick >= height * 0.04, `a roof has a thickness, got ${thick}`);

  // the four posts are the only timber on the ground; take them by their feet
  const feet = frame.filter((v) => v.y < 1e-6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const f = feet.filter((v) => Math.sign(v.x) === sx && Math.sign(v.z) === sz);
      assert.ok(f.length > 0, 'a post in each corner');
      const xs = f.map((v) => v.x), zs = f.map((v) => v.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      assert.ok(x1 - x0 < width * 0.07, `a post, not a pier: ${x1 - x0} across on a ${width} stall`);
      // the tallest timber standing in that footprint is the post's own head
      const head = Math.max(...frame
        .filter((v) => v.x >= x0 - 1e-6 && v.x <= x1 + 1e-6 && v.z >= z0 - 1e-6 && v.z <= z1 + 1e-6)
        .map((v) => v.y));
      const gap = topAt((z0 + z1) / 2) - head;
      assert.ok(gap >= 0 && gap < thick * 1.3, `the post ends in the cloth, ${gap} below its top`);
    }
  }
});
