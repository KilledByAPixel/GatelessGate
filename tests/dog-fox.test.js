import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeDog } from '../src/kit/dog.js';
import { makeFox } from '../src/kit/fox.js';
import { triangles, sectionY, inside, trunk } from './helpers/quadruped-probe.js';

// The dog and the fox share a body plan, so what tells them apart — and what
// tells either from a toy — is the head, the ears and the tail. These pin the
// silhouette of each off the meshes actually built, in world space, so they
// hold whichever construction produced the shape.

const SPECIES = [
  ['dog', () => makeDog({})],
  ['fox', () => makeFox({})],
];

// Everything that is the head's own outline, ears aside. A muzzle built as a
// separate part counts: the claims below are about the shape, and one of them
// is that there is no such part.
const isHead = (o) => o.name === 'head' || o.name === 'snout';
const named = (root, name) => {
  const out = [];
  root.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};
const boxOf = (root, pick) => {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && pick(o)) b.expandByObject(o); });
  return b;
};
const headBox = (root) => boxOf(root, isHead);
// an ear's own length and breadth, off its geometry and whatever the species
// scaled it by — the mesh's world box would mix the two under its cant
const earShape = (ear) => {
  ear.geometry.computeBoundingBox();
  const b = ear.geometry.boundingBox;
  return {
    height: (b.max.y - b.min.y) * ear.scale.y,
    width: (b.max.x - b.min.x) * ear.scale.x,
  };
};
const earTip = (ear) => {
  ear.geometry.computeBoundingBox();
  ear.updateWorldMatrix(true, false);
  return ear.localToWorld(new THREE.Vector3(0, ear.geometry.boundingBox.max.y, 0));
};

test('the head is one piece from the back of the skull to the nose', () => {
  for (const [label, make] of SPECIES) {
    const root = make().group;
    assert.equal(named(root, 'snout').length, 0, `${label}: the muzzle is a part stuck on the skull`);
    assert.equal(named(root, 'head').length, 1, `${label}: one head`);
  }
});

test('the muzzle continues the skull without a step', () => {
  // Walk the head's top outline from the crown toward the nose. A stop is a
  // slope; the front of a ball standing over a muzzle is a wall. The last of
  // the run is left out because a nose has to end somewhere.
  for (const [label, make] of SPECIES) {
    const root = make().group;
    const tris = triangles(root, isHead);
    const b = headBox(root);
    const N = 160;
    const zs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const z = b.min.z + (b.max.z - b.min.z) * (i + 0.5) / (N + 1);
      zs.push(z); ys.push(sectionY(tris, z).max);
    }
    const crown = ys.indexOf(Math.max(...ys));
    const end = crown + Math.floor((N - crown) * 0.85);
    let worst = 0, at = 0;
    for (let i = crown + 1; i <= end; i++) {
      const slope = Math.abs(ys[i] - ys[i - 1]) / (zs[i] - zs[i - 1]);
      if (slope > worst) { worst = slope; at = zs[i]; }
    }
    assert.ok(worst < 1.6,
      `${label}: the top of the head falls at ${worst.toFixed(2)} in one column at z = ${at.toFixed(3)}`);
  }
});

test('the neck ends inside the skull, at rest and with the head turned', () => {
  for (const [label, make] of SPECIES) {
    const a = make();
    const body = a.group.getObjectByName('body');
    const p = body.geometry.getAttribute('position');
    for (const turn of [0, 0.5, -0.5]) {
      a.head.rotation.y = turn;
      a.group.updateMatrixWorld(true);
      const skull = triangles(a.group, (o) => o.name === 'head');
      // the loft ends: its last ring, the rump's apex, then the apex that
      // closes the neck — the rump's is the one vertex here that is not ours
      for (let i = p.count - 10; i < p.count; i++) {
        if (i === p.count - 2) continue;
        const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld);
        assert.ok(inside(skull, v),
          `${label}: the neck's end shows outside the skull at a turn of ${turn} (vertex ${i})`);
      }
    }
  }
});

