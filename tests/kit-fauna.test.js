import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeDog } from '../src/kit/dog.js';

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
