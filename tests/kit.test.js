import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeIsland } from '../src/kit/island.js';
import { makeMonk, aimMonk } from '../src/kit/monk.js';
import { makeTree } from '../src/kit/tree.js';
import { makePine, pineGeometry } from '../src/kit/pine.js';
import { makeGate } from '../src/kit/gate.js';

function rimRadii(mesh, nominal) {
  const pos = mesh.geometry.attributes.position;
  const radii = [];
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > nominal * 0.7) radii.push(r);
  }
  return radii;
}

test('island rim is torn (displaced), deterministic by seed', () => {
  const a = makeIsland({ radius: 6, seed: 3 });
  const b = makeIsland({ radius: 6, seed: 3 });
  const c = makeIsland({ radius: 6, seed: 4 });
  const ra = rimRadii(a, 6);
  assert.ok(ra.length > 50, 'expected many rim vertices');
  const spread = Math.max(...ra) - Math.min(...ra);
  assert.ok(spread > 6 * 0.15, `rim spread too small: ${spread}`);
  assert.deepEqual(Array.from(a.geometry.attributes.position.array), Array.from(b.geometry.attributes.position.array));
  assert.notDeepEqual(Array.from(a.geometry.attributes.position.array), Array.from(c.geometry.attributes.position.array));
});

test('island top surface sits at y=0', () => {
  const m = makeIsland({ radius: 6, thickness: 0.55, seed: 3 });
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(Math.abs(box.max.y) < 0.01, `top at ${box.max.y}`);
  assert.ok(box.min.y < -0.4, `bottom at ${box.min.y}`);
});

test('monk has named parts (robe, sleeves, head, hat) and stands on y=0', () => {
  const m = makeMonk({ height: 1.6 });
  assert.equal(m.name, 'monk');
  const names = m.children.map((c) => c.name).sort();
  assert.deepEqual(names, ['arm', 'arm', 'body', 'hat', 'head']);
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(box.min.y > -0.01, `feet at ${box.min.y}`);
  const h = box.max.y - box.min.y;
  assert.ok(h > 1.6 * 0.6 && h < 1.6 * 1.1, `height ${h}`);
});

test('monk options: no hat, stout build', () => {
  const bare = makeMonk({ hat: false });
  assert.deepEqual(bare.children.map((c) => c.name).sort(), ['arm', 'arm', 'body', 'head']);
  const thin = makeMonk({ stout: 0.8 });
  const stout = makeMonk({ stout: 1.4 });
  const wThin = new THREE.Box3().setFromObject(thin).max.x;
  const wStout = new THREE.Box3().setFromObject(stout).max.x;
  assert.ok(wStout > wThin, 'stout should be wider');
});

test('aimMonk turns the pointing sleeve toward a target', () => {
  // convention: local +x is the point axis, so rotation.y = atan2(-dz, dx)
  const m0 = makeMonk({ pose: 'point' });
  aimMonk(m0, { x: 1, z: 0 });
  assert.ok(Math.abs(m0.rotation.y) < 1e-6, `+x → 0, got ${m0.rotation.y}`);
  aimMonk(m0, { x: 0, z: -1 });
  assert.ok(Math.abs(m0.rotation.y - Math.PI / 2) < 1e-6, `-z → π/2, got ${m0.rotation.y}`);

  // and the raised sleeve really points at the target in world space
  const target = { x: 4, z: 3 };
  const monk = makeMonk({ pose: 'point' });
  aimMonk(monk, target);
  monk.updateMatrixWorld(true);
  const arms = monk.children.filter((c) => c.name === 'arm');
  const dir = (arm) => new THREE.Vector3(0, -1, 0)
    .applyQuaternion(arm.getWorldQuaternion(new THREE.Quaternion()));
  const [dA, dB] = arms.map(dir);
  const raised = dA.y > dB.y ? dA : dB;   // the raised sleeve points upward
  const want = new THREE.Vector2(target.x, target.z).normalize();
  const got = new THREE.Vector2(raised.x, raised.z).normalize();
  assert.ok(want.dot(got) > 0.6, `sleeve bearing aligns with target: dot=${want.dot(got)}`);
});

