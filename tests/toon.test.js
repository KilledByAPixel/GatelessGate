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

test('makeLights: a shadow-casting key, a hemisphere fill, and a tight shadow frustum', () => {
  const g = makeLights({ focus: [1.2, 0, 0.3], radius: 10 });
  const types = g.children.map((c) => c.type).sort();
  // the key's target is parented too, so the light has something to aim at
  assert.deepEqual(types, ['DirectionalLight', 'HemisphereLight', 'Object3D']);

  const sun = g.children.find((c) => c.isDirectionalLight);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.mapSize.x, 2048);

  // A tight frustum is the whole point: spread over 56 units a 2k map is ~36
  // texels/unit and stair-steps; over 20 it is ~100 and reads as contact shadow.
  const c = sun.shadow.camera;
  const span = c.right - c.left;
  assert.equal(span, 20);
  assert.ok(2048 / span > 90, `shadow resolution ${(2048 / span).toFixed(0)} texels/unit is too coarse`);

  // the key aims at the staging area, not the world origin
  assert.deepEqual(sun.target.position.toArray(), [1.2, 0, 0.3]);

  const fill = g.children.find((c) => c.isHemisphereLight);
  assert.ok(fill && fill.intensity > 0, 'a hemisphere fill, not a flat ambient');

  // shadows can be opted out of (tests, cheap mobile path)
  assert.equal(makeLights({ shadow: false }).children.find((c) => c.isDirectionalLight).castShadow, false);
});
