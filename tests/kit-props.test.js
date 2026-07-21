import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFlower } from '../src/kit/flower.js';
import { makeBowl } from '../src/kit/bowl.js';
import { makeWater } from '../src/kit/water.js';
import { makeHut } from '../src/kit/hut.js';
import { makeLattice } from '../src/kit/lattice.js';

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
  assert.ok(surface && surface.userData.noOutline, 'surface skips outlines');
  const box = new THREE.Box3().setFromObject(surface);
  assert.ok(Math.abs(box.max.y) < 0.05 && Math.abs(box.min.y) < 0.05, 'flat at y=0');
  assert.equal(w.rippleCount(), 0);
  w.ripple(0, 0);
  assert.equal(w.rippleCount(), 1, 'a ring appears');
  for (let i = 0; i < 240; i++) w.update(1 / 60, i / 60);
  assert.equal(w.rippleCount(), 0, 'the ring expires');
});

test('makeHut is a roofed threshold on the ground', () => {
  const hut = makeHut({ width: 2.4, height: 2.2, depth: 2.0 });
  assert.equal(hut.name, 'hut');
  assert.equal(hut.children.filter((c) => c.name === 'post').length, 4, 'four posts');
  const roof = hut.children.find((c) => c.name === 'roof');
  assert.ok(roof, 'has a roof');
  const box = new THREE.Box3().setFromObject(hut);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(roof.position.y > 2.0, 'roof up top');
});

test('makeLattice is a framed bar grid on the ground', () => {
  const l = makeLattice({ width: 2.2, height: 2.0, bars: 5 });
  assert.equal(l.name, 'lattice');
  assert.equal(l.children.filter((c) => c.name === 'rail').length, 4, 'a four-sided frame');
  assert.ok(l.children.filter((c) => c.name === 'bar').length >= 5, 'has bars');
  const box = new THREE.Box3().setFromObject(l);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(box.max.y >= 2.0 - 0.05, 'full height');
});
