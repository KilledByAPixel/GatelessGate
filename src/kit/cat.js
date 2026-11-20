import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { skullGeometry } from './skull.js';
import { hash1 } from '../util/noise.js';

// Nansen's cat (case 14). The shared quadruped run SMALL: a compact body on
// fine legs, a little wedge of a skull with ears at its corners, and a long
// jointed tail.
//
// WHAT SAYS CAT, in the order it survives distance — the cat is a couple of
// dozen pixels tall in the cases that stage it, so the list is short:
//
//   1. ONE LINE FROM THE EARS TO THE TAIL. The nape, the back and the rump are
//      a single unbroken curve, bowed OUT: a straight slope from skull to
//      rump is a tent, and it is the swell over the shoulders and the round
//      of the rump that make it an animal sitting. The trunk's own loft
//      carries on up a short thick neck into the skull, so there is no notch
//      behind the head for the eye to read as a ball perched on a body.
//   2. A SMALL HEAD WITH TWO POINTS ON IT. One loft (skull.js), wider than it
//      is deep and barely longer than it is wide: a rounded wedge. The ears
//      root on its back corners with a flat of crown showing between them.
//      A head as wide as the body is a toy's.
//   3. A SITTING CAT IS A PEAR STANDING ON ITS HAUNCHES. See THE SEATED POSE.
//   4. THE TAIL IS A LINE WITH A CURVE IN IT. See THE TAIL.
//
// THE SEATED POSE. A cat that matters to a koan is sitting, unbothered, while
// everyone else argues. makeQuadruped only builds a standing animal, and A
// STANDING ANIMAL FOLDED IN HALF IS NOT A SITTING ONE: pitching the standing
// trunk nose-up gives a straight back, a rump that ends in a corner, a
// shoulder mass stretched into a plate on the breast and a head the chest
// swallows. So the plan supplies the parts — the meshes, their names, the
// material, the skull and its ears — and every seated shape is stated here in
// the animal's own frame, from the ground up:
//
//   - THE TRUNK IS A PEAR (see PEAR): one loft from the seat to the inside of
//     the skull, widest low, its two outlines written down as the side view.
//     It still rides in a `torso` group pitched nose-up, with the skull in a
//     group of its own counter-rotated back to level, because that is the
//     frame the breathing and the stir are written in.
//   - THE HIND LEGS ARE HAUNCHES. A standing hind leg rescaled to fit under a
//     lowered rump is a flap hanging off the flank with daylight behind it.
//     Seated, each hind leg is its own loft: a round mass lying beside the
//     body, low at the rear, falling steeply at the knee to a paw on the
//     ground. The pair stand wider than the trunk, which is the base of the
//     pear from the front, and they close the gap under the belly from the
//     side.
//   - THE FRONT LEGS ARE COLUMNS (see FORELEG), plumb under the breast and
//     close together, each ending in a block of a paw.
//   - THE HEAD IS PLACED FOR THE POSE, NOT CARRIED OVER (see SIT_HEAD), and
//     the pear is lofted to it.
//
// EVERY JOIN IS READ OFF THE POSED MESH. No closed form says where a lofted
// trunk's surface is under a given paw. So the body's vertices are carried
// into the animal's own frame once (`pts`), and the rest is measured from
// them: where a vertical leg enters the chest (`column`), where the haunch's
// origin sits so that it is inside the body, and where the tail leaves the
// rump. tests/cat.test.js and tests/k14-cat.test.js check the joins against
// the mesh in both poses.
//
// THE TAIL. The buffalo's verlet strand is wrong here twice over: at a cat's
// scale its idle force would thrash, and a rope cannot hold a shape. This
// tail is a chain of jointed segments, so it rests in an authored curve and
// CURLS — bending one joint carries everything past it. Seated, it lies along
// the ground behind the rump and hooks round to one side (the seed picks
// which) with the far end curling up off the ground: a straight tail is a
// stick laid behind the cat, the hook is what still reads as a tail from
// above and in front, which is where the cases stand, and the curl is what
// reads from the side. The lift is spread over the far half and gathers
// toward the end, a round curl standing up off the ground — put into the last
// joint alone it is a spike stood on the end of a rod, and spread evenly it
// is a stick with a kink in it.
//
// THE TAIL IS ONE SKIN. The joints are bare pivots: they carry the pose and
// the stir, and nothing is drawn on them. A cylinder per joint was drawn
// once, and no trimming of it works — cut to the joint spacing a bend opens
// daylight on its outside, cut longer each piece's sawn end stands out of
// the next as a collar, and a ball over the joint beads the tail. So one
// tube is laid along a smooth curve through the joints, every frame, each
// ring carried from the one before it: a bend is only a bend, and the taper
// is one taper. It starts on a ring INSIDE the body, ahead of the root and
// fixed there, so however the first joint turns the tail bends out of the
// rump at its full girth instead of pivoting on the surface; it is fullest
// at the root, and it ends in a blunt point.
//
// Faces +z, like its siblings. Returns a handle: the cat has moving parts.

