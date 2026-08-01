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

// Max |x| / |z| a mesh's own geometry reaches inside a y band — the
// left/right vs front/back read the knee check needs.
function maxAxisInBand(mesh, y0, y1, axis) {
  const pos = mesh.geometry.attributes.position;
  let m = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1) continue;
    m = Math.max(m, Math.abs(axis === 'x' ? pos.getX(i) : pos.getZ(i)));
  }
  return m;
}

test('the seated figure folds real legs — knees at ±x, lap valley, torso inset', () => {
  // Two rounds of Frank feedback live here. Round one: "like they're wearing
  // a fat dress — like they're not sitting at all" — fixed by the lap shelf
  // (wide low block, hard lap turn, torso inset). Round two: "they need,
  // like, legs... that silhouette of someone sitting in LOTUS position" —
  // a radially symmetric block can never read as folded legs, so the body
  // is now a lathe core with two KNEE ellipsoids merged in at ±x, wider
  // than the base is deep. All of it is read back off the one merged
  // geometry so neither event can quietly regress.
  const H = 1.6;
  const g = makeFigure({ stance: 'sit' });
  const body = g.children.find((c) => c.name === 'body');

  // THE KNEES: the widest thing the figure owns, low, and LEFT/RIGHT —
  // the base must be clearly wider (±x, where the folded legs point) than
  // it is deep (±z), which is exactly what no solid of revolution can do
  const knees = maxRadiusInBand(body, 0, 0.16 * H);
  const kneeX = maxAxisInBand(body, 0, 0.16 * H, 'x');
  const kneeZ = maxAxisInBand(body, 0, 0.16 * H, 'z');
  assert.ok(knees > 0.32 * H, `a wide knee base: ${knees}`);
  assert.ok(kneeX > 0.32 * H, `knee masses reach past the cloth core: ${kneeX}`);
  assert.ok(kneeX > kneeZ * 1.25, `folded legs, not a skirt — wider than deep: ${kneeX} vs ${kneeZ}`);

  // THE LAP: a near-horizontal turn — the lap ring (0.175·h) keeps under
  // 45% of the knee width, and the run above it stays inset
  const lap = maxRadiusInBand(body, 0.17 * H, 0.20 * H);
  const aboveLap = maxRadiusInBand(body, 0.20 * H, 0.30 * H);
  assert.ok(lap > 0 && lap < knees * 0.45, `the lap turns in hard: ${lap} vs ${knees}`);
  assert.ok(aboveLap > 0 && aboveLap < knees * 0.45, `the torso rises inset: ${aboveLap} vs ${knees}`);

  // THE STRAIGHT BACK ("they should all kinda look like Buddha"): the chest
  // ring near the shoulder keeps at least 85% of the blouse ring's width —
  // a vertical run, not a slump that tapers away — and the crown of the
  // seated figure rises to 0.60·h
  const blouse = maxRadiusInBand(body, 0.255 * H, 0.275 * H);
  const chest = maxRadiusInBand(body, 0.415 * H, 0.435 * H);
  assert.ok(blouse > 0 && chest > 0, 'both torso rings exist');
  assert.ok(chest > blouse * 0.85, `the back is straight, not a droop: ${chest} vs ${blouse}`);
  assert.ok(new THREE.Box3().setFromObject(g).max.y > 0.60 * H, 'the crown rises — upright, composed');

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
  // The seated figure's widest cloth is now the KNEE reach — the merged
  // ellipsoids at ±x: x-offset 0.21·h (scaled by stout) plus the knee's own
  // half-width 0.1275·h (which is not). The standing plant at 0.26·h sat
  // INSIDE the old hem, so every seated elder's staff emerged through the
  // cloth (k1/k10/k17/k26/k28). The seated plant must clear the knee by at
  // least the staff's own radius (0.018·h).
  const kneeReach = (stout) => 0.21 * stout + 0.1275;
  const STAFF_R = 0.018;
  for (const [height, stout] of [[1.6, 1], [1.72, 1], [1.56, 1.04], [1.62, 1.08]]) {
    const g = makeFigure({ stance: 'sit', elder: true, height, stout });
    const staff = g.getObjectByName('staff');
    assert.ok(staff, 'seated elder still carries a staff named "staff"');
    assert.ok(staff.position.x > (kneeReach(stout) + STAFF_R) * height,
      `seated staff inside the knee at h=${height} s=${stout}: ${staff.position.x}`);
    assert.strictEqual(staff.position.z, 0.06 * height, 'set beside, not behind');
  }

  // The standing transform is regression-sensitive — every standing elder in
  // the book is framed around it. Bit-exact against the shipped values:
  // the same 0.26·h out, but planted 0.9 rad off the facing axis, because
  // an on-axis plant sat exactly on the camera→figure→target line whenever
  // a case aimed the elder up-scene (the grip audit: the staff "grew out of
  // his hat" in nine cases). Lean is 0.02, near-vertical — the old 0.08
  // walked the top back over the brim.
  for (const [height, stout] of [[1.6, 1], [1.66, 1], [1.72, 1.05]]) {
    const staff = makeFigure({ stance: 'stand', elder: true, height, stout }).getObjectByName('staff');
    assert.strictEqual(staff.position.x, Math.cos(0.9) * 0.26 * stout * height);
    assert.strictEqual(staff.position.y, 0);
    assert.strictEqual(staff.position.z, Math.sin(0.9) * 0.26 * stout * height + 0.06 * height);
    assert.strictEqual(staff.rotation.z, 0.02);
    // the plant still clears the standing hem (0.212·h) by the staff's own
    // radius, in the plant's own direction
    const dist = Math.hypot(staff.position.x, staff.position.z);
    assert.ok(dist > (0.212 + 0.018) * stout * height, `standing staff outside the hem: ${dist}`);
  }

  // staffAng is an override: 0 restores the old on-axis plant bit-exactly
  const onAxis = makeFigure({ stance: 'stand', elder: true, height: 1.6, staffAng: 0 }).getObjectByName('staff');
  assert.strictEqual(onAxis.position.x, 0.26 * 1.6);
  assert.strictEqual(onAxis.position.z, 0.06 * 1.6);

  // kneel sits between the two, and still clears its own (blended) hem
  const kneel = makeFigure({ stance: 'kneel', elder: true, height: 1.6 }).getObjectByName('staff');
  const KNEEL_HEM = (0.212 + 0.250) / 2;   // widest ring of the blended profile
                                           //   (kneel blends the LATHE cores; no knee lumps)
  const kneelDist = Math.hypot(kneel.position.x, kneel.position.z);
  assert.ok(kneelDist > (KNEEL_HEM + STAFF_R) * 1.6, `kneeling staff: ${kneelDist}`);
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
