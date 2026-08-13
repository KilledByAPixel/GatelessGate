import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeLights, aimSun, SUN_DEFAULT } from '../src/render/lights.js';

test('makeLights: a shadow-casting key, a hemisphere fill, and a tight shadow frustum', () => {
  const g = makeLights({ focus: [1.2, 0, 0.3], radius: 10 });
  const types = g.children.map((c) => c.type).sort();
  // the key's target is parented too, so the light has something to aim at
  assert.deepEqual(types, ['DirectionalLight', 'HemisphereLight', 'Object3D']);

  const sun = g.children.find((c) => c.isDirectionalLight);
  assert.equal(sun.castShadow, true);
  assert.equal(sun.shadow.mapSize.x, 3072);

  // A tight frustum is the whole point: spread over 56 units a map this size
  // stair-steps; ~100 texels/unit reads as contact shadow. The map grew with
  // the frustum (2048/±10 -> 3072/±15, half again as wide) so the density never
  // moved — both pairs sit at ~100/unit, and this pins that the ratio survives
  // future retunes of either number.
  const c = sun.shadow.camera;
  const span = c.right - c.left;
  assert.equal(span, 20);            // radius 10 was passed explicitly above
  assert.ok(sun.shadow.mapSize.x / span > 90,
    `shadow resolution ${(sun.shadow.mapSize.x / span).toFixed(0)} texels/unit is too coarse`);
  // and the DEFAULT frustum is the wider one
  const dflt = makeLights().children.find((cc) => cc.isDirectionalLight).shadow.camera;
  assert.equal(dflt.right - dflt.left, 30, 'default radius is 15 since the fifty-percent pass');

  // the key aims at the staging area, not the world origin
  assert.deepEqual(sun.target.position.toArray(), [1.2, 0, 0.3]);

  const fill = g.children.find((c) => c.isHemisphereLight);
  assert.ok(fill && fill.intensity > 0, 'a hemisphere fill, not a flat ambient');

  // shadows can be opted out of (tests, cheap mobile path)
  assert.equal(makeLights({ shadow: false }).children.find((c) => c.isDirectionalLight).castShadow, false);
});

// ---- WHERE THE KEY STANDS ---------------------------------------------------

const sunOf = (opts) => makeLights(opts).children.find((c) => c.isDirectionalLight);
const aimOf = (sun) => {
  const o = sun.position.clone().sub(sun.target.position);
  return {
    heading: Math.atan2(o.x, o.z) * 180 / Math.PI,
    pitch: Math.atan2(o.y, Math.hypot(o.x, o.z)) * 180 / Math.PI,
    height: o.y,
  };
};

test('the default aim is where the book was lit from before cases could aim it', () => {
  // Every case was lit by one hard-coded offset from its focus; the default
  // now goes through the same heading/pitch path a case's `sun:` block does,
  // and this pins that the conversion did not move the thirteen cases that
  // were kept as they were. Under a degree is well below anything visible in
  // a shadow direction.
  const focus = [1.2, 0, 0.3];
  const before = new THREE.Vector3(5.5, 9, 4.5);          // the offset it used to carry
  const after = sunOf({ focus }).position.clone().sub(new THREE.Vector3(focus[0], 0, focus[2]));
  assert.ok(after.angleTo(before) * 180 / Math.PI < 1,
    `the default key moved ${(after.angleTo(before) * 180 / Math.PI).toFixed(2)}°`);
});

test('a case gets the aim it names, in the camera block\'s own vocabulary', () => {
  for (const want of [SUN_DEFAULT, { heading: -106, pitch: 47 }, { heading: 196, pitch: 40 }]) {
    const got = aimOf(sunOf({ focus: [2, 0, -1], sun: want }));
    // heading is read back through atan2, so a value past half a turn comes
    // home wrapped — the same wrap the workbench slider applies
    const wrapped = ((want.heading + 180) % 360 + 360) % 360 - 180;
    assert.ok(Math.abs(got.heading - wrapped) < 1e-6, `heading ${got.heading} != ${wrapped}`);
    assert.ok(Math.abs(got.pitch - want.pitch) < 1e-6, `pitch ${got.pitch} != ${want.pitch}`);
  }
});

test('a low sun stands further out, not lower', () => {
  // The shadow camera's near plane clips anything ABOVE the light, so a key
  // that dropped toward the horizon as its pitch fell would slide under the
  // canopy it is meant to be casting from — and a tree that loses its shadow
  // that way fails silently. Pitch moves the light out; the height is fixed.
  const heights = [30, 45, 60, 75].map((pitch) => aimOf(sunOf({ sun: { heading: 20, pitch } })).height);
  for (const h of heights) assert.ok(Math.abs(h - heights[0]) < 1e-9, `height moved with pitch: ${heights}`);
  const reach = (pitch) => Math.hypot(...(() => {
    const s = sunOf({ sun: { heading: 20, pitch } });
    const o = s.position.clone().sub(s.target.position);
    return [o.x, o.z];
  })());
  assert.ok(reach(30) > reach(60), 'a lower sun must stand further out');
});

test('aimSun re-aims a built light — the workbench and the case share one path', () => {
  const sun = sunOf({ focus: [3, 0, -2] });
  aimSun(sun, { heading: -66, pitch: 45 });
  const got = aimOf(sun);
  assert.ok(Math.abs(got.heading + 66) < 1e-6 && Math.abs(got.pitch - 45) < 1e-6);
  // and it leaves the record the workbench adopts from
  assert.deepEqual(sun.userData.aim, { heading: -66, pitch: 45 });
});
