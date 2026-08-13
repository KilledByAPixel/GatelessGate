import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeMonk } from '../src/kit/monk.js';
import * as kit from '../src/kit/index.js';

test('standing monk keeps both sleeves low; point pose raises one', () => {
  const H = 1.6;
  const stand = makeMonk({ height: H });
  const standArms = stand.children.filter((c) => c.name === 'arm');
  assert.equal(standArms.length, 2, 'monk has two sleeves');
  for (const a of standArms) {
    const top = new THREE.Box3().setFromObject(a).max.y;
    assert.ok(top < H * 0.72, `hanging sleeve should stay low, got ${top}`);
  }
  const point = makeMonk({ height: H, pose: 'point' });
  const raised = point.children
    .filter((c) => c.name === 'arm')
    .map((a) => new THREE.Box3().setFromObject(a).max.y)
    .sort((x, y) => y - x)[0];
  assert.ok(raised > H * 0.75, `raised sleeve should point up, got ${raised}`);
});

test('kit facade re-exports the builders', () => {
  for (const fn of ['makeGround', 'makeMountains', 'makeForest', 'makeMonk', 'makeTree', 'makeGate', 'makeFlag', 'makeLights', 'washMaterial']) {
    assert.equal(typeof kit[fn], 'function', `kit.${fn} missing`);
  }
});

test('makeMonk pose:sit is seated (shorter) and keeps its five parts', () => {
  const stand = makeMonk({ height: 1.6 });
  const sit = makeMonk({ height: 1.6, pose: 'sit' });
  assert.deepEqual(sit.children.filter((c) => c.name !== 'staff').map((c) => c.name).sort(),
    ['arm', 'arm', 'body', 'hat', 'head']);
  const hStand = new THREE.Box3().setFromObject(stand).max.y;
  const hSit = new THREE.Box3().setFromObject(sit).max.y;
  assert.ok(hSit < hStand * 0.8, `seated shorter: ${hSit} vs ${hStand}`);
  assert.ok(new THREE.Box3().setFromObject(sit).min.y > -0.02, 'seated on ground');
});

test('makeMonk elder adds a grounded staff, and options compose', () => {
  const elder = makeMonk({ elder: true });
  assert.equal(elder.children.filter((c) => c.name === 'staff').length, 1);
  assert.ok(new THREE.Box3().setFromObject(elder).min.y > -0.02, 'staff stands on the ground');
  const sage = makeMonk({ pose: 'sit', elder: true });
  assert.ok(sage.children.some((c) => c.name === 'staff'), 'sit + elder compose');
  assert.ok(new THREE.Box3().setFromObject(sage).min.y > -0.02, 'seated elder grounded');
});
