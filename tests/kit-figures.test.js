import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuddha } from '../src/kit/buddha.js';

test('makeBuddha is a seated figure with a topknot, on the ground', () => {
  const b = makeBuddha({ height: 2.0 });
  assert.equal(b.name, 'buddha');
  const names = b.children.map((c) => c.name);
  assert.ok(names.includes('body') && names.includes('head') && names.includes('ushnisha'));
  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 1.0 && box.max.y < 2.2, `seated proportion: ${box.max.y}`);
});
