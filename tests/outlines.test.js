import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeOutlineMaterial, addOutlines } from '../src/render/outlines.js';
import { makeMonk } from '../src/kit/monk.js';

test('outline material: back side, fog uniforms, params applied', () => {
  const m = makeOutlineMaterial({ width: 0.03, wobble: 0.5 });
  assert.equal(m.side, THREE.BackSide);
  assert.equal(m.fog, true);
  assert.ok(m.uniforms.fogColor, 'fog uniforms must be merged in');
  assert.equal(m.uniforms.uWidth.value, 0.03);
});

test('addOutlines shells every mesh, sharing geometry', () => {
  const monk = makeMonk({});
  const made = addOutlines(monk, { width: 0.02 });
  assert.equal(made.length, 5); // body, 2 sleeves, head, hat
  for (const o of made) {
    assert.equal(o.userData.isOutline, true);
    assert.equal(o.geometry, o.parent.geometry, 'outline must share source geometry');
  }
});

test('addOutlines respects noOutline and never doubles up', () => {
  const monk = makeMonk({});
  monk.children.find((c) => c.name === 'hat').userData.noOutline = true;
  const made = addOutlines(monk, {});
  assert.equal(made.length, 4);
  const again = addOutlines(monk, {});
  assert.equal(again.length, 0, 'second pass must not outline outlines or re-outline');
});
