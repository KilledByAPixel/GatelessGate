import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { buildScene } from '../src/scene_m0.js';

test('buildScene composes the look-dev island', () => {
  const { scene, flag, update } = buildScene();
  assert.ok(scene.fog?.isFogExp2, 'FogExp2 required');
  assert.equal(scene.background.getHexString().toUpperCase(), 'F3EDDF');
  const names = [];
  scene.traverse((o) => names.push(o.name));
  for (const required of ['island', 'monk', 'tree', 'gate', 'flag', 'lights']) {
    assert.ok(names.includes(required), `missing ${required}`);
  }
  let outlines = 0, shadows = 0;
  scene.traverse((o) => {
    if (o.userData.isOutline) outlines++;
    if (o.name === 'blobshadow') shadows++;
  });
  assert.ok(outlines >= 10, `expected many outlines, got ${outlines}`);
  assert.equal(shadows, 4);
  // update advances the cloth
  const cloth = flag.cloth;
  const before = Array.from(cloth.positions);
  for (let i = 1; i <= 30; i++) update(1 / 60, i / 60);
  assert.notDeepEqual(Array.from(cloth.positions), before);
});
