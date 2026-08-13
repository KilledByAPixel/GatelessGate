import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeLights } from '../src/render/lights.js';

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
  // the frustum (2048/±10 -> 3072/±15, Frank's fifty-percent ask) so the
  // density never moved — both pairs sit at ~100/unit, and this pins that
  // the ratio survives future retunes of either number.
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
