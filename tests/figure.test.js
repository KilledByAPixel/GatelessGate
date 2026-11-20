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
  // A resting sleeve leans off plumb, and the loose form transforms the eight
  // corners of the geometry's box — including the corner that pairs the WIDE
  // cuff with the TOP of the sleeve, a point no vertex of the arm actually
  // occupies. That phantom corner swings above the shoulder and would fail
  // this by itself, saying nothing about where the hinge is. Same reason
  // k14-cat.test.js passes `true` here.
  const box = new THREE.Box3().setFromObject(arm, true);
  // The mesh's origin (shoulder) must sit at the top of its CLOTH — only the
  // shoulder CAP, which closes the arm over the hinge to bury the arm/body
  // join, may crest above it, and the cap is a small fraction of the sleeve. A
  // centred (un-translated) sleeve stands half its own length above the hinge,
  // so the check still catches what it is for several times over.
  const H = 1.6;
  const crest = box.max.y - arm.position.y;
  assert.ok(crest > 0, 'the cap closes over the hinge');
  assert.ok(crest <= 0.06 * H, `sleeve not hinged at shoulder: crests ${crest}`);
  assert.ok(crest < 0.2 * (box.max.y - box.min.y), 'the cap is a cap, not half the arm');
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
  // EVERY figure has arms, in every pose — there is no opt-out. Counted by
  // TRAVERSAL, not by direct children: the bow re-parents everything above the
  // sash into a 'waist' group, arms included.
  const armCount = (m) => {
    let n = 0;
    m.traverse((c) => { if (c.name === 'arm') n++; });
    return n;
  };
  for (const pose of ['stand', 'sit', 'point', 'raise', 'fold', 'bow'])
    assert.strictEqual(armCount(makeMonk({ pose })), 2, `${pose} keeps both arms`);
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

// ---------------------------------------------------------------------------
// the arms
// ---------------------------------------------------------------------------
// What the arm tests read is the mesh's own geometry, sliced: a ring count is
// a tuning, so a check that walked vertices would pin where the rings happen
// to be rather than what the arm does.

// The cross-section of a mesh's geometry at local y = `y`: the points where
// its triangles' edges cross that plane.
function sectionAt(mesh, y) {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const p = geo.attributes.position;
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    for (let e = 0; e < 3; e++) {
      a.fromBufferAttribute(p, i + e);
      b.fromBufferAttribute(p, i + (e + 1) % 3);
      if ((a.y - y) * (b.y - y) >= 0) continue;
      out.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
    }
  }
  return out;
}
// The middle of a section — the box centre, not the mean, so a ring that is
// sampled densely on one side does not pull it.
function sectionCentre(mesh, y) {
  const pts = sectionAt(mesh, y);
  if (!pts.length) return null;
  return new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
}
function sectionRadius(mesh, y) {
  const pts = sectionAt(mesh, y);
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  return Math.max(...pts.map((q) => Math.hypot(q.x - c.x, q.z - c.z)));
}
const armLength = (arm) => {
  arm.geometry.computeBoundingBox();
  return -arm.geometry.boundingBox.min.y;
};
// The bend, in radians: how far the arm's centre line turns between the run
// out of the shoulder and the run into the cuff. Sampled along the whole arm
// and read at the point furthest off the shoulder-to-cuff chord, so it finds
// the elbow wherever it sits.
function elbowBend(arm) {
  const L = armLength(arm);
  const top = sectionCentre(arm, -0.06 * L);
  const end = sectionCentre(arm, -0.94 * L);
  const chord = end.clone().sub(top);
  const len = chord.length();
  chord.normalize();
  let best = 0, at = 0.5;
  for (let t = 0.2; t <= 0.8; t += 0.05) {
    const c = sectionCentre(arm, -t * L).sub(top);
    const along = c.dot(chord);
    const off = c.addScaledVector(chord, -along).length();
    if (off > best) { best = off; at = along / len; }
  }
  return Math.atan(best / (at * len)) + Math.atan(best / ((1 - at) * len));
}
const armsOf = (g) => g.children.filter((c) => c.name === 'arm');
const gestureArm = (g) => armsOf(g).find((c) => Math.abs(c.rotation.z) > 1);
const worldVerts = (mesh) => {
  mesh.updateWorldMatrix(true, false);
  const p = mesh.geometry.attributes.position;
  const out = [];
  for (let i = 0; i < p.count; i++) {
    out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  }
  return out;
};

