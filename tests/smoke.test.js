import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';

test('vendored three.js loads in Node and is r185', () => {
  assert.ok(THREE.REVISION.startsWith('185'), `REVISION was ${THREE.REVISION}`);
  assert.equal(typeof THREE.CapsuleGeometry, 'function');
  assert.equal(typeof THREE.MeshToonMaterial, 'function');
});