test('ears root on the skull and stand up from it', () => {
  for (const [label, make] of SPECIES) {
    const root = make().group;
    root.updateMatrixWorld(true);
    const skull = triangles(root, (o) => o.name === 'head');
    const ears = named(root, 'ear');
    assert.equal(ears.length, 2, `${label}: two ears`);
    for (const ear of ears) {
      const base = ear.getWorldPosition(new THREE.Vector3());
      assert.ok(inside(skull, base), `${label}: an ear's base is not buried in the skull`);
      const rise = earTip(ear).y - base.y;
      assert.ok(rise > 0.6 * earShape(ear).height,
        `${label}: an ear lies out sideways — it rises ${rise.toFixed(3)} of ${earShape(ear).height.toFixed(3)}`);
    }
  }
});

test('an ear stays rooted while the animal answers a touch', () => {
  // The perk and the flick turn an ear about its own base, which lifts the
  // front of its root ring. Buried only at rest, the root comes off the skull
  // on the frame the reader is looking straight at it. Probed fore and aft of
  // the base's centre; the ring's outer edge overhangs the cheek by design.
  for (const [label, make] of SPECIES) {
    const a = make();
    const ears = named(a.group, 'ear');
    for (const ear of ears) ear.geometry.computeBoundingBox();
    for (let i = 0; i < 30; i++) a.update(1 / 60, i / 60);
    a.notice();
    for (let i = 0; i < 200; i++) {
      a.update(1 / 60, (30 + i) / 60);
      a.group.updateMatrixWorld(true);
      const skull = triangles(a.group, (o) => o.name === 'head');
      for (const ear of ears) {
        const bb = ear.geometry.boundingBox;
        for (const z of [0.7 * bb.min.z, 0.7 * bb.max.z]) {
          const p = ear.localToWorld(new THREE.Vector3(0, 0, z));
          assert.ok(inside(skull, p), `${label}: an ear's root lifts off the skull ${i} frames into the response`);
        }
      }
    }
  }
});

// ---- the dog ----------------------------------------------------------------

test("the dog's head is longer than it is tall, and small against its body", () => {
  const root = makeDog({}).group;
  const b = headBox(root);
  const long = b.max.z - b.min.z, tall = b.max.y - b.min.y;
  assert.ok(long > 1.7 * tall, `a ball: ${long.toFixed(3)} long, ${tall.toFixed(3)} tall`);
  const body = triangles(root, (o) => o.name === 'body');
  const chest = sectionY(body, trunk(root).zFront).depth;
  assert.ok(tall < 0.6 * chest,
    `an oversized head: ${tall.toFixed(3)} tall on a chest ${chest.toFixed(3)} deep`);
});

test('the dog has a stop: the skull stands above the muzzle', () => {
  const root = makeDog({}).group;
  const tris = triangles(root, isHead);
  const b = headBox(root);
  const at = (f) => sectionY(tris, b.min.z + (b.max.z - b.min.z) * f);
  assert.ok(at(0.75).depth < 0.62 * at(0.3).depth,
    `the muzzle is as deep as the skull: ${at(0.75).depth.toFixed(3)} vs ${at(0.3).depth.toFixed(3)}`);
});

test("the dog's neck lifts its head clear of its back", () => {
  const root = makeDog({}).group;
  const body = triangles(root, (o) => o.name === 'body');
  const withers = sectionY(body, trunk(root).zFront).max;
  const b = headBox(root);
  assert.ok(b.min.y > withers,
    `the jaw hangs at ${b.min.y.toFixed(3)}, under withers at ${withers.toFixed(3)}`);
});

test("the dog's tail is cocked: it rises more than it trails", () => {
  const b = boxOf(makeDog({}).group, (o) => o.name === 'tail');
  const up = b.max.y - b.min.y, back = b.max.z - b.min.z;
  assert.ok(up > back, `it trails: ${up.toFixed(3)} up, ${back.toFixed(3)} back`);
});