test('a resting arm hangs close to the body', () => {
  // The cuffs used to stand further out than the hem — the widest thing on a
  // standing figure was the pair of sleeve mouths, held away from the robe.
  // Measured where it shows: how far the cuff's outer edge stands off the
  // robe's own surface at the height the cuff hangs.
  for (const [H, stout] of [[1.6, 1], [1.72, 1.08], [1.1, 1]]) {
    const g = makeFigure({ height: H, stout });
    const body = g.getObjectByName('body');
    for (const arm of armsOf(g)) {
      const v = worldVerts(arm);
      const low = Math.min(...v.map((q) => q.y));
      const cuff = v.filter((q) => q.y < low + 0.05 * H);
      const reach = Math.max(...cuff.map((q) => Math.abs(q.x)));
      const robe = maxAxisInBand(body, low - 0.02 * H, low + 0.09 * H, 'x');
      assert.ok(robe > 0, 'the robe is there to measure against');
      assert.ok(reach - robe < 0.06 * H,
        `cuff stands ${((reach - robe) / H).toFixed(3)}·h off the robe at h=${H}`);
      // and it is still an arm BESIDE the body, not one swallowed by it
      assert.ok(reach > robe, `the cuff still clears the robe: ${reach} vs ${robe}`);
    }
  }
});

test('a resting arm bends at the elbow', () => {
  for (const arm of armsOf(makeFigure({}))) {
    const bend = elbowBend(arm);
    assert.ok(bend > 0.25, `a hanging arm is not a rod: ${bend.toFixed(3)} rad`);
    assert.ok(bend < 0.9, `nor is it folded: ${bend.toFixed(3)} rad`);
  }
});

test('the two resting arms are not mirror images', () => {
  // The left arm's centre line reflected in x and laid over the right's: on a
  // mirrored pair the two coincide all the way down. Centre lines rather than
  // vertices, because a sleeve with an odd number of sides is not its own
  // reflection and a vertex comparison would call any such pair asymmetric.
  const offMirror = (g) => {
    const [l, r] = armsOf(g).sort((a, b) => a.position.x - b.position.x);
    g.updateMatrixWorld(true);
    let worst = 0;
    for (let t = 0.1; t < 0.95; t += 0.1) {
      const a = sectionCentre(l, -t * armLength(l)).applyMatrix4(l.matrixWorld);
      const b = sectionCentre(r, -t * armLength(r)).applyMatrix4(r.matrixWorld);
      a.x = -a.x;
      worst = Math.max(worst, a.distanceTo(b));
    }
    return worst;
  };
  const H = 1.6;
  const off = offMirror(makeFigure({ height: H }));
  assert.ok(off > 0.012 * H, `the rest pose is a mirror image: ${off}`);
  // MILD: one figure, not two different men stitched down the middle
  assert.ok(off < 0.09 * H, `the asymmetry is a lean, not a pose: ${off}`);

  // `seed` varies it, deterministically, so a crowd is not one stamp
  const pose = (g) => armsOf(g).map((a) => [a.rotation.x, a.rotation.z].map((n) => n.toFixed(4)).join());
  assert.deepEqual(pose(makeFigure({ seed: 5 })), pose(makeFigure({ seed: 5 })), 'same seed, same man');
  const seen = new Set([0, 1, 2, 3, 4, 5].map((seed) => pose(makeFigure({ seed })).join('|')));
  assert.ok(seen.size >= 5, `seeds give different rest poses: ${seen.size} of 6`);
  // every seed is still a rest pose a case can read: each arm on its own
  // side, both hanging, neither past the |rotation.z| > 1 line that cases use
  // to tell a gesture arm from a resting one
  for (let seed = 0; seed < 40; seed++) {
    const g = makeFigure({ seed });
    for (const a of armsOf(g)) {
      assert.ok(Math.sign(a.rotation.z) === Math.sign(a.position.x), `seed ${seed}: arm leans off its own side`);
      assert.ok(Math.abs(a.rotation.z) < 0.3 && Math.abs(a.rotation.x) < 0.4, `seed ${seed}: still hanging`);
    }
    assert.ok(offMirror(g) > 0.012 * H, `seed ${seed} is a mirror image`);
  }
});

