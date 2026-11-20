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
//      a single unbroken slope. The trunk's own loft carries on up a short
//      thick neck into the skull (quadruped.js, `neck`), so there is no notch
//      behind the head for the eye to read as a ball perched on a body.
//   2. A SMALL HEAD WITH TWO POINTS ON IT. One loft (skull.js), wider than it
//      is deep and barely longer than it is wide: a rounded wedge. The ears
//      root on its back corners with a flat of crown showing between them.
//      A head as wide as the body is a toy's.
//   3. A SITTING CAT IS A PEAR STANDING ON ITS HAUNCHES. See THE SEATED POSE.
//   4. THE TAIL IS A LINE WITH A CURVE IN IT. See THE TAIL.
//
// THE SEATED POSE. A cat that matters to a koan is sitting, unbothered, while
// everyone else argues. makeQuadruped only builds a standing animal, so 'sit'
// is applied afterwards: everything above the legs goes into a `torso` group
// hinged at the REAR HIP and pitched nose-up, then lowered until the rump
// rests just clear of the ground. The skull rides in its own group so it can
// be counter-rotated back to level — otherwise the cat sits staring at the sky.
//
// A standing animal folded in half is not a sitting one, and three things
// here are what make the difference:
//
//   - THE HIND LEGS ARE HAUNCHES. A standing hind leg rescaled to fit under a
//     lowered rump is a flap hanging off the flank with daylight behind it.
//     Seated, each hind leg is its own loft instead: a mass lying along the
//     ground beside the body — tallest over the hip, falling at the knee to a
//     low paw that reaches forward beside the front feet. The pair stand wider
//     than the trunk, which is the base of the pear from the front, and they
//     close the gap under the belly from the side.
//   - THE HEAD IS PLACED FOR THE POSE, NOT CARRIED OVER. Pitching the spine
//     swings a standing head up and back until the chest swallows it, and
//     walking it back out afterwards leaves the neck behind. So the plan is
//     simply told where a sitting cat carries its head — in line with the
//     spine, see SIT.head — and the neck is lofted to that.
//   - THE TRUNK IS SHORTER IN THE BREAST. The breast's overhang ahead of the
//     shoulder points at the sky once the spine is pitched, and a long one is
//     a pouter pigeon's chest standing out past the chin.
//
// EVERY JOIN IS READ OFF THE POSED MESH. The trunk is lofted, pitched and
// lowered, and no closed form says where its surface is under a given paw.
// So the body's vertices are carried into the animal's own frame once
// (`pts`), and the rest is measured from them: how far to lower the torso,
// where a vertical leg enters the chest (`column`), where the haunch's
// origin sits so that it is inside the body, and where the tail leaves the
// rump. tests/cat.test.js and tests/k14-cat.test.js check the joins against
// the mesh in both poses.
//
// THE TAIL. The buffalo's verlet strand is wrong here twice over: at a cat's
// scale its idle force would thrash, and a rope cannot hold a shape. This
// tail is a chain of jointed segments, so it rests in an authored curve and
// CURLS — bending one joint carries everything past it. Seated, it lies along
// the ground behind the rump and hooks round to one side (the seed picks
// which) with the tip lifted: a straight tail is a stick laid behind the cat,
// and the hook is what still reads as a tail from above and in front, which
// is where the cases stand. It tapers and ends in a point.
//
// Faces +z, like its siblings. Returns a handle: the cat has moving parts.