const P = {
  bodyR: 0.23, bodyDrop: 0.18,
  legH: 0.46, legR: 0.058, legTaper: 1.0, hipX: 0.1, hipZ: 0.36,
};

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). Read down the
// half-width column for the wedge — widest at the cheek, straight after it —
// and down `top` for the profile: a rounded crown carried forward over the
// brow, a short fall, and a muzzle that barely leaves the face. The jaw
// rises toward the nose; held level it is a box under the face.
const SKULL = [
  [-0.1, 0.1, -0.07, 0.105],
  [-0.02, 0.135, -0.1, 0.158],
  [0.075, 0.128, -0.105, 0.145],
  [0.125, 0.048, -0.085, 0.082],
  [0.165, 0.03, -0.065, 0.055],
];
const SKULL_BACK = [0.015, -0.145];      // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.015, 0.182];
// Rooted inside the back corners of the skull and leaning out, so the tips
// stand as far apart as the head is wide. The pair has to clear the skull in
// BOTH directions: standing above it is what says "cat", but a pair no wider
// than the head reads as two bumps at distance.
const EARS = { r: 0.058, h: 0.18, x: 0.082, y: 0.07, z: -0.035, tilt: 0.4 };
// Standing. Barely a neck: as deep where it enters the skull as the skull
// allows, so the nape and the throat are the trunk's own lines arriving at
// the head.
const NECK ={ r: 0.088, w: 1.05, root: 0.6, set: 0.2, taper: 1.0, arch: 0.0 };

// THE STANDING TRUNK, in the plan's own terms (quadruped.js): deep in the
// chest, tucked at the flank, the head carried barely above the line of the
// back. The plan is always built standing; sitting replaces what it built.
const STAND = {
  bodyLen: 0.6,
  torso: { chest: 1.05, loin: 0.78, withers: 1.0, back: 0.95, croup: 0.95 },
  head: { fwd: 0.52, up: 0.2 },
  legs: { shoulder: 2.3 },
};

// THE PEAR, seat to throat: [backY, backZ, frontY, frontZ, half-width] in
// heights, in the animal's own frame with the ground at zero. Each row is one
// ring through the sitting trunk, and the two columns of points ARE the side
// view: read down the back pair for the outline behind — out over the rump,
// widest low, in over the shoulders and up a nape that is nearly plumb — and
// down the front pair for the breast, which stands just proud of the legs
// under it and stays behind the chin.
const PEAR = [
  [0.05, -0.49, 0.02, -0.12, 0.185],
  [0.19, -0.545, 0.14, 0.03, 0.235],
  [0.35, -0.505, 0.3, 0.11, 0.235],
  [0.5, -0.42, 0.47, 0.17, 0.215],
  [0.64, -0.305, 0.62, 0.215, 0.185],
  [0.75, -0.17, 0.76, 0.23, 0.152],
  [0.86, -0.075, 0.875, 0.215, 0.12],
];
const PEAR_SEAT = [0.02, -0.3];          // [y, z] apex closing the loft under the cat
// Where a sitting cat carries its head, [y, z], and the ring the trunk ends
// on there: barely a neck, so the last ring is nearly as deep as the skull it
// is buried in and the nape and throat arrive at the head as the trunk's own
// lines.
const SIT_HEAD = [0.99, 0.165];
const SIT_NECK = { r: 0.088, w: 0.092 };
// The point the seated torso turns and breathes about, [y, z]: the middle of
// the pear, so a breath swells it evenly and moves no edge of it far.
const SIT_CORE = [0.4, -0.17];

const SIT_TILT = 0.98;      // radians the seated torso's frame pitches up off horizontal
const SIT_LEVEL = 1.0;      // how much of that the skull takes back out
const BURY = 0.3;           // a seated front leg's top, as a fraction of the way up through the chest above it