test('a pointing arm bends at the elbow', () => {
  for (const [stance, arms] of [['stand', 'point'], ['stand', 'raise'], ['sit', 'raise']]) {
    const g = makeFigure({ stance, arms });
    const arm = gestureArm(g);
    assert.ok(arm, `${stance}/${arms}: the gesture arm is still found by its rotation`);
    const bend = elbowBend(arm);
    assert.ok(bend > 0.35, `${stance}/${arms}: a club, not an arm: ${bend.toFixed(3)} rad`);
    assert.ok(bend < 1.1, `${stance}/${arms}: folded back on itself: ${bend.toFixed(3)} rad`);
  }
});

test('the shoulder is a line, not a ball', () => {
  // A ball joint is two things at once: a knob standing wider than the arm
  // that leaves it, and an arm that starts thin there and only fattens further
  // down. A shoulder is the reverse on both counts — the arm is at its
  // broadest where it leaves the body, and nothing above the hinge is wider
  // than the arm itself.
  for (const [stance, arms] of [['stand', 'rest'], ['stand', 'fold'], ['sit', 'fold'], ['stand', 'point'], ['stand', 'raise']]) {
    const H = 1.6;
    const g = makeFigure({ height: H, stance, arms });
    for (const arm of armsOf(g)) {
      const L = armLength(arm);
      const p = arm.geometry.attributes.position;
      // the side that shows: a cap that leans IN, toward the neck, is buried in
      // the robe and is the slope of the shoulder, not a knob on it
      const out = Math.sign(arm.position.x);
      let knob = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0.004 * H) knob = Math.max(knob, Math.hypot(Math.max(0, out * p.getX(i)), p.getZ(i)));
      }
      // both read about the hinge's own axis, a little way down the arm so the
      // section is clear of the root ring's tilt
      const root = Math.max(...sectionAt(arm, -0.02 * H).map((q) => Math.hypot(q.x, q.z)));
      const below = sectionRadius(arm, -0.3 * L);
      assert.ok(knob <= root * 1.05,
        `${stance}/${arms}: a knob ${knob.toFixed(4)} over an arm ${root.toFixed(4)}`);
      // (a FOLDED arm is the exception to the second half, and has its own
      // test below: its upper is slim and the sleeve's width is at the cuff)
      if (arm.getObjectByName('forearm')) continue;
      assert.ok(root >= below * 0.97,
        `${stance}/${arms}: the arm starts thin (${root.toFixed(4)}) and fattens (${below.toFixed(4)})`);
    }
    // and the shoulders make a line ACROSS the figure: the arm roots stand
    // outside the robe at the hinge, so the outline steps out to them
    const body = g.getObjectByName('body');
    // (a folded arm lies against the torso instead; its own test below holds
    // it to standing just clear of it)
    for (const arm of armsOf(g).filter((a) => !a.getObjectByName('forearm'))) {
      const y = arm.position.y;
      const robe = maxRadiusInBand(body, y - 0.06 * H, y + 0.06 * H);
      const edge = Math.max(...worldVerts(arm).filter((q) => Math.abs(q.y - y) < 0.03 * H).map((q) => Math.abs(q.x)));
      assert.ok(edge > robe + 0.02 * H, `${stance}/${arms}: shoulder ${edge.toFixed(3)} inside the robe ${robe.toFixed(3)}`);
    }
  }
});