const P = {
  bodyR: 0.23, bodyDrop: 0.18,
  legH: 0.46, legR: 0.058, legTaper: 1.0, hipX: 0.1, hipZ: 0.36,
};

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). Read down the
// half-width column for the wedge — widest at the cheek, straight after it —
// and down `top` for the profile: a low crown, a short fall, a muzzle that
// barely leaves the face.
const SKULL = [
  [-0.1, 0.085, -0.075, 0.105],
  [-0.02, 0.122, -0.108, 0.158],
  [0.06, 0.108, -0.106, 0.142],
  [0.115, 0.05, -0.092, 0.082],
  [0.15, 0.028, -0.082, 0.058],
];
const SKULL_BACK = [0.0, -0.14];         // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.03, 0.168];
// Rooted inside the back corners of the skull and leaning out, so the tips
// stand as far apart as the head is wide. The pair has to clear the skull in
// BOTH directions: standing above it is what says "cat", but a pair no wider
// than the head reads as two bumps at distance.
const EARS = { r: 0.058, h: 0.18, x: 0.082, y: 0.06, z: -0.035, tilt: 0.4 };
// Barely a neck: as deep where it enters the skull as the skull allows, so
// the nape and the throat are the trunk's own lines arriving at the head.
const NECK = { r: 0.088, w: 1.05, root: 0.6, set: 0.2, taper: 1.0, arch: 0.0 };

// Each pose states its own trunk and where the head is carried, in the plan's
// own terms (quadruped.js): a standing cat is deep in the chest, tucked at the
// flank and carries its head barely above the line of its back; a sitting one
// has settled into its hips — full and wide at the base, narrowing to the
// shoulders, with the back bowed out between them.
const STAND = {
  bodyLen: 0.6,
  torso: { chest: 1.05, loin: 0.78, withers: 1.0, back: 0.95, croup: 0.95 },
  head: { fwd: 0.52, up: 0.2 },
  legs: { shoulder: 2.3 },
};
const SIT = {
  bodyLen: 0.46,
  torso: { chest: 0.86, loin: 1.0, withers: 0.86, back: 1.04, croup: 1.0, shoulderW: 0.72, barrelW: 0.98, hipW: 1.02 },
  // in the PITCHED torso's frame: ahead of the breast along the spine
  head: { fwd: 0.625, up: 0.045 },
  // A seated front leg is a column under the chest. The mass that gives a
  // standing leg its shoulder is stretched with the leg when it is cut to the
  // lifted chest, and at full size it stands off the breast as a plate.
  legs: { shoulder: 1.6, proud: 0.03 },
};

const SIT_TILT = 0.98;      // radians the spine pitches up off horizontal
const SIT_LEVEL = 1.0;      // how much of that the skull takes back out
const SIT_CLEAR = 0.02;     // the rump rides this far off the ground, in heights
const SIT_FRONT_Z = 0.07;   // the front paws stand this far ahead of the shoulder, in heights
const BURY = 0.3;           // a seated front leg's top, as a fraction of the way up through the chest above it

// THE HAUNCH, rump to toe: [z, top, bottom, half-width] in heights, in the
// animal's own frame with the ground at zero — the same cut as the skull, and
// the same builder. `top` is the whole read: up over the hip, level along the
// thigh, down at the knee, and a paw. It stays under the back line all the
// way, so from the side the back is still the cat's outline. The toe stops
// level with the front paws' own toes: measured at the ground, not against
// the front leg's whole depth, which includes the shoulder above it.
const HAUNCH = [
  [-0.41, 0.35, 0.01, 0.082],
  [-0.25, 0.5, 0.0, 0.112],
  [-0.1, 0.47, 0.0, 0.115],
  [0.02, 0.33, 0.0, 0.09],
  [0.06, 0.12, 0.0, 0.06],
  [0.125, 0.085, 0.0, 0.052],
];
const HAUNCH_BACK = [0.1, -0.5];
const HAUNCH_TOE = [0.03, 0.162];
const HAUNCH_X = 0.165;                  // its centre plane, off the animal's own
const HAUNCH_JOIN_Z = -0.2;              // where its origin is sunk into the body

const TAIL_SEGS = 7;
const TAIL_LEN = 1.05;
const TAIL_R0 = 0.055;      // root
const TAIL_R1 = 0.03;       // the last joint, before it closes to a point
// Cumulative pitch of each joint off horizontal-backward. Seated, the tail
// lies along the ground and lifts at the tip; standing, it carries high.
const SIT_TAIL = [0.0, -0.02, 0.0, 0.04, 0.1, 0.22, 0.4];
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

