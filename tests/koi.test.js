import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeKoi } from '../src/kit/koi.js';

const run = (o, secs, step = 1 / 60) => {
  for (let i = 0; i * step < secs; i++) o.update(step, i * step);
};

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

test('a koi has a body and a tail, and the tail beats', () => {
  const k = makeKoi({ count: 1, seed: 30 });
  const fish = k.group.children[0];
  assert.ok(fish.getObjectByName('koi-body'), 'no body');
  const tail = fish.getObjectByName('koi-tail');
  assert.ok(tail, 'no tail');
  const angles = new Set();
  for (let i = 0; i < 90; i++) { k.update(1 / 60, i / 60); angles.add(+tail.rotation.y.toFixed(3)); }
  assert.ok(angles.size > 10, `the tail never beats: ${angles.size}`);
});

test('two seeds give two different schools', () => {
  const swim = (seed) => {
    const k = makeKoi({ count: 4, seed });
    run(k, 4);
    return k.group.children.map((f) => +f.position.x.toFixed(5));
  };
  assert.notDeepEqual(swim(30), swim(7));
});