test('a folded arm is slim at the shoulder and carries its sleeve at the cuff', () => {
  // The first swept arm gave the folded pose the hanging arm's shoulder: an
  // upper arm nearly as deep as the torso, hinged outside it and leaning off
  // it. Seated, that is a block with two boxes bolted on — a yoke — and the
  // forearms, no wider than the slabs above them, vanished into the lap. A
  // folded arm is the other way up: slim where it lies against the body, and
  // widening down the forearm to the mouth the hands are tucked into.
  for (const [stance, arms] of [['sit', 'fold'], ['stand', 'fold'], ['sit', 'raise']]) {
    const H = 1.6;
    const g = makeFigure({ height: H, stance, arms, hat: false });
    g.updateMatrixWorld(true);
    const body = g.getObjectByName('body');
    for (const arm of armsOf(g).filter((a) => a.getObjectByName('forearm'))) {
      const L = armLength(arm);
      const fore = arm.getObjectByName('forearm');
      const mid = sectionAt(arm, -0.5 * L);
      const box = new THREE.Box3().setFromPoints(mid);
      const y = arm.position.y - 0.5 * L;
      // the band is wide because the robe is a lathe with long runs: it has
      // to reach a ring, and the widest ring in reach is the torso's girth
      const torso = maxRadiusInBand(body, y - 0.13 * H, y + 0.13 * H);
      assert.ok(torso > 0.1 * H, 'the torso is there to measure against');
      const width = box.max.x - box.min.x, depth = box.max.z - box.min.z;
      assert.ok(width < 0.25 * 2 * torso,
        `${stance}/${arms}: upper arm ${(width / H).toFixed(3)}·h wide beside a torso ${(2 * torso / H).toFixed(3)}·h`);
      assert.ok(depth < 0.29 * 2 * torso,
        `${stance}/${arms}: upper arm ${(depth / H).toFixed(3)}·h deep beside a torso ${(2 * torso / H).toFixed(3)}·h`);
      // LYING AGAINST the torso: its inner face is inside the robe's surface,
      // and its outer face stands only a little way off it
      const world = mid.map((q) => q.clone().applyMatrix4(arm.matrixWorld));
      const inner = Math.min(...world.map((q) => Math.abs(q.x)));
      const outer = Math.max(...world.map((q) => Math.abs(q.x)));
      assert.ok(inner < torso, `${stance}/${arms}: daylight between arm and body: ${inner} vs ${torso}`);
      assert.ok(outer - torso < 0.03 * H,
        `${stance}/${arms}: the arm stands ${((outer - torso) / H).toFixed(3)}·h off the torso`);
      assert.ok(outer > torso + 0.008 * H, `${stance}/${arms}: and is still an arm beside the body`);
      // THE WIDTH IS AT THE CUFF
      const FL = armLength(fore);
      const cuff = sectionRadius(fore, -0.9 * FL);
      const shoulder = sectionRadius(arm, -0.15 * L);
      assert.ok(cuff > shoulder * 1.25,
        `${stance}/${arms}: cuff ${cuff.toFixed(4)} no wider than the shoulder ${shoulder.toFixed(4)}`);
      // and the forearm CONVERGES: its mouth ends nearer the centre line than
      // its elbow starts, by most of the shoulder's half-width
      const elbowX = Math.abs(new THREE.Vector3().applyMatrix4(fore.matrixWorld).x);
      const tipX = Math.abs(new THREE.Vector3(0, -FL, 0).applyMatrix4(fore.matrixWorld).x);
      assert.ok(tipX < 0.03 * H && elbowX > 0.10 * H,
        `${stance}/${arms}: forearm runs ${(elbowX / H).toFixed(3)} -> ${(tipX / H).toFixed(3)}·h`);
    }
  }
});