test('tree: recursive branch skeleton + canopy, connected and deterministic by seed', () => {
  const t = makeTree({ height: 3.2, seed: 5 });
  assert.equal(t.name, 'tree');
  const trunk = t.children.find((c) => c.name === 'trunk');
  const canopy = t.children.find((c) => c.name === 'canopy');
  assert.ok(trunk && canopy, 'a merged branch mesh and a merged canopy mesh');

  // it genuinely forked: limbs reach sideways far beyond a bare trunk
  const tb = new THREE.Box3().setFromObject(trunk);
  assert.ok(tb.max.x - tb.min.x > 3.2 * 0.25, `limbs should spread, got ${tb.max.x - tb.min.x}`);
  assert.ok(trunk.geometry.attributes.position.count > 200, 'many limb segments merged into one mesh');

  // the crown overlaps the skeleton instead of floating above it
  const cb = new THREE.Box3().setFromObject(canopy);
  assert.ok(cb.min.y < tb.max.y, `canopy must overlap the limbs (canopy ${cb.min.y} vs limbs ${tb.max.y})`);

  const box = new THREE.Box3().setFromObject(t);
  assert.ok(box.min.y > -0.02, `sits on the ground, got ${box.min.y}`);
  assert.ok(box.max.y > 3.2 * 0.6, `tree too short: ${box.max.y}`);

  const leafVerts = (tree) => Array.from(
    tree.children.find((c) => c.name === 'canopy').geometry.attributes.position.array.slice(0, 60));
  assert.deepEqual(leafVerts(t), leafVerts(makeTree({ height: 3.2, seed: 5 })));
  assert.notDeepEqual(leafVerts(t), leafVerts(makeTree({ height: 3.2, seed: 6 })));
});

test('pine: tilted pads on an elbowed trunk, grounded and deterministic', () => {
  const p = makePine({ height: 4, tiers: 5, seed: 3 });
  assert.equal(p.name, 'pine');
  const box = new THREE.Box3().setFromObject(p);
  assert.ok(box.min.y > -0.02, `sits on the ground, got ${box.min.y}`);
  assert.ok(box.max.y > 4 * 0.7 && box.max.y < 4 * 1.15, `pine height, got ${box.max.y}`);
  // more than a single cone: root + 3 trunk segments + 2 knuckles + pads merged
  assert.ok(p.geometry.attributes.position.count > 100, 'tiered, not one smooth cone');
  assert.equal(p.children.length, 0, 'one mesh: a stand of these is one draw call');

  // Sampled over many seeds, because every number in this model is seeded and
  // a single seed can hide a shape that only some streams produce.
  for (const seed of [1, 3, 7, 9, 22, 35, 41]) {
    const g = pineGeometry({ height: 4, tiers: 5, seed });
    const pos = g.attributes.position;

    // The crown is narrower than the base. Measured against the top of the
    // model (y > 0.80h) rather than the old 0.72h band: the pads now hang OFF
    // the trunk to alternating sides, so a band that catches the raised outer
    // rim of a mid pad is measuring the zigzag, not the taper.
    let lowWidth = 0, highWidth = 0;
    const BANDS = 6;
    const cent = Array.from({ length: BANDS }, () => ({ x: 0, z: 0, n: 0 }));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (y < 4 * 0.35) lowWidth = Math.max(lowWidth, r);
      if (y > 4 * 0.80) highWidth = Math.max(highWidth, r);
      const b = Math.min(BANDS - 1, Math.max(0, Math.floor((y / 4) * BANDS)));
      cent[b].x += x; cent[b].z += z; cent[b].n++;
    }
    assert.ok(highWidth < lowWidth, `seed ${seed} tapers upward: crown ${highWidth} vs base ${lowWidth}`);

    // The zigzag itself: take the horizontal centre of mass of each height
    // band, project them all onto the tree's own lean axis, and require both
    // a real sideways swing AND at least one reversal of direction on the way
    // up. A cone stack scores zero on both — that is exactly the silhouette
    // this model exists not to be.
    const cs = cent.filter((c) => c.n).map((c) => [c.x / c.n, c.z / c.n]);
    let axis = cs[0];
    for (const c of cs) if (Math.hypot(...c) > Math.hypot(...axis)) axis = c;
    const len = Math.hypot(...axis) || 1;
    const proj = cs.map((c) => (c[0] * axis[0] + c[1] * axis[1]) / len);
    const swing = Math.max(...proj) - Math.min(...proj);
    let reversals = 0;
    for (let i = 2; i < proj.length; i++) {
      if (Math.sign(proj[i] - proj[i - 1]) !== Math.sign(proj[i - 1] - proj[i - 2])) reversals++;
    }
    assert.ok(swing > 4 * 0.05, `seed ${seed} leans off axis, got ${swing}`);
    assert.ok(reversals >= 1, `seed ${seed} profile reverses direction, got ${reversals}`);
  }

  // compare the whole buffer: the leading vertices are the root stub, which is
  // seed-invariant, so a short prefix would look identical for every seed
  const verts = (s) => Array.from(pineGeometry({ height: 4, tiers: 5, seed: s }).attributes.position.array);
  assert.deepEqual(verts(3), verts(3));
  assert.notDeepEqual(verts(3), verts(9));
});

test('gate: two posts, two beams, top beam overhangs', () => {
  const g = makeGate({ width: 2.4, height: 2.6 });
  assert.equal(g.name, 'gate');
  assert.equal(g.children.length, 4);
  const box = new THREE.Box3().setFromObject(g);
  assert.ok(box.max.x - box.min.x > 2.4, 'beam should overhang the posts');
  assert.ok(box.max.y >= 2.6, `gate too short: ${box.max.y}`);
  assert.ok(box.min.y > -0.01, 'gate should stand on y=0');
});
