import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeOutlineMaterial, addOutlines, setInkScale, getInkScale } from '../src/render/outlines.js';
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
    assert.equal(o.parent.userData.hasOutline, true, 'source mesh must be tagged hasOutline');
    assert.equal(o.geometry, o.parent.geometry, 'outline must share source geometry');
  }
});

test('ink scale: one shared uniform object drives every material live', () => {
  try {
    const a = makeOutlineMaterial({ width: 0.03 });
    const b = makeOutlineMaterial({ width: 0.01 });
    // the merge clones per-material uniforms, but uScale must be the SAME
    // object in both — that identity is what makes the dial retroactive
    assert.equal(a.uniforms.uScale, b.uniforms.uScale, 'uScale must be one shared object');
    // hull OFF is the shipped default: the depth-ink pass carries the edges,
    // and the hull comes back only when the dial is turned up
    assert.equal(a.uniforms.uScale.value, 0, 'default scale is 0 (hull off)');
    assert.equal(getInkScale(), 0, 'getInkScale reports the hull-off default');
    // per-material uniforms must NOT be shared (the merge still clones those)
    assert.notEqual(a.uniforms.uWidth, b.uniforms.uWidth, 'uWidth stays per-material');

    setInkScale(2.5);
    assert.equal(getInkScale(), 2.5, 'getInkScale round-trips');
    assert.equal(a.uniforms.uScale.value, 2.5, 'existing material a sees the change');
    assert.equal(b.uniforms.uScale.value, 2.5, 'existing material b sees the change');
    const c = makeOutlineMaterial({});
    assert.equal(c.uniforms.uScale.value, 2.5, 'new materials pick up the current scale');

    setInkScale(-3);
    assert.equal(getInkScale(), 0, 'scale clamps at zero');
  } finally {
    setInkScale(0); // leave the module in its shipped (hull-off) state
  }
});

test('ink scale: hulls hide at 0, show above it, and disposal prunes the registry', () => {
  try {
    setInkScale(0);
    const before = addOutlines(makeMonk({}), {});
    for (const o of before) assert.equal(o.visible, false, 'outlines are born hidden at scale 0');

    setInkScale(1.5);
    for (const o of before) assert.equal(o.visible, true, 'raising the scale shows outlines built BEFORE the call');
    const after = addOutlines(makeMonk({}), {});
    for (const o of after) assert.equal(o.visible, true, 'outlines born under a positive scale start visible');

    setInkScale(0);
    for (const o of [...before, ...after]) {
      assert.equal(o.visible, false, 'dropping to 0 hides them all — no zero-width shell left to z-fight');
    }

    // a torn-down scene: disposeRoot disposes every material, which must drop
    // the outline from the registry so setInkScale stops touching (or leaking) it
    const victim = before[0];
    victim.material.dispose();
    victim.visible = true; // hand-planted flag: a pruned mesh must stay untouched
    setInkScale(0);
    assert.equal(victim.visible, true, 'disposed outline has left the registry');
    assert.equal(before[1].visible, false, 'undisposed outlines are still driven');
  } finally {
    setInkScale(0); // shipped state
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
