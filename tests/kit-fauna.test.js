import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeDog } from '../src/kit/dog.js';
import { makeTail } from '../src/kit/tail.js';

test('makeDog is a grounded quadruped with named parts', () => {
  const d = makeDog({ height: 0.5 });
  assert.equal(d.name, 'dog');
  const names = d.children.map((c) => c.name);
  assert.equal(names.filter((n) => n === 'leg').length, 4, 'four legs');
  assert.ok(names.includes('body') && names.includes('head') && names.includes('tail'));
  const box = new THREE.Box3().setFromObject(d);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.3 && box.max.y < 0.9, `dog-sized: ${box.max.y}`);
});

test('makeTail hangs, swishes on impulse, and settles', () => {
  const t = makeTail({ segments: 7, length: 1.0 });
  assert.equal(t.group.name, 'tail');
  for (let i = 0; i < 60; i++) t.update(1 / 60, i / 60);   // let it settle hanging
  const rest = t.energy();
  assert.ok(rest < 1e-3, `settles near still: ${rest}`);
  t.impulse(1);
  t.update(1 / 60, 1);
  assert.ok(t.energy() > rest, 'impulse adds motion');
  // tip hangs below the root once settled
  for (let i = 0; i < 120; i++) t.update(1 / 60, 2 + i / 60);
  const p = t.group.userData.cloth.positions;
  const tipY = p[(7 - 1) * 3 + 1];
  assert.ok(tipY < -0.3, `tip hangs below root: ${tipY}`);
});