// A SEATED FRONT LEG, from below its buried top down to the ground: [y, z,
// fore-aft radius, lateral radius] in heights, y off the ground and z off the
// leg's own plumb line. A straight column with a wrist and a block of a paw
// reaching forward. The top ring is not here: it rides wherever the chest is
// (see BURY).
const FORELEG = [
  [0.3, 0.0, 0.066, 0.06],
  [0.09, 0.004, 0.052, 0.05],
  [0.055, 0.03, 0.07, 0.058],
  [0.0, 0.03, 0.074, 0.06],
];
const FORELEG_X = 0.09;                  // the pair stand close under the breast
const FORELEG_Z = 0.12;                  // and this far ahead of the animal's origin

// THE HAUNCH, rump to toe: [z, top, bottom, half-width] in heights, in the
// animal's own frame with the ground at zero — the same cut as the skull, and
// the same builder. `top` is the whole read: a round over the hip — rising
// and falling, never a level run, which is a box lid — then steeply down at
// the knee to a paw that keeps a height of its own. It stays under the back
// line all the way, so from the side the back is still the cat's outline.
// The toe reaches the back of the front paws and stops there: from the side
// the hind paw shows behind the front one, not across it.
const HAUNCH = [
  [-0.48, 0.3, 0.05, 0.065],
  [-0.42, 0.42, 0.0, 0.1],
  [-0.33, 0.475, 0.0, 0.116],
  [-0.23, 0.475, 0.0, 0.118],
  [-0.15, 0.42, 0.0, 0.108],
  [-0.095, 0.3, 0.0, 0.088],
  [-0.06, 0.11, 0.0, 0.062],
  [0.065, 0.095, 0.0, 0.055],
];
const HAUNCH_BACK = [0.18, -0.51];
const HAUNCH_TOE = [0.04, 0.102];
const HAUNCH_X = 0.165;                  // its centre plane, off the animal's own
const HAUNCH_JOIN_Z = -0.25;             // where its origin is sunk into the body

const TAIL_SEGS = 7;
const TAIL_LEN = 0.95;
const TAIL_R0 = 0.055;      // the tail proper, where the root's flare has run out
const TAIL_R1 = 0.036;      // and at its far end, before that closes
// The root is fuller than the tail behind it — the rump running out into the
// tail rather than a rod leaving a hole in it — and spends that over a short
// run. The skin starts on a ring this far INSIDE the body, ahead of the root.
const TAIL_ROOT_R = 0.075;
const TAIL_FLARE_RUN = 0.3;     // fraction of the tail's length
const TAIL_DEEP = 0.13;         // x height
const TAIL_GROUND = 0.02;       // x height the root's underside rides off the ground
// The end is a blunt point: one ring just short of it, drawn in, then closed.
const TAIL_END_U = 0.975, TAIL_END_R = 0.62;
const TAIL_SIDES = 6, TAIL_CUTS = 2;
// Cumulative pitch of each joint off horizontal-backward. Seated, the tail
// lies along the ground and curls up at the end; standing, it carries high.
// The seated root starts a little nose-down: its flare holds the root itself
// clear of the ground, and the slimmer tail behind it would otherwise float
// at that height all the way out.
const SIT_TAIL = [-0.1, -0.03, 0.03, 0.14, 0.38, 0.74, 1.1];
const STAND_TAIL = [-0.12, 0.02, 0.20, 0.42, 0.66, 0.90, 1.12];
// The seated hook: each joint's own turn to the side, so the bend tightens
// toward the tip. Kept well short of a half circle in all — wrapped round to
// the flank the tail joins the body's mass and is no longer a line.
const SIT_HOOK = [0, 0.1, 0.16, 0.22, 0.26, 0.28, 0.28];

