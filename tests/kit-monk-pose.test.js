import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeMonk } from '../src/kit/monk.js';
import * as kit from '../src/kit/index.js';

test('default monk has no arm; point pose adds one', () => {
  const stand = makeMonk({});
  assert.equal(stand.children.find((c) => c.name === 'arm'), undefined);
  const point = makeMonk({ pose: 'point' });
  const arm = point.children.find((c) => c.name === 'arm');
  assert.ok(arm, 'point pose must add an arm');
  // arm reaches above the body (raised, gesturing up)
  const box = new THREE.Box3().setFromObject(arm);
  const bodyTop = 1.6 * 0.62;
  assert.ok(box.max.y > bodyTop, `arm should rise above the body top ${bodyTop}, got ${box.max.y}`);
});

test('kit facade re-exports the builders', () => {
  for (const fn of ['makeIsland', 'makeMonk', 'makeTree', 'makeGate', 'makeFlag', 'makeBlobShadow', 'makeLights', 'toonMaterial', 'addOutlines']) {
    assert.equal(typeof kit[fn], 'function', `kit.${fn} missing`);
  }
});