test('every documented child name still resolves', () => {
  // The names cases reach for, and the idioms they find an arm by. Read off
  // src/koans: `children.filter(name === 'arm')` on the figure itself (k11,
  // k23, k31, k41, k42, k43, k48), the gesture arm told apart by
  // |rotation.z| > 1 or by the larger rotation.z or position.x, traversal for
  // 'arm' (k20), getObjectByName for 'waist' and 'staff'.
  const stand = makeMonk({ elder: true });
  for (const n of ['body', 'head', 'hat', 'staff', 'arm']) assert.ok(stand.getObjectByName(n), `stand: ${n}`);
  assert.equal(stand.name, 'monk');
  assert.equal(armsOf(stand).length, 2, 'both arms are direct children of the figure');
  for (const a of armsOf(stand)) assert.ok(a.isMesh, 'an arm is a mesh — cases read its geometry');

  for (const pose of ['sit', 'fold']) {
    const m = makeMonk({ pose });
    assert.equal(armsOf(m).length, 2, pose);
    for (const a of armsOf(m)) assert.ok(a.getObjectByName('forearm'), `${pose}: the forearm hangs off the arm`);
  }
  const bow = makeMonk({ pose: 'bow' });
  const waist = bow.getObjectByName('waist');
  assert.ok(waist && waist.getObjectByName('torso') && waist.getObjectByName('head'));
  assert.equal(waist.children.filter((c) => c.name === 'arm').length, 2, 'the arms of a bowing figure ride the waist');
  assert.ok(bow.getObjectByName('body'));

  for (const pose of ['point', 'raise', 'sit-raise']) {
    const H = 1.6;
    const m = makeMonk({ pose, height: H });
    const arms = armsOf(m);
    const raised = arms.filter((c) => Math.abs(c.rotation.z) > 1);
    assert.equal(raised.length, 1, `${pose}: exactly one arm past the gesture line`);
    assert.equal(raised[0], [...arms].sort((a, b) => b.rotation.z - a.rotation.z)[0], `${pose}: and it has the larger rotation.z`);
    assert.equal(raised[0], [...arms].sort((a, b) => b.position.x - a.position.x)[0], `${pose}: and it is the +x arm`);
    // THE CUFF CONTRACT: the hand is at local (0, -len, 0), `len` read off the
    // bounding box — k3 seats a finger there, k11 a fist, k43/k48 hang a staff
    // and a fan off it. So the mouth of a gesture sleeve ends exactly on that
    // plane and is centred on the axis.
    const L = armLength(raised[0]);
    assert.ok(Math.abs(L - 0.34 * H) < 1e-4, `${pose}: the gesture sleeve keeps its length: ${L}`);
    // (cloth hangs off one side of it, so the mouth is not CENTRED there —
    // what matters is that the point is well inside the sleeve)
    const mouth = new THREE.Box3().setFromPoints(sectionAt(raised[0], -0.97 * L));
    const inset = Math.min(-mouth.min.x, mouth.max.x, -mouth.min.z, mouth.max.z);
    assert.ok(inset > 0.02 * H, `${pose}: the hand is inside the cuff by ${(inset / H).toFixed(3)}·h`);
    // and it is higher than the head: the gesture is still made
    raised[0].updateMatrix();
    const hand = new THREE.Vector3(0, -L, 0).applyMatrix4(raised[0].matrix);
    assert.ok(hand.y > m.getObjectByName('head').position.y, `${pose}: the hand is above the head`);
  }
  // a resting sleeve is likewise as long as its bounding box says
  for (const a of armsOf(makeMonk({ height: 1.6 }))) {
    assert.ok(Math.abs(armLength(a) - 0.34 * 1.6) < 1e-4, `rest sleeve length: ${armLength(a)}`);
  }
});