const STIR_DUR = 4.6;       // seconds for one unhurried stretch-and-settle
// HOW BIG A STIR IS. The cat is small and sits well back in the cases that
// use it; a stir sized for a close-up is motion you can only find by looking
// for it. It is still a cat noticing you and going back to ignoring you.
const TAIL_CURL = 0.30;     // extra bend per joint at the peak of a stir
const TAIL_SWEEP = 0.22;    // and the sideways sweep that goes with it
const EAR_SWIVEL = 0.85;
const EAR_SPREAD = 0.22;
// THE BODY DOES NOT MOVE. A stretch was tried here — the trunk lengthening,
// lifting off the haunch and the torso rolling into it — on the
// theory that a silhouette changing shape reads further than details moving
// inside one. It does, and it also comes apart: the body is a separate mesh
// sitting on four legs that do not follow it, so lifting it opens a gap and the
// cat visibly detaches from its own feet. The body stays where it is.
//
// What moves instead is a head TILT — a cat's actual "what was that" — and the
// tail, wagging rather than merely curling, which is the one part of this animal
// long enough to read at any distance whatever it does.
const HEAD_TILT = 0.34;     // radians the skull cocks over at the peak of a stir
const TAIL_WAG = 0.30;      // radians of sweep, either way
const TAIL_WAG_HZ = 1.35;   // and how fast it goes back and forth

