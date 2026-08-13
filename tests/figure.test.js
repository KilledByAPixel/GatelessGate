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
  // The mesh's origin (shoulder) must sit at the top of its CLOTH — only the
  // SHOULDER BALL (r = r0·1.35·h, merged at the hinge to bury the arm/body
  // join at any pose) may crest above it. An un-translated (centred) sleeve
  // overshoots this bound by ~0.19, so the check still catches what it is for.
  const ballR = 0.035 * 1.22 * 1.6;
  assert.ok(box.max.y <= arm.position.y + ballR + 0.01, 'sleeve not hinged at shoulder');
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
  // Two rounds of feedback live here. Round one: the figure read as wearing a
  // fat dress rather than sitting at all — fixed by the lap shelf (wide low
  // block, hard lap turn, torso inset). Round two: it still had no LEGS, and
  // lotus is a silhouette with knees in it — a radially symmetric block can
  // never read as folded legs, so the body is now a lathe core with two KNEE
  // ellipsoids merged in at ±x, wider than the base is deep. All of it is read
  // back off the one merged geometry so neither event can quietly regress.
  const H = 1.6;
  const g = makeFigure({ stance: 'sit' });
  const body = g.children.find((c) => c.name === 'body');

  // THE KNEES: the widest thing the figure owns, low, and LEFT/RIGHT — the base
  // must be clearly wider (±x, where the folded legs point) than it is deep
  // (±z), which is exactly what no solid of revolution can do (Round three
  // yawed the knee masses forward; round five made the base an honest CUSHION —
  // a flat zabuton at y=0 with cheeks and shins resting on it. The leg claims
  // are measured ABOVE the cushion band so they read the body, not the
  // furniture.)
  const cushion = maxRadiusInBand(body, 0, 0.044 * H);
  assert.ok(cushion > 0.23 * H, `a real zabuton, wider than the robe: ${cushion}`);
  const knees = maxRadiusInBand(body, 0.05 * H, 0.16 * H);
  const kneeX = maxAxisInBand(body, 0.05 * H, 0.16 * H, 'x');
  const kneeZ = maxAxisInBand(body, 0.05 * H, 0.16 * H, 'z');
  assert.ok(knees > 0.28 * H, `a wide knee base: ${knees}`);
  assert.ok(kneeX > 0.28 * H, `knee masses reach past the cloth core: ${kneeX}`);
  assert.ok(kneeX > cushion, `the knees still out-reach the cushion rim: ${kneeX} vs ${cushion}`);
  assert.ok(kneeX > kneeZ * 1.1, `folded legs, not a skirt — wider than deep: ${kneeX} vs ${kneeZ}`);

  // THE LAP: a near-horizontal turn — the lap ring (0.175·h) keeps well
  // under the knee width, and the run above it stays inset. Measured in ±z:
  // the raised knee crests share this y band at ±x, so depth is what reads
  // the lathe's own inset — the valley between the knees.
  const lap = maxAxisInBand(body, 0.17 * H, 0.20 * H, 'z');
  const aboveLap = maxRadiusInBand(body, 0.20 * H, 0.30 * H);
  assert.ok(lap > 0 && lap < knees * 0.52, `the lap turns in hard: ${lap} vs ${knees}`);
  assert.ok(aboveLap > 0 && aboveLap < knees * 0.52, `the torso rises inset: ${aboveLap} vs ${knees}`);

  // THE STRAIGHT BACK, the way the Buddha's is: the chest ring near the
  // shoulder keeps at least 85% of the blouse ring's width — a vertical run,
  // not a slump that tapers away — and the crown of the seated figure rises to
  // 0.60·h
  const blouse = maxRadiusInBand(body, 0.255 * H, 0.275 * H);
  const chest = maxRadiusInBand(body, 0.415 * H, 0.435 * H);
  assert.ok(blouse > 0 && chest > 0, 'both torso rings exist');
  assert.ok(chest > blouse * 0.85, `the back is straight, not a droop: ${chest} vs ${blouse}`);
  assert.ok(new THREE.Box3().setFromObject(g).max.y > 0.60 * H, 'the crown rises — upright, composed');

  // and the folded hands land ON the lap: each seated arm (now two-piece,
  // with the forearm's cuff gathered to the centre) reaches down to the lap
  // shelf (0.175·h) — resting on it, neither hovering at the chest (k17's
  // "his hands have weird thing") nor stabbing the ground
  for (const arm of g.children.filter((c) => c.name === 'arm')) {
    const box = new THREE.Box3().setFromObject(arm, true);
    assert.ok(box.min.y < 0.19 * H, `cuff rests on the lap: ${box.min.y}`);
    assert.ok(box.min.y > 0.05 * H, `cuff does not stab the ground: ${box.min.y}`);
  }
});

