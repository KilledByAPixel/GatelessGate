import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeGround } from '../src/kit/ground.js';
import { makeMountains } from '../src/kit/mountains.js';
import { makeForest } from '../src/kit/forest.js';

test('ground rolls in the distance but stays flat at center', () => {
  const g = makeGround({ seed: 21 });
  assert.equal(g.name, 'ground');
  assert.equal(g.userData.noOutline, true);
  const pos = g.geometry.attributes.position;
  let centerMax = 0, outerMax = 0;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const y = Math.abs(pos.getY(i));
    if (r < 8) centerMax = Math.max(centerMax, y);
    if (r > 25 && r < 60) outerMax = Math.max(outerMax, y);
  }
  assert.ok(centerMax < 0.01, `center should be flat, got ${centerMax}`);
  assert.ok(outerMax > 0.3, `outer ground should roll, got ${outerMax}`);
  // deterministic
  const g2 = makeGround({ seed: 21 });
  assert.deepEqual(Array.from(g.geometry.attributes.position.array), Array.from(g2.geometry.attributes.position.array));
});

test('mountains form a distant arc of faceted cones', () => {
  const m = makeMountains({ count: 7, distance: 46, seed: 31 });
  assert.equal(m.children.length, 7);
  for (const peak of m.children) {
    assert.equal(peak.userData.noOutline, true);
    const d = Math.hypot(peak.position.x, peak.position.z);
    assert.ok(d > 46 * 0.7, `mountain too close: ${d}`);
    assert.ok(peak.position.z < 0, 'mountains sit behind the scene (-z)');
  }
  const m2 = makeMountains({ count: 7, distance: 46, seed: 31 });
  assert.deepEqual(
    m.children.map((c) => c.position.toArray()).flat(),
    m2.children.map((c) => c.position.toArray()).flat(),
  );
});

test('forest is one instanced mesh with the requested count', () => {
  const f = makeForest({ count: 40, seed: 41 });
  assert.ok(f.isInstancedMesh, 'forest must be instanced (one draw call)');
  assert.equal(f.count, 40);
  assert.equal(f.userData.noOutline, true);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  f.getMatrixAt(0, a);
  f.getMatrixAt(1, b);
  assert.notDeepEqual(Array.from(a.elements), Array.from(b.elements), 'instances vary');
});