// A closed loft of slanted rings — the trunk's own cut in quadruped.js, for
// the parts a sitting cat has to state for itself. Each station is an ellipse
// standing across the animal: centre `c` and half-axis `a` are [y, z] pairs in
// the side view, `w` the half-width in x, so a ring's two end vertices are the
// two outline points it was written from. Winding wants x cross a to point
// along the direction of travel. Both ends are fanned shut on an apex.
function ringLoft(stations, seg, apex0, apex1) {
  const pos = [], idx = [];
  for (const s of stations) {
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      const sn = Math.sin(t);
      pos.push(Math.cos(t) * s.w, s.c[0] + sn * s.a[0], s.c[1] + sn * s.a[1]);
    }
  }
  const last = stations.length - 1;
  for (let i = 0; i < last; i++) {
    const a = i * seg, b = a + seg;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const p0 = pos.length / 3;
  pos.push(0, apex0[0], apex0[1]);
  for (let j = 0; j < seg; j++) idx.push(p0, (j + 1) % seg, j);
  const p1 = pos.length / 3;
  pos.push(0, apex1[0], apex1[1]);
  for (let j = 0; j < seg; j++) idx.push(p1, last * seg + j, last * seg + (j + 1) % seg);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function makeCat({ height = 0.32, color = INK_LIT, seed = 14, pose = 'sit' } = {}) {
  const h = height;
  const seated = pose === 'sit';

  const { group, material, plan } = makeQuadruped({
    height, color, seed,
    bodyR: P.bodyR, bodyLen: STAND.bodyLen, bodyDrop: P.bodyDrop,
    torso: STAND.torso,
    legH: P.legH, legR: P.legR, legTaper: P.legTaper, hipX: P.hipX, hipZ: P.hipZ,
    legs: STAND.legs,
    neck: NECK,
    // The plan's ball only says where the head is carried; its geometry is
    // replaced by the loft below. No snout: the muzzle is the front of it.
    head: { shape: 'sphere', r: 0.1, fwd: STAND.head.fwd, up: STAND.head.up },
    ears: EARS,
    // No tail here; this one is jointed and built below.
  });
  group.name = 'cat';

  const hipZ = P.hipZ * h;
  const bodyY = plan.bodyY;

  // ---- split the animal into legs and a torso that can pitch ---------------
  const frontLegs = [], rearLegs = [];
  const ears = [];
  let head = null;
  for (const child of group.children) {
    if (child.name === 'ear') ears.push(child);
    else if (child.name === 'head') head = child;
  }
  head.geometry.dispose();
  head.geometry = skullGeometry(SKULL, { unit: h, back: SKULL_BACK, nose: SKULL_NOSE });

  const pivot = new THREE.Vector3(0, bodyY, -hipZ);      // the rear hip
  const torso = new THREE.Group();
  torso.name = 'torso';
  for (const child of [...group.children]) {
    if (child.name === 'leg') {
      (child.position.z < 0 ? rearLegs : frontLegs).push(child);
      continue;
    }
    child.position.sub(pivot);
    torso.add(child);
  }
  torso.position.copy(pivot);
  group.add(torso);

  // The skull rides in its own group, centred on the point the neck ends on:
  // it turns about the end of the neck, so the neck stays inside it.
  const skull = new THREE.Group();
  skull.name = 'skull';
  skull.position.copy(head.position);
  for (const part of [head, ...ears]) {
    part.position.sub(skull.position);
    skull.add(part);
  }
  torso.add(skull);
  for (const ear of ears) ear.userData.baseZ = ear.rotation.z;

  // ---- sit ----------------------------------------------------------------
  const tilt = seated ? SIT_TILT : 0;
  torso.rotation.x = -tilt;                   // negative pitches the front UP
  skull.rotation.x = tilt * SIT_LEVEL;        // and the skull takes most of it back

  const body = torso.getObjectByName('body');

  if (seated) {
    // see THE SEATED POSE. The pear is stated in the animal's frame and
    // carried into the pitched torso's, so the body mesh keeps the contract it
    // has standing — its own z runs along the spine — and a breath still
    // swells it across and in depth.
    torso.position.set(0, SIT_CORE[0] * h, SIT_CORE[1] * h);
    body.position.set(0, 0, 0);
    torso.updateMatrix();
    const toTorso = torso.matrix.clone().invert();

    const stations = PEAR.map(([by, bz, fy, fz, w]) => ({
      c: [(by + fy) / 2 * h, (bz + fz) / 2 * h], a: [(by - fy) / 2 * h, (bz - fz) / 2 * h], w: w * h,
    }));
    // The last ring is centred on the head itself and stands square to the
    // run up from the shoulders, so it ends inside the skull whichever way
    // the skull is turned afterwards.
    const from = stations[stations.length - 1].c;
    const hy = SIT_HEAD[0] * h, hz = SIT_HEAD[1] * h;
    const len = Math.hypot(hy - from[0], hz - from[1]);
    const d = [(hy - from[0]) / len, (hz - from[1]) / len];
    const r = SIT_NECK.r * h;
    stations.push({ c: [hy, hz], a: [d[1] * r, -d[0] * r], w: SIT_NECK.w * h });
    const pear = ringLoft(stations, 8,
      [PEAR_SEAT[0] * h, PEAR_SEAT[1] * h], [hy + d[0] * r * 0.3, hz + d[1] * r * 0.3]);
    pear.applyMatrix4(toTorso);
    body.geometry.dispose();
    body.geometry = pear;
    skull.position.set(0, hy, hz).applyMatrix4(toTorso);
  }

  // The trunk as posed, in the animal's own frame — see EVERY JOIN IS READ OFF
  // THE POSED MESH.
  const geo = body.geometry;
  const local = geo.getAttribute('position');
  const index = geo.index;
  const pts = [];
  {
    torso.updateMatrix();
    body.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(torso.matrix, body.matrix);
    const v = new THREE.Vector3();
    for (let i = 0; i < local.count; i++) {
      v.fromBufferAttribute(local, i).applyMatrix4(m);
      pts.push(v.x, v.y, v.z);
    }
  }

  // where a plumb line at (x, z) enters and leaves the trunk
  const column = (x, z) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i) * 3, b = index.getX(i + 1) * 3, c = index.getX(i + 2) * 3;
      const ax = pts[a], az = pts[a + 2], bx = pts[b], bz = pts[b + 2], cx = pts[c], cz = pts[c + 2];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const w = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u < 0 || w < 0 || u + w > 1) continue;
      const y = u * pts[a + 1] + w * pts[b + 1] + (1 - u - w) * pts[c + 1];
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return { lo, hi };
  };

  if (seated) {
    // The front legs stand plumb under the breast, each cut to the length the
    // chest above it leaves: the top ring rides inside the trunk at a height
    // read off the mesh, and the rows below it are stated from the ground, so
    // the paw is the same paw whatever the chest does. A standing leg scaled
    // down to fit stretches its shoulder mass into a plate on the breast and
    // squashes its paw.
    const fx = FORELEG_X * h, fz = FORELEG_Z * h;
    const chest = column(fx, fz);
    const top = chest.lo + BURY * (chest.hi - chest.lo);
    const [, , rz0, rx0] = FORELEG[0];
    const rings = [[top / h, 0, 0.8 * rz0, 0.8 * rx0], ...FORELEG].map(([y, z, rz, rx]) => ({
      c: [y * h - top, z * h], a: [0, rz * h], w: rx * h,
    }));
    const foreleg = ringLoft(rings, 6, [0.6 * rz0 * h, 0], rings[rings.length - 1].c);
    for (const leg of frontLegs) {
      // one geometry between the pair: the column is its own mirror image.
      // The mesh origin sits AT the join, as the plan's own legs have it.
      leg.geometry.dispose();
      leg.geometry = foreleg;
      leg.position.set(Math.sign(leg.position.x) * fx, top, fz);
    }

    // see THE HIND LEGS ARE HAUNCHES. The origin is sunk into the trunk's
    // middle at the haunch's own centre plane, and the rows — stated from the
    // ground — are restated from there.
    const jx = HAUNCH_X * h, jz = HAUNCH_JOIN_Z * h;
    const through = column(jx, jz);
    const jy = (through.lo + through.hi) / 2;
    const rel = ([y, z]) => [y - jy / h, z - HAUNCH_JOIN_Z];
    const rows = HAUNCH.map(([z, top2, bot, w]) => [z - HAUNCH_JOIN_Z, top2 - jy / h, bot - jy / h, w]);
    const haunch = skullGeometry(rows, { unit: h, back: rel(HAUNCH_BACK), nose: rel(HAUNCH_TOE) });
    rearLegs.forEach((leg) => {
      // one geometry between the pair: the loft is its own mirror image
      leg.geometry.dispose();
      leg.geometry = haunch;
      leg.position.set(Math.sign(leg.position.x) * jx, jy, jz);
    });
  }

  // ---- the tail -----------------------------------------------------------
  // It leaves the rump's own hindmost point — the rear apex of the trunk's
  // loft, wherever the pose has put it — pulled a little way back inside so
  // the root is buried, and never so low that its own thickness is in the
  // ground.
  let rumpI = 0;
  for (let i = 1; i < local.count; i++) if (local.getZ(i) < local.getZ(rumpI)) rumpI = i;
  const rest = seated ? SIT_TAIL : STAND_TAIL;
  const segLen = TAIL_LEN * h / TAIL_SEGS;
  const tailRoot = new THREE.Group();
  tailRoot.name = 'tail';
  const lowRoot = (TAIL_ROOT_R + TAIL_GROUND) * h;
  if (seated) {
    // the trunk's rearmost point at the root's own height: where a level
    // plane cuts the pear
    let rear = Infinity;
    for (let i = 0; i < index.count; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = index.getX(i + e) * 3, b = index.getX(i + (e + 1) % 3) * 3;
        const ya = pts[a + 1], yb = pts[b + 1];
        if ((ya - lowRoot) * (yb - lowRoot) > 0 || ya === yb) continue;
        rear = Math.min(rear, pts[a + 2] + (pts[b + 2] - pts[a + 2]) * ((lowRoot - ya) / (yb - ya)));
      }
    }
    tailRoot.position.set(0, lowRoot, rear + 0.06 * h);
  } else {
    tailRoot.position.set(0, Math.max(pts[rumpI * 3 + 1] + 0.03 * h, lowRoot), pts[rumpI * 3 + 2] + 0.06 * h);
  }
  // A joint's local +y runs along the tail. Rotating x by (pitch - PI/2) aims
  // that backward along -z, pitched off horizontal by `pitch`.
  tailRoot.rotation.x = rest[0] - Math.PI / 2;

  const hookSide = hash1(7, seed) < 0.5 ? -1 : 1;
  const joints = [];
  let parent = tailRoot;
  for (let i = 0; i < TAIL_SEGS; i++) {
    const joint = new THREE.Group();
    joint.name = 'tailjoint';
    if (i > 0) {
      joint.position.y = segLen;             // stack along the parent segment
      joint.rotation.x = rest[i] - rest[i - 1];
      // one seeded kink, so two cats do not carry identical tails
      joint.rotation.z = (hash1(i * 3 + 1, seed) - 0.5) * 0.10
        + (seated ? hookSide * SIT_HOOK[i] : 0);
    }
    joint.userData.baseX = joint.rotation.x;
    joint.userData.baseZ = joint.rotation.z;

    parent.add(joint);
    joints.push(joint);
    parent = joint;
  }
  group.add(tailRoot);

  // See THE TAIL IS ONE SKIN in the header. Rings are laid along a
  // curve through the joints, in the tail root's own frame: `cuts` of them to
  // each joint spacing, one more just short of the end, and one fixed ring
  // inside the body ahead of the root. Both ends are fanned shut.
  const ringU = [];
  for (let k = 0; k < TAIL_SEGS * TAIL_CUTS; k++) ringU.push(k / (TAIL_SEGS * TAIL_CUTS));
  ringU.push(TAIL_END_U);
  const girth = (u) => {
    const flare = Math.max(0, 1 - u / TAIL_FLARE_RUN);
    const end = u > ringU[ringU.length - 2] ? TAIL_END_R : 1;
    return (TAIL_R0 + (TAIL_R1 - TAIL_R0) * u + (TAIL_ROOT_R - TAIL_R0) * flare) * end * h;
  };
  const nRings = ringU.length + 1;                    // the buried one first
  const skinPos = new Float32Array((nRings * TAIL_SIDES + 2) * 3);
  const skinIdx = [];
  for (let i = 0; i < nRings - 1; i++) {
    const r0 = i * TAIL_SIDES, r1 = r0 + TAIL_SIDES;
    for (let j = 0; j < TAIL_SIDES; j++) {
      const j2 = (j + 1) % TAIL_SIDES;
      skinIdx.push(r0 + j, r0 + j2, r1 + j, r0 + j2, r1 + j2, r1 + j);
    }
  }
  const rootApex = nRings * TAIL_SIDES, tipApex = rootApex + 1;
  for (let j = 0; j < TAIL_SIDES; j++) {
    const j2 = (j + 1) % TAIL_SIDES;
    skinIdx.push(rootApex, j2, j);
    skinIdx.push(tipApex, (nRings - 1) * TAIL_SIDES + j, (nRings - 1) * TAIL_SIDES + j2);
  }
  const skinGeo = new THREE.BufferGeometry();
  skinGeo.setAttribute('position', new THREE.BufferAttribute(skinPos, 3));
  skinGeo.setIndex(skinIdx);
  const skin = new THREE.Mesh(skinGeo, material);
  skin.name = 'tailseg';
  tailRoot.add(skin);

  // the joints' origins and the tail's end, in the root's frame; one phantom
  // either end so the curve has a direction to arrive and leave by
  const nodes = [];
  for (let i = 0; i < TAIL_SEGS + 3; i++) nodes.push(new THREE.Vector3());
  const centres = [];
  for (let i = 0; i < nRings; i++) centres.push(new THREE.Vector3());
  const chain = new THREE.Matrix4();
  const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3();
  const deep = TAIL_DEEP * h;

  function layTail() {
    chain.identity();
    for (let i = 0; i < TAIL_SEGS; i++) {
      joints[i].updateMatrix();
      chain.multiply(joints[i].matrix);
      nodes[i + 1].setFromMatrixPosition(chain);
    }
    nodes[TAIL_SEGS + 1].set(0, segLen, 0).applyMatrix4(chain);
    // The curve ARRIVES at the root along the root's own axis, whatever the
    // first joint is doing, so the tail bends out of the body rather than
    // pivoting on its surface.
    nodes[0].set(0, -segLen, 0);
    nodes[TAIL_SEGS + 2].copy(nodes[TAIL_SEGS + 1]).multiplyScalar(2).sub(nodes[TAIL_SEGS]);

    centres[0].set(0, -deep, 0);
    for (let k = 0; k < ringU.length; k++) {
      const s = ringU[k] * TAIL_SEGS;
      const i = Math.min(TAIL_SEGS - 1, Math.floor(s)), t = s - i;
      const p0 = nodes[i], p1 = nodes[i + 1], p2 = nodes[i + 2], p3 = nodes[i + 3];
      const t2 = t * t, t3 = t2 * t;
      const c = centres[k + 1];
      for (const ax of ['x', 'y', 'z']) {
        c[ax] = 0.5 * (2 * p1[ax] + (p2[ax] - p0[ax]) * t
          + (2 * p0[ax] - 5 * p1[ax] + 4 * p2[ax] - p3[ax]) * t2
          + (3 * p1[ax] - p0[ax] - 3 * p2[ax] + p3[ax]) * t3);
      }
    }
    const end = nodes[TAIL_SEGS + 1];

    // The first ring's side axis is the animal's own left-right and each ring
    // after it takes the one before's, squared up to its own direction: the
    // twist is settled once at the root, so a wag bends the facets and never
    // rolls them round the tail.
    nrm.set(1, 0, 0);
    for (let i = 0; i < nRings; i++) {
      const a = centres[Math.max(0, i - 1)], b = i === nRings - 1 ? end : centres[i + 1];
      if (i === 0) tan.set(0, 1, 0);
      else tan.subVectors(b, a).normalize();
      nrm.addScaledVector(tan, -nrm.dot(tan));
      if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, 1).addScaledVector(tan, -tan.z);
      nrm.normalize();
      bin.crossVectors(tan, nrm);
      const r = i === 0 ? girth(0) : girth(ringU[i - 1]);
      const c = centres[i];
      for (let j = 0; j < TAIL_SIDES; j++) {
        const t = (j / TAIL_SIDES) * Math.PI * 2;
        const cs = Math.cos(t) * r, sn = Math.sin(t) * r;
        const o = (i * TAIL_SIDES + j) * 3;
        skinPos[o] = c.x + nrm.x * cs + bin.x * sn;
        skinPos[o + 1] = c.y + nrm.y * cs + bin.y * sn;
        skinPos[o + 2] = c.z + nrm.z * cs + bin.z * sn;
      }
    }
    skinPos.set([0, -deep - 0.5 * girth(0), 0, end.x, end.y, end.z], rootApex * 3);
    skinGeo.attributes.position.needsUpdate = true;
    skinGeo.computeVertexNormals();
    skinGeo.computeBoundingSphere();
    skinGeo.computeBoundingBox();
  }
  layTail();

  // ---- what it does -------------------------------------------------------
  // Nothing dramatic, ever. It breathes; the tail drifts. Disturb it and it
  // swivels an ear, turns its head a few degrees and curls its tail, then goes
  // back to ignoring you.
  const skullBaseX = skull.rotation.x;
  const skullBaseZ = skull.rotation.z;
  let stirs = 0;
  let stirT = -1;      // -1 idle, else seconds into the stir
  let env = 0;         // 0..1, the shape of it

  function stir() {
    if (stirT >= 0) return false;
    stirT = 0;
    stirs++;
    return true;
  }

  let clock = 0;

  function update(dt, simTime) {
    clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
    if (stirT >= 0) {
      stirT += dt;
      if (stirT >= STIR_DUR) { stirT = -1; env = 0; }
      else { const s = Math.sin(Math.PI * (stirT / STIR_DUR)); env = s * s; }
    }

    // breathing, in the trunk only — scaling the whole cat would pump its legs
    // through the ground. Across and in depth, never along the spine: the
    // body mesh's own y is up and its z is forward (quadruped.js).
    const br = 1 + 0.014 * Math.sin(clock * 0.75);
    body.scale.x = br;
    body.scale.y = br;

    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      const w = i / (joints.length - 1);
      j.rotation.x = j.userData.baseX
        + env * TAIL_CURL * (0.35 + 0.65 * w)
        + 0.012 * Math.sin(clock * 0.50 - i * 0.7);
      // THE WAG. The sweep used to be a one-way lean that rose and fell with
      // the envelope — the tail leaned aside and came back once, which is not
      // what a tail does. It oscillates now, at TAIL_WAG_HZ, with the envelope
      // as its amplitude: it starts still, wags while the cat is stirred, and
      // is still again at the end. The travelling phase offset down the joints
      // (-i * 0.55) makes the wag run OUT along the tail instead of the whole
      // thing swinging as one rigid rod.
      j.rotation.z = j.userData.baseZ
        + env * TAIL_SWEEP * (0.2 + 0.8 * w)
        + env * TAIL_WAG * (0.25 + 0.75 * w)
          * Math.sin(2 * Math.PI * TAIL_WAG_HZ * clock - i * 0.55)
        + 0.020 * Math.sin(clock * 0.55 - i * 0.6);
    }
    layTail();

    for (let i = 0; i < ears.length; i++) {
      const ear = ears[i];
      const k = i === 0 ? 1 : 0.68;           // one ear goes further than the other
      ear.rotation.x = -EAR_SWIVEL * env * k;
      ear.rotation.z = ear.userData.baseZ
        + EAR_SPREAD * env * k * Math.sign(ear.userData.baseZ || 1);
    }

    // The head comes round AND cocks over. The turn was always here; the tilt
    // is what makes it read as a cat rather than as a head on a stick.
    skull.rotation.x = skullBaseX - 0.22 * env;
    skull.rotation.y = 0.46 * env;
    skull.rotation.z = skullBaseZ + HEAD_TILT * env;
  }

  function meshes() {
    const out = [];
    group.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  }

  return {
    group, torso, skull, ears, joints, tail: tailRoot, material,
    stir, update, meshes,
    stirring() { return stirT >= 0; },
    stirLevel() { return env; },
    stirCount() { return stirs; },
  };
}
