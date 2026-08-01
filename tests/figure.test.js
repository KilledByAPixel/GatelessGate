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

test('the elder\'s staff plants outside the seated hem, and the standing plant is untouched', () => {
  // The seated robe pools out to 0.318·h (SIT_PROFILE's widest ring); the
  // standing plant at 0.26·h sat INSIDE that, so every seated elder's staff
  // emerged through the cloth (k1/k10/k17/k26/k28). The seated plant must
  // clear the hem by at least the staff's own radius (0.018·h).
  const SEATED_HEM = 0.318, STAFF_R = 0.018;
  for (const [height, stout] of [[1.6, 1], [1.72, 1], [1.56, 1.04], [1.62, 1.08]]) {
    const g = makeFigure({ stance: 'sit', elder: true, height, stout });
    const staff = g.getObjectByName('staff');
    assert.ok(staff, 'seated elder still carries a staff named "staff"');
    assert.ok(staff.position.x > (SEATED_HEM + STAFF_R) * stout * height,
      `seated staff inside the hem at h=${height} s=${stout}: ${staff.position.x}`);
    assert.strictEqual(staff.position.z, 0.06 * height, 'set beside, not behind');
  }

  // The standing transform is regression-sensitive — every standing elder in
  // the book is framed around it. Bit-exact against the shipped values.
  for (const [height, stout] of [[1.6, 1], [1.66, 1], [1.72, 1.05]]) {
    const staff = makeFigure({ stance: 'stand', elder: true, height, stout }).getObjectByName('staff');
    assert.strictEqual(staff.position.x, 0.26 * stout * height);
    assert.strictEqual(staff.position.y, 0);
    assert.strictEqual(staff.position.z, 0.06 * height);
    assert.strictEqual(staff.rotation.z, 0.08);
  }

  // kneel sits between the two, and still clears its own (blended) hem
  const kneel = makeFigure({ stance: 'kneel', elder: true, height: 1.6 }).getObjectByName('staff');
  const KNEEL_HEM = (0.200 + 0.318) / 2;   // widest ring of the blended profile
  assert.ok(kneel.position.x > (KNEEL_HEM + STAFF_R) * 1.6, `kneeling staff: ${kneel.position.x}`);
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