// ---- the fox ----------------------------------------------------------------

test("the fox's head is a long low wedge drawn to a point", () => {
  const root = makeFox({}).group;
  const b = headBox(root);
  const long = b.max.z - b.min.z, tall = b.max.y - b.min.y;
  assert.ok(long > 2 * tall, `${long.toFixed(3)} long, ${tall.toFixed(3)} tall`);
  const tris = triangles(root, isHead);
  const at = (f) => sectionY(tris, b.min.z + (b.max.z - b.min.z) * f);
  assert.ok(at(0.9).depth < 0.4 * at(0.25).depth,
    `the muzzle does not narrow: ${at(0.9).depth.toFixed(3)} vs ${at(0.25).depth.toFixed(3)}`);
});

test("the fox's ears are taller than its skull, and triangles rather than spikes", () => {
  const root = makeFox({}).group;
  const b = headBox(root);
  const tall = b.max.y - b.min.y;
  for (const ear of named(root, 'ear')) {
    const e = earShape(ear);
    assert.ok(e.height > tall, `an ear ${e.height.toFixed(3)} tall on a skull ${tall.toFixed(3)} tall`);
    assert.ok(e.width > 0.5 * e.height,
      `a spike: ${e.width.toFixed(3)} across the base, ${e.height.toFixed(3)} tall`);
  }
});

test("the fox's brush is at least half the body's thickness, and carried no higher than its back", () => {
  const root = makeFox({}).group;
  const tail = boxOf(root, (o) => o.name === 'tail');
  const body = boxOf(root, (o) => o.name === 'body');
  const thick = tail.max.x - tail.min.x;
  assert.ok(thick > 0.5 * (body.max.x - body.min.x),
    `whippy: ${thick.toFixed(3)} on a body ${(body.max.x - body.min.x).toFixed(3)} across`);
  const tris = triangles(root, (o) => o.name === 'body');
  const back = sectionY(tris, trunk(root).zHind).max;
  assert.ok(tail.max.y < back + 0.02,
    `the brush stands ${(tail.max.y - back).toFixed(3)} over the back`);
  // and behind, not under: it still trails further than it drops
  assert.ok(tail.max.z - tail.min.z > 2 * (tail.max.y - tail.min.y), 'the brush hangs');
});

// ---- the pair ---------------------------------------------------------------

test('a dog and a fox are told apart by ears, tail and carriage', () => {
  const dog = makeDog({}).group, fox = makeFox({}).group;
  const earOverSkull = (root) => {
    const b = headBox(root);
    return earShape(named(root, 'ear')[0]).height / (b.max.y - b.min.y);
  };
  assert.ok(earOverSkull(fox) > 1.8 * earOverSkull(dog),
    `ears: fox ${earOverSkull(fox).toFixed(2)} of its skull, dog ${earOverSkull(dog).toFixed(2)}`);

  const tailOverBack = (root) => {
    const tris = triangles(root, (o) => o.name === 'body');
    return boxOf(root, (o) => o.name === 'tail').max.y - sectionY(tris, trunk(root).zHind).max;
  };
  assert.ok(tailOverBack(dog) > 0.05, `the dog's tail does not clear its back: ${tailOverBack(dog).toFixed(3)}`);
  assert.ok(tailOverBack(fox) < 0.02, `the fox's brush is cocked like a dog's: ${tailOverBack(fox).toFixed(3)}`);

  // the fox is the lower and the longer of the two, each against its own height
  const shape = (root) => {
    const body = boxOf(root, (o) => o.name === 'body');
    const all = boxOf(root, (o) => o.name !== 'ear');
    return { belly: body.min.y / body.max.y, run: (all.max.z - all.min.z) / body.max.y };
  };
  const d = shape(dog), f = shape(fox);
  assert.ok(f.run > 1.25 * d.run, `length over height: fox ${f.run.toFixed(2)}, dog ${d.run.toFixed(2)}`);
});
