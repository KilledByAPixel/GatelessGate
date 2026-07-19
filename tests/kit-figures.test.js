import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuddha } from '../src/kit/buddha.js';
import { makeAssembly } from '../src/kit/assembly.js';

test('makeBuddha is a seated figure with a topknot, on the ground', () => {
  const b = makeBuddha({ height: 2.0 });
  assert.equal(b.name, 'buddha');
  const names = b.children.map((c) => c.name);
  assert.ok(names.includes('body') && names.includes('head') && names.includes('ushnisha'));
  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 1.0 && box.max.y < 2.2, `seated proportion: ${box.max.y}`);
});

test('makeAssembly is one instanced, grounded, deterministic crowd', () => {
  const a = makeAssembly({ count: 8, seed: 6 });
  assert.equal(a.name, 'assembly');
  assert.ok(a.isInstancedMesh, 'a single instanced mesh');
  assert.equal(a.count, 8);
  assert.equal(a.userData.noOutline, true);
  const m = new THREE.Matrix4();
  a.getMatrixAt(0, m);
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(p.y) < 0.05, `seated on the ground: ${p.y}`);
  // deterministic
  const b = makeAssembly({ count: 8, seed: 6 });
  const m2 = new THREE.Matrix4(); b.getMatrixAt(0, m2);
  assert.deepEqual([...m.elements], [...m2.elements]);
});
