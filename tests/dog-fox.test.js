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
const isHead = (o) => o.name === 'head';
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

test("ears root on the skull: the fox's stand up from it, the dog's hang from it", () => {
  // Which way an ear runs from its root is half of what tells the two apart,
  // so it is the same measure with the sign turned over.
  for (const [label, make] of SPECIES) {
    const root = make().group;
    root.updateMatrixWorld(true);
    const skull = triangles(root, (o) => o.name === 'head');
    const ears = named(root, 'ear');
    assert.equal(ears.length, 2, `${label}: two ears`);
    for (const ear of ears) {
      const base = ear.getWorldPosition(new THREE.Vector3());
      assert.ok(inside(skull, base), `${label}: an ear's base is not buried in the skull`);
      const rise = (earTip(ear).y - base.y) * (label === 'dog' ? -1 : 1);
      assert.ok(rise > 0.6 * earShape(ear).height,
        `${label}: an ear lies out sideways — it ${label === 'dog' ? 'falls' : 'rises'} ${rise.toFixed(3)} of ${earShape(ear).height.toFixed(3)}`);
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

test("the dog's head is longer than it is tall, and a real mass against its chest", () => {
  const root = makeDog({}).group;
  const b = headBox(root);
  const long = b.max.z - b.min.z, tall = b.max.y - b.min.y;
  assert.ok(long > 1.35 * tall, `a ball: ${long.toFixed(3)} long, ${tall.toFixed(3)} tall`);
  // Bounded both ways. Under about three fifths of the chest's depth it is a
  // wedge on a stalk and the animal reads as all leg; near the chest's own
  // depth it is a puppy.
  const body = triangles(root, (o) => o.name === 'body');
  const chest = sectionY(body, trunk(root).zFront).depth;
  assert.ok(tall > 0.62 * chest,
    `a small head: ${tall.toFixed(3)} tall on a chest ${chest.toFixed(3)} deep`);
  assert.ok(tall < 0.8 * chest,
    `an oversized head: ${tall.toFixed(3)} tall on a chest ${chest.toFixed(3)} deep`);
});

test("the dog's ears hang under its crown and stand clear of its cheeks", () => {
  // Nothing of an ear above the top of the skull — points up there are the
  // fox — and a flap that hangs inside the cheek is not there at all.
  const root = makeDog({}).group;
  const head = headBox(root);
  const skull = triangles(root, isHead);
  for (const ear of named(root, 'ear')) {
    const b = new THREE.Box3().setFromObject(ear, true);
    assert.ok(b.max.y < head.max.y, `an ear stands ${(b.max.y - head.max.y).toFixed(3)} over the crown`);
    assert.ok(!inside(skull, earTip(ear)), 'an ear hangs inside the skull');
    const out = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
    assert.ok(out > head.max.x, `an ear does not clear the cheek: ${out.toFixed(3)} against ${head.max.x.toFixed(3)}`);
  }
});

test('the dog stands on legs no longer than its chest is deep, with a rump that turns down', () => {
  const root = makeDog({}).group;
  const body = triangles(root, (o) => o.name === 'body');
  const { zFront, zHind } = trunk(root);
  const chest = sectionY(body, zFront);
  assert.ok(chest.min < 0.82 * chest.depth,
    `on stilts: ${chest.min.toFixed(3)} of daylight under a chest ${chest.depth.toFixed(3)} deep`);
  // the topline most of the way out along the rump, against the croup it left
  const end = boxOf(root, (o) => o.name === 'body').min.z;
  const croup = sectionY(body, zHind).max, rump = sectionY(body, zHind + 0.85 * (end - zHind)).max;
  assert.ok(rump < 0.91 * croup,
    `a box corner: the rump still stands at ${(rump / croup).toFixed(2)} of the croup's height near its end`);
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

test("the dog's tail is carried up and back in a curve, thick at the root", () => {
  const root = makeDog({}).group;
  const tris = triangles(root, (o) => o.name === 'tail');
  const b = boxOf(root, (o) => o.name === 'tail');
  const up = b.max.y - b.min.y, back = b.max.z - b.min.z;
  assert.ok(up > 0.7 * back, `it trails: ${up.toFixed(3)} up, ${back.toFixed(3)} back`);
  // read along the part that shows: tip at 0, the rump end of it at 1
  const at = (f) => sectionY(tris, b.min.z + 0.7 * back * f);
  const mid = (s) => (s.min + s.max) / 2;
  const sag = (mid(at(0.1)) + mid(at(0.9))) / 2 - mid(at(0.5));
  assert.ok(sag > 0.08 * up, `a straight rod: its middle hangs ${sag.toFixed(4)} under its own chord`);
  // Thickness is read ACROSS, off the triangles' corners: a column through a
  // rising tube measures its slope as much as its girth.
  // As an extent, not a reach from the centreline — the idle carries the tail
  // a little to one side.
  const across = (pick) => {
    const xs = tris.flatMap((t) => [0, 3, 6].filter((k) => pick(t[k + 2])).map((k) => t[k]));
    return Math.max(...xs) - Math.min(...xs);
  };
  const rootW = across((z) => z > b.max.z - 0.4 * back), tipW = across((z) => z < b.min.z + 0.3 * back);
  assert.ok(rootW > 1.5 * tipW,
    `a spike: ${rootW.toFixed(3)} across at the root, ${tipW.toFixed(3)} toward the tip`);
});

// ---- the fox ----------------------------------------------------------------

test("the fox's head is a wedge drawn to a point, with a skull behind the muzzle", () => {
  const root = makeFox({}).group;
  const b = headBox(root);
  const long = b.max.z - b.min.z, tall = b.max.y - b.min.y;
  assert.ok(long > 1.5 * tall, `a ball: ${long.toFixed(3)} long, ${tall.toFixed(3)} tall`);
  const tris = triangles(root, isHead);
  const at = (f) => sectionY(tris, b.min.z + (b.max.z - b.min.z) * f);
  assert.ok(at(0.9).depth < 0.4 * at(0.25).depth,
    `the muzzle does not narrow: ${at(0.9).depth.toFixed(3)} vs ${at(0.25).depth.toFixed(3)}`);
  // and not a needle: a wedge with no depth at the cheek is a spout on the end
  // of the neck, however well it tapers
  const chest = sectionY(triangles(root, (o) => o.name === 'body'), trunk(root).zFront).depth;
  assert.ok(tall > 0.55 * chest,
    `a needle: a skull ${tall.toFixed(3)} tall on a chest ${chest.toFixed(3)} deep`);
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
  assert.ok(tail.max.z - tail.min.z > 1.2 * (tail.max.y - tail.min.y), 'the brush hangs');
});

test("the fox's brush falls away in an arc, as deep as the body through its middle", () => {
  // A straight brush of any thickness is a bar stuck in the animal. Three
  // things make it the one flowing shape: it ends well below the belly line
  // (and still off the ground), it is deepest in its middle rather than at
  // either end, and that depth is the body's own.
  const root = makeFox({}).group;
  const tail = boxOf(root, (o) => o.name === 'tail');
  const body = boxOf(root, (o) => o.name === 'body');
  assert.ok(tail.min.y < 0.6 * body.min.y,
    `carried straight out: its lowest point ${tail.min.y.toFixed(3)} against a belly at ${body.min.y.toFixed(3)}`);
  assert.ok(tail.min.y > 0.1 * body.min.y, `and it drags: ${tail.min.y.toFixed(3)}`);

  const tris = triangles(root, (o) => o.name === 'tail');
  const depthAt = (f) => sectionY(tris, tail.max.z - (tail.max.z - tail.min.z) * f).depth;
  let deepest = 0, where = 0;
  for (let i = 1; i < 40; i++) {
    const d = depthAt(i / 40);
    if (d > deepest) { deepest = d; where = i / 40; }
  }
  assert.ok(where > 0.25 && where < 0.75, `the swell sits ${where.toFixed(2)} of the way along`);
  const chest = sectionY(triangles(root, (o) => o.name === 'body'), trunk(root).zFront).depth;
  assert.ok(deepest > 0.85 * chest,
    `a thin brush: ${deepest.toFixed(3)} deep against a chest of ${chest.toFixed(3)}`);
  assert.ok(depthAt(0.95) < 0.35 * deepest,
    `it ends in a club: ${depthAt(0.95).toFixed(3)} near the tip, ${deepest.toFixed(3)} at its deepest`);
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
