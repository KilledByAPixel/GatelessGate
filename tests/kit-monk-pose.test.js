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
  for (const fn of ['makeIsland', 'makeGround', 'makeMountains', 'makeForest', 'makeMonk', 'makeTree', 'makeGate', 'makeFlag', 'makeBlobShadow', 'makeLights', 'toonMaterial', 'addOutlines']) {
    assert.equal(typeof kit[fn], 'function', `kit.${fn} missing`);
  }
});