test('a seated elder SETS HIS STAFF DOWN; the standing plant is untouched', () => {
  // Planted upright beside a man on the ground, the staff read as a pole stuck
  // in the earth next to him rather than as something he set down. Seated, it
  // now LIES on the ground within reach: the shaft horizontal, resting on the
  // plane rather than sunk into it, and every point of it clear of the CUSHION
  // it lies beside (radius 0.26·h, scaled by stout) — at ground level the
  // zabuton is what it could foul, the way the upright plant had to clear the
  // hem.
  const seatReach = (stout) => 0.26 * stout;
  const STAFF_R = 0.018;
  for (const [height, stout] of [[1.6, 1], [1.72, 1], [1.56, 1.04], [1.62, 1.08]]) {
    const g = makeFigure({ stance: 'sit', elder: true, height, stout });
    const staff = g.getObjectByName('staff');
    assert.ok(staff, 'seated elder still carries a staff named "staff"');
    const near = new THREE.Box3().setFromObject(staff, true).min.x;
    assert.ok(near > (seatReach(stout) + STAFF_R) * height,
      `seated staff over the cushion at h=${height} s=${stout}: ${near}`);
    // LYING DOWN: the whole shaft is within a couple of radii of the ground
    const box = new THREE.Box3().setFromObject(staff, true);
    assert.ok(box.max.y < 3 * STAFF_R * height,
      `the staff lies flat at h=${height}: top at ${box.max.y}`);
    assert.ok(box.min.y > -1e-6, `and rests ON the ground, not in it: ${box.min.y}`);
    // and it is a real length of wood laid out, not a stub seen end-on
    const run = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    assert.ok(run > 0.5 * height, `laid out at its full length: ${run}`);
  }

  // The standing transform is regression-sensitive — every standing elder in
  // the book is framed around it. Bit-exact against the shipped values: the
  // same 0.26·h out on a polar plant swung `STAND_ANG` off the facing axis,
  // because an on-axis plant sat exactly on the camera→figure→target line
  // whenever a case aimed the elder up-scene (the grip audit: the staff "grew
  // out of his hat" in nine cases). Lean is 0.02, near-vertical — the old 0.08
  // walked the top back over the brim. (The bearing was retuned 0.9 -> 0.2 and
  // the old +0.06·h forward nudge dropped in 0165d91; the invariant that
  // matters — planted, upright, outside the hem — is asserted below.)
  const STAND_ANG = 0.2;
  for (const [height, stout] of [[1.6, 1], [1.66, 1], [1.72, 1.05]]) {
    const staff = makeFigure({ stance: 'stand', elder: true, height, stout }).getObjectByName('staff');
    assert.strictEqual(staff.position.x, Math.cos(STAND_ANG) * 0.26 * stout * height);
    assert.strictEqual(staff.position.y, 0);
    assert.strictEqual(staff.position.z, Math.sin(STAND_ANG) * 0.26 * stout * height);
    assert.strictEqual(staff.rotation.z, 0.02);
    // the plant still clears the standing hem (0.212·h) by the staff's own
    // radius, in the plant's own direction
    const dist = Math.hypot(staff.position.x, staff.position.z);
    assert.ok(dist > (0.212 + 0.018) * stout * height, `standing staff outside the hem: ${dist}`);
  }

  // staffAng is an override: 0 puts the plant straight out along +x
  const onAxis = makeFigure({ stance: 'stand', elder: true, height: 1.6, staffAng: 0 }).getObjectByName('staff');
  assert.strictEqual(onAxis.position.x, 0.26 * 1.6);
  assert.strictEqual(onAxis.position.z, 0);

  // kneel sits between the two, and still clears its own (blended) hem
  const kneel = makeFigure({ stance: 'kneel', elder: true, height: 1.6 }).getObjectByName('staff');
  const KNEEL_HEM = (0.212 + 0.250) / 2;   // widest ring of the blended profile
                                           //   (kneel blends the LATHE cores; no knee lumps)
  const kneelDist = Math.hypot(kneel.position.x, kneel.position.z);
  assert.ok(kneelDist > (KNEEL_HEM + STAFF_R) * 1.6, `kneeling staff: ${kneelDist}`);
});

