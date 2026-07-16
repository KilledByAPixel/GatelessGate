import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { toonRamp, toonMaterial, makeLights } from '../src/render/toon.js';

test('toonRamp is a shared 3-step nearest-filtered texture', () => {
  const r1 = toonRamp(), r2 = toonRamp();
  assert.equal(r1, r2);
  assert.equal(r1.image.width, 3);
  assert.equal(r1.image.height, 1);
  assert.equal(r1.magFilter, THREE.NearestFilter);
  assert.equal(r1.minFilter, THREE.NearestFilter);
});

test('toonMaterial uses the ramp and honors options', () => {
  const m = toonMaterial({ color: '#C73E3A', flat: true, side: THREE.DoubleSide });
  assert.equal(m.gradientMap, toonRamp());
  assert.equal(m.flatShading, true);
  assert.equal(m.side, THREE.DoubleSide);
  assert.equal(m.color.getHexString().toUpperCase(), 'C73E3A');
  const m2 = toonMaterial({ color: '#1E1E24' });
  assert.equal(m2.flatShading, false);
  assert.equal(m2.side, THREE.FrontSide);
});

test('makeLights returns directional + ambient', () => {
  const g = makeLights();
  const types = g.children.map((c) => c.type).sort();
  assert.deepEqual(types, ['AmbientLight', 'DirectionalLight']);
});
