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

// The widest radius a mesh's own geometry reaches inside a y band — the
// band-scan pattern from kit-figures.test.js, used here to read the seated
// silhouette straight off the body lathe.
function maxRadiusInBand(mesh, y0, y1) {
  const pos = mesh.geometry.attributes.position;
  let r = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1) continue;
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  return r;
}

test('the seated figure has a LAP SHELF, not a bell — knees wide, lap turn, torso inset', () => {
  // Frank on the first seated profile: "like they're wearing a fat dress —
  // like they're not sitting at all." The fix is one silhouette event, read
  // back off the geometry here so it cannot quietly regress to a taper:
  //   knees — the crossed-leg block is the widest thing the figure owns;
  //   the lap — a near-horizontal turn: most of that width is gone within
  //     a very short rise above the knee top;
  //   the torso — rises visibly INSET, clearly narrower than the knees.
  const H = 1.6;
  const g = makeFigure({ stance: 'sit' });
  const body = g.children.find((c) => c.name === 'body');
  const knees = maxRadiusInBand(body, 0, 0.16 * H);          // the knee block
  const aboveLap = maxRadiusInBand(body, 0.20 * H, 0.30 * H); // just above the lap turn
  const chest = maxRadiusInBand(body, 0.30 * H, 0.42 * H);    // the torso
  assert.ok(knees > 0.30 * H, `a wide knee base: ${knees}`);
  assert.ok(aboveLap < knees * 0.55, `the lap turns in hard: ${aboveLap} vs ${knees}`);
  assert.ok(chest < knees * 0.55, `the torso rises inset above the lap: ${chest} vs ${knees}`);

  // the lap line sits at roughly 0.3 of the SEATED height (hat crown ~0.595·h)
  // and turns NEAR-HORIZONTALLY: the knee block is still full-width at
  // 0.155·h, yet by 0.19·h more than half the width is gone — a shelf, not
  // a slope
  const aboveShelf = maxRadiusInBand(body, 0.19 * H, 0.21 * H);
  assert.ok(aboveShelf < knees * 0.55, `the lap turn is a shelf, done by 0.19·h: ${aboveShelf} vs ${knees}`);

  // and the folded hands land ON the lap: each seated sleeve reaches below
  // the knee-top line (0.17·h) — cuffs buried in the lap, not hovering at
  // the chest (k17's "his hands have weird thing")
  for (const arm of g.children.filter((c) => c.name === 'arm')) {
    const box = new THREE.Box3().setFromObject(arm, true);
    assert.ok(box.min.y < 0.17 * H, `cuff rests in the lap: ${box.min.y}`);
    assert.ok(box.min.y > 0.05 * H, `cuff does not stab the ground: ${box.min.y}`);
  }
});

test('the elder\'s staff plants outside the seated hem, and the standing plant is untouched', () => {
  // The seated robe's knee crest reaches 0.320·h (SIT_PROFILE's widest ring);
  // the standing plant at 0.26·h sat INSIDE that, so every seated elder's
  // staff emerged through the cloth (k1/k10/k17/k26/k28). The seated plant
  // must clear the hem by at least the staff's own radius (0.018·h).
  const SEATED_HEM = 0.320, STAFF_R = 0.018;
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
  const KNEEL_HEM = (0.212 + 0.310) / 2;   // widest ring of the blended profile
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