test('monk keeps its contract: poses, arms always, point/raise angles distinct', () => {
  for (const pose of ['stand', 'sit', 'point', 'raise'])
    assert.ok(makeMonk({ pose }).getObjectByName('head'), pose);
  // EVERY figure has arms, in every pose. This used to assert the opposite for
  // `arms: false` — the cheap-crowd opt-out — which bakeStatic made pointless
  // and which was retired: nobody should be getting rid of arms. Passing the
  // dead option must not resurrect it as a way to lose them. Counted by
  // TRAVERSAL, not by direct children: the bow re-parents everything above the
  // sash into a 'waist' group, arms included.
  const armCount = (m) => {
    let n = 0;
    m.traverse((c) => { if (c.name === 'arm') n++; });
    return n;
  };
  for (const pose of ['stand', 'sit', 'point', 'raise', 'fold', 'bow'])
    assert.strictEqual(armCount(makeMonk({ pose })), 2, `${pose} keeps both arms`);
  assert.strictEqual(armCount(makeMonk({ arms: false })), 2,
    'the retired arms option is inert, not a back door');
  const arm = (m) => m.children.filter((c) => c.name === 'arm').pop();
  assert.notStrictEqual(arm(makeMonk({ pose: 'point' })).rotation.z.toFixed(3),
                        arm(makeMonk({ pose: 'raise' })).rotation.z.toFixed(3));
});

test('the bow is a HINGE AT THE WAIST, forward, with the hem left standing', () => {
  // Case 32's philosopher bowed about the WRONG AXIS — listing sideways rather
  // than folding forward at the waist, which is what a bow is and why it earns
  // its own pose. So `bow` gives the figure a group named 'waist' holding
  // everything above the sash, and turning it IS the bow.
  const H = 1.66;
  const upright = makeFigure({ height: H, arms: 'fold', hat: false, bow: true });
  const waist = upright.getObjectByName('waist');
  assert.ok(waist, 'a bowing figure carries a waist hinge');
  assert.ok(waist.getObjectByName('head'), 'the head rides above the hinge');
  assert.ok(waist.getObjectByName('torso'), 'and so does the torso');
  assert.ok(upright.getObjectByName('body'), 'the skirt stays on the figure itself');

  // an ordinary figure is untouched — no hinge, one body, same as it ever was
  assert.equal(makeFigure({ height: H }).getObjectByName('waist'), undefined);

  const headAt = (angle) => {
    const g = makeFigure({ height: H, arms: 'fold', hat: false, bow: true });
    g.getObjectByName('waist').rotation.x = angle;
    g.updateMatrixWorld(true);
    return {
      head: g.getObjectByName('head').getWorldPosition(new THREE.Vector3()),
      box: new THREE.Box3().setFromObject(g),
    };
  };
  const up = headAt(0);
  const bowed = headAt(0.62);
  // FORWARD (+z, the way a body fronts) and DOWN — not sideways, which is
  // exactly what the old whole-figure rotation.z did
  assert.ok(bowed.head.z > up.head.z + 0.2 * H,
    `the head travels forward: ${up.head.z.toFixed(2)} -> ${bowed.head.z.toFixed(2)}`);
  assert.ok(bowed.head.y < up.head.y - 0.05 * H, 'and drops as he bends');
  assert.ok(Math.abs(bowed.head.x - up.head.x) < 1e-6, 'and never leans sideways');
  // the hem is still planted: he bent, he did not topple
  assert.ok(Math.abs(bowed.box.min.y) < 1e-6, `the hem stays on the ground: ${bowed.box.min.y}`);
});