export function makeCat({ height = 0.32, color = INK_LIT, seed = 14, pose = 'sit' } = {}) {
  const h = height;
  const seated = pose === 'sit';
  const POSE = seated ? SIT : STAND;

  const { group, material, plan } = makeQuadruped({
    height, color, seed,
    bodyR: P.bodyR, bodyLen: POSE.bodyLen, bodyDrop: P.bodyDrop,
    torso: POSE.torso,
    legH: P.legH, legR: P.legR, legTaper: P.legTaper, hipX: P.hipX, hipZ: P.hipZ,
    legs: POSE.legs,
    neck: NECK,
    // The plan's ball only says where the head is carried; its geometry is
    // replaced by the loft below. No snout: the muzzle is the front of it.
    head: { shape: 'sphere', r: 0.1, fwd: POSE.head.fwd, up: POSE.head.up },
    ears: EARS,
    // No tail here; this one is jointed and built below.
  });
  group.name = 'cat';

  const hipX = P.hipX * h;
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

  // The trunk as posed, in the animal's own frame — see EVERY JOIN IS READ OFF
  // THE POSED MESH. Lowering the torso comes first, since everything else is
  // measured from where the body ends up.
  const body = torso.getObjectByName('body');
  const geo = body.geometry;
  const local = geo.getAttribute('position');
  const index = geo.index;
  const pts = [];
  {
    torso.updateMatrix();
    body.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(torso.matrix, body.matrix);
    const v = new THREE.Vector3();
    let low = Infinity;
    for (let i = 0; i < local.count; i++) {
      v.fromBufferAttribute(local, i).applyMatrix4(m);
      pts.push(v.x, v.y, v.z);
      low = Math.min(low, v.y);
    }
    const drop = seated ? low - SIT_CLEAR * h : 0;
    torso.position.y -= drop;
    for (let i = 1; i < pts.length; i += 3) pts[i] -= drop;
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
    // The shoulder has swung up and back over the haunch; the front legs stand
    // plumb under the chest, a little ahead of it, and are cut to the length
    // the lifted chest leaves them.
    const frontZ = -hipZ + 2 * hipZ * Math.cos(tilt) + SIT_FRONT_Z * h;
    const chest = column(hipX, frontZ);
    const top = chest.lo + BURY * (chest.hi - chest.lo);
    for (const leg of frontLegs) {
      // the limb hangs from its top (quadruped.js), so the mesh origin sits AT
      // the join and scaling about it shortens the leg onto the ground
      leg.scale.y = top / plan.legTop.front;
      leg.position.set(Math.sign(leg.position.x) * hipX, top, frontZ);
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
  tailRoot.position.set(
    0,
    Math.max(pts[rumpI * 3 + 1] + (seated ? 0 : 0.03 * h), (TAIL_R0 + 0.025) * h),
    pts[rumpI * 3 + 2] + 0.06 * h,
  );
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

    const a = i / TAIL_SEGS, b = (i + 1) / TAIL_SEGS;
    const tip = i === TAIL_SEGS - 1;
    // Cut 30% longer than the joint spacing (still centred on it), so each
    // segment overlaps its neighbour and a curled joint never opens daylight.
    // Replaced a merged joint ball — even trimmed flush it beaded the tail;
    // overlap covers the same gap without touching the silhouette. The last
    // one closes to a point instead of a sawn end.
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(
      (tip ? 0.3 * TAIL_R1 : TAIL_R0 + (TAIL_R1 - TAIL_R0) * b) * h,
      (TAIL_R0 + (TAIL_R1 - TAIL_R0) * a) * h,
      segLen * 1.3, 5), material);
    seg.name = 'tailseg';
    seg.position.y = segLen / 2;
    joint.add(seg);

    parent.add(joint);
    joints.push(joint);
    parent = joint;
  }
  group.add(tailRoot);

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
