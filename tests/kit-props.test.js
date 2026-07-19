import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFlower } from '../src/kit/flower.js';
import { makeBowl } from '../src/kit/bowl.js';

test('makeFlower has petals and can drop them one by one', () => {
  const f = makeFlower({ petals: 6 });
  assert.equal(f.name, 'flower');
  const count = () => f.children.filter((c) => c.name === 'petal').length;
  assert.ok(f.children.some((c) => c.name === 'stem'));
  assert.equal(count(), 6);
  const p = f.dropPetal();
  assert.ok(p && p.isMesh, 'returns a detached mesh');
  assert.equal(count(), 5, 'one fewer petal on the flower');
  for (let i = 0; i < 5; i++) f.dropPetal();
  assert.equal(count(), 0);
  assert.equal(f.dropPetal(), null, 'null when empty');
});

test('makeBowl is an open bowl standing on the ground', () => {
  const b = makeBowl({ radius: 0.22 });
  assert.equal(b.name, 'bowl');
  assert.ok(b.children.some((c) => c.name === 'foot'));
  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.01, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.1 && box.max.y < 0.4, `bowl height: ${box.max.y}`);
});
