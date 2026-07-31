import test from 'node:test';
import assert from 'node:assert';
import * as THREE from '../lib/three.module.js';
import { makeFigure } from '../src/kit/figure.js';
import { makeMonk } from '../src/kit/monk.js';

test('figure stances produce the named parts', () => {
  for (const stance of ['stand', 'sit', 'kneel']) {
    const g = makeFigure({ stance });
    for (const n of ['body', 'head']) assert.ok(g.getObjectByName(n), `${stance}: no ${n}`);
    assert.strictEqual(g.children.filter((c) => c.name === 'arm').length, 2, stance);
  }
});

test('sleeves hinge at the shoulder (geometry translated, not centred)', () => {
  const g = makeFigure({});
  const arm = g.children.find((c) => c.name === 'arm');
  // `precise` (walk the real vertices) rather than the default AABB-of-AABB.
  // A resting sleeve leans 0.28 rad off plumb, and the loose form transforms
  // the eight corners of the geometry's box — including the corner that pairs
  // the WIDE cuff radius with the TOP of the sleeve, a point no vertex of a
  // tapered cylinder actually occupies. That phantom corner swings 0.028 above
  // the shoulder and would fail this by itself, saying nothing about where the
  // hinge is. Measured against real vertices the answer is 0.015 — while a
  // centred (un-translated) sleeve gives 0.276, so the check still catches the
  // thing it is for by a factor of eighteen. Same reason k14-cat.test.js
  // passes `true` here.
  const box = new THREE.Box3().setFromObject(arm, true);
  // the mesh's origin (shoulder) must sit at the TOP of its bounds
  assert.ok(box.max.y <= arm.position.y + 0.02, 'sleeve not hinged at shoulder');
});

test('monk keeps its contract: poses, arms:false, point/raise angles distinct', () => {
  for (const pose of ['stand', 'sit', 'point', 'raise'])
    assert.ok(makeMonk({ pose }).getObjectByName('head'), pose);
  const bare = makeMonk({ arms: false });
  assert.strictEqual(bare.children.filter((c) => c.name === 'arm').length, 0);
  const arm = (m) => m.children.filter((c) => c.name === 'arm').pop();
  assert.notStrictEqual(arm(makeMonk({ pose: 'point' })).rotation.z.toFixed(3),
                        arm(makeMonk({ pose: 'raise' })).rotation.z.toFixed(3));
});
