import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { hash1 } from '../util/noise.js';

// Nansen's cat (case 14). The third preset on the shared quadruped, after the
// dog and the buffalo: the same barrel-and-four-legs plan run SMALL and ROUND —
// a compact body on short legs, a little skull with a blunt muzzle, big
// triangular ears set wide, and a long jointed tail.
//
// Two things here are not the dog with different numbers.
//
// THE SEATED POSE. A cat that matters to a koan is sitting, unbothered, while
// everyone else argues. makeQuadruped only builds a standing animal, so 'sit'
// is applied afterwards as one rigid rotation: everything above the legs goes
// into a `torso` group hinged at the REAR HIP and pitched nose-up, then dropped
// until the rump rests near the ground. The front legs stay vertical and are
// re-derived against the raised chest; the rear legs tuck forward and shorten
// into the haunch. The skull rides in its own group so it can be counter-rotated
// back to level — otherwise the cat sits there staring at the sky.
//
// Every one of those lengths is COMPUTED from the barrel, not hand-tuned, for
// the same reason THE LEG RULE in quadruped.js exists. Tilting the barrel makes
// the old rule wrong in a new way: a vertical leg standing at lateral offset x
// under an axis pitched by t meets the surface at depth
//
//     d = sqrt((kR)^2 - x^2) / cos(t)
//
// below the axis, which is DEEPER than the upright case. Sizing a seated leg
// with the standing formula floats it clear of the belly all over again.
//
// THE TAIL. The buffalo's verlet strand is wrong here twice over: at a cat's
// scale its idle force is four times as strong relative to the segment spacing
// (it would thrash, and this cat has to read as calm), and a rope cannot hold a
// shape. This tail is a chain of jointed segments instead, so it rests in an
// authored curve and CURLS — bending one joint carries everything past it.
//
// Faces +z, like its siblings. Returns a handle: the cat has moving parts.

const P = {
  bodyR: 0.25, bodyLen: 0.62, bodyDrop: 0.18,
  legH: 0.46, legR: 0.068, legTaper: 0.90, hipX: 0.13, hipZ: 0.26,
};

const SIT_TILT = 0.80;      // radians the spine pitches up off horizontal
const SIT_LEVEL = 0.85;     // how much of that the neck takes back out of the skull
// Pitching the spine up about the REAR hip swings the shoulders — and the skull
// riding on them — up and BACKWARD. Counter-rotating the skull levels its angle
// but does not move it, so a head that sat correctly in front of the chest while
// standing ends up sunk inside it: measured, the seated skull sat at z 0.019
// against a body reaching z 0.167, i.e. wholly swallowed. It has to be walked
// back out along the tilted spine as well as levelled.
// Expressed as a WORLD-space forward offset and decomposed into the tilted
// torso's own axes below. Nudging it along the torso's local +z instead climbs
// the pitched spine and hoists the skull: that made the seated cat 18% taller
// overall and its own size test caught it.
const SIT_HEAD_FWD = 0.26;  // in heights, horizontally
const SIT_CLEAR = 0.05;     // rump rides this far off the ground, in heights
const SIT_REAR_Z = -0.10;   // tucked forward of the standing hip
const SIT_REAR_X = 0.155;   // and splayed a little wider
const BURY = 0.90;          // leg top sits this deep inside the barrel, as a fraction of R

const TAIL_SEGS = 7;
const TAIL_LEN = 0.95;
const TAIL_R0 = 0.034;      // root
const TAIL_R1 = 0.015;      // tip
// Cumulative pitch of each joint off horizontal-backward. Seated, the tail lies
// low behind the haunch and lifts at the tip; standing, it carries high.
const SIT_TAIL = [-0.35, -0.20, -0.05, 0.05, 0.15, 0.35, 0.60];
const STAND_TAIL = [-0.12, 0.02, 0.20, 0.42, 0.66, 0.90, 1.12];

const STIR_DUR = 4.6;       // seconds for one unhurried stretch-and-settle
const TAIL_CURL = 0.15;     // extra bend per joint at the peak of a stir
const TAIL_SWEEP = 0.10;    // and the sideways sweep that goes with it
const EAR_SWIVEL = 0.50;
const EAR_SPREAD = 0.12;

export function makeCat({ height = 0.32, color = INK, seed = 14, pose = 'sit' } = {}) {
  const h = height;
  const seated = pose === 'sit';

  const { group, material } = makeQuadruped({
    height, color, seed,
    bodyR: P.bodyR, bodyLen: P.bodyLen, bodyDrop: P.bodyDrop,
    legH: P.legH, legR: P.legR, legTaper: P.legTaper, hipX: P.hipX, hipZ: P.hipZ,
    // short neck — a cat carries its head almost on the shoulders
    neck: { r: 0.095, len: 0.22 },
    head: { shape: 'sphere', r: 0.175, fwd: 0.44, up: 0.24 },
    // blunt and short: a cat's muzzle barely leaves the skull
    snout: { r0: 0.058, r1: 0.100, len: 0.16, fwd: 0.60, up: 0.205 },
    // Tall, wide-set and leaning OUT — see the sign note in quadruped.js. They
    // have to clear the skull in BOTH directions: standing above it is what says
    // "cat", but a pair no wider than the head reads as two bumps at distance,
    // which is the failure the buffalo's horns shipped with.
    ears: { r: 0.075, h: 0.25, x: 0.122, up: 0.33, fwd: 0.42, tilt: 0.42 },
    // THE CROUCH. Weight riding over raised hindquarters with the shoulders
    // barely troubling the back line is the one silhouette cue that keeps
    // this reading as a compact cat and not a small dog on the same barrel.
    // Both masses obey quadruped.js's own mass() rule (`up + r*scaleY` must
    // clear `bodyR` to stand proud of the barrel rather than sink invisibly
    // inside it) — haunch clears it by a wide margin (40% of bodyR), shoulder
    // by much less (16%), which is what makes one read as raised and the
    // other as low without either vanishing into the capsule. `back`/`fwd`
    // are derived from `hipZ` (a little short of it, the same reasoning
    // dog.js's haunch comment gives) so the bumps sit where the legs actually
    // root rather than drifting if the barrel's proportions ever move.
    //
    // Both numbers above describe the STANDING body plan — the frame every
    // other species' haunch/shoulder is written in, and the one `pose:
    // 'stand'` actually renders unmodified. Seated (the case's own default,
    // and everything the workbench/k14 shots below show) runs this same
    // plan through the pitched-torso transform below, which swings mass
    // FORWARD of the rear-hip pivot up and back much more than mass near it
    // (see "Pitching the spine up..." a few lines down) — so in the seated
    // render the shoulder mass, being far from the pivot, actually rides
    // higher than the haunch, which sits almost on top of it. That is not a
    // bug here: it is the ordinary look of a cat sitting upright (chest and
    // shoulders held up, haunches low and tucked), and it is what
    // `after-cat-side.jpeg` shows. The plan-level "haunch high, shoulder
    // low" claim is honest about the barrel these masses are authored
    // against, not a claim about every pose that barrel can be posed into.
    haunch: { r: 0.19, scaleY: 0.85, scaleZ: 1.08, up: 0.19, back: P.hipZ - 0.02 },
    shoulder: { r: 0.20, scaleY: 0.85, up: 0.12, fwd: P.hipZ - 0.06 },
    // no tail here; this one is jointed and built below
  });
  group.name = 'cat';

  const R = P.bodyR * h;
  const hipX = P.hipX * h;
  const hipZ = P.hipZ * h;
  const bodyY = (P.legH + P.bodyDrop) * h;
  const standLegTop = bodyY - Math.sqrt(Math.max(0, R * R - hipX * hipX)) + 0.06 * h;

  // ---- split the animal into legs and a torso that can pitch ---------------
  const frontLegs = [], rearLegs = [];
  const ears = [];
  let head = null, snout = null;
  for (const child of group.children) {
    if (child.name === 'ear') ears.push(child);
    else if (child.name === 'head') head = child;
    else if (child.name === 'snout') snout = child;
  }

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

  // the skull rides in its own group so the seated pose can level it out
  const skull = new THREE.Group();
  skull.name = 'skull';
  skull.position.copy(head.position);
  for (const part of [head, snout, ...ears]) {
    if (!part) continue;
    part.position.sub(skull.position);
    skull.add(part);
  }
  torso.add(skull);
  for (const ear of ears) ear.userData.baseZ = ear.rotation.z;

  // ---- sit ----------------------------------------------------------------
  const tilt = seated ? SIT_TILT : 0;
  const cosT = Math.cos(tilt);
  // local z of the barrel's axis at its rear cap, measured from the pivot
  const rearAxisZ = -P.bodyLen * h / 2 + hipZ;
  // sink the torso until the rump rides just clear of the ground
  const drop = seated
    ? bodyY + rearAxisZ * Math.sin(tilt) - R - SIT_CLEAR * h
    : 0;

  // how far below the (tilted) barrel axis a vertical leg top must sit
  const legDrop = (x) => Math.sqrt(Math.max(0, (BURY * R) ** 2 - x * x)) / cosT;

  if (seated) {
    torso.position.y = bodyY - drop;
    torso.rotation.x = -tilt;                 // negative pitches the front UP
    skull.rotation.x = tilt * SIT_LEVEL;      // and the neck takes most of it back
    // ...then out of the chest, horizontally — see the note on SIT_HEAD_FWD
    skull.position.z += SIT_HEAD_FWD * h * cosT;
    skull.position.y -= SIT_HEAD_FWD * h * Math.sin(tilt);

    const seatLeg = (leg, zWorld, xWorld) => {
      const s = (zWorld + hipZ) / cosT;       // distance along the axis from the pivot
      const axisY = (bodyY - drop) + s * Math.sin(tilt);
      const top = axisY - legDrop(xWorld);
      leg.scale.y = top / standLegTop;
      leg.position.set(Math.sign(leg.position.x) * xWorld, top / 2, zWorld);
    };
    // the shoulder has swung up and back over the haunch; the front legs stand
    // straight under wherever it ended up
    const frontZ = -hipZ + 2 * hipZ * cosT;
    for (const leg of frontLegs) seatLeg(leg, frontZ, hipX);
    for (const leg of rearLegs) seatLeg(leg, SIT_REAR_Z * h, SIT_REAR_X * h);
  }

  // ---- the tail -----------------------------------------------------------
  // Where the rump ended up, whichever pose we are in.
  const rump = new THREE.Vector3(
    0,
    (bodyY - drop) + rearAxisZ * Math.sin(tilt),
    -hipZ + rearAxisZ * cosT,
  );

  const rest = seated ? SIT_TAIL : STAND_TAIL;
  const segLen = TAIL_LEN * h / TAIL_SEGS;
  const tailRoot = new THREE.Group();
  tailRoot.name = 'tail';
  tailRoot.position.set(0, rump.y + (seated ? -0.08 : 0.06) * h, rump.z - 0.055 * h);
  // A joint's local +y runs along the tail. Rotating x by (pitch - PI/2) aims
  // that backward along -z, pitched off horizontal by `pitch`.
  tailRoot.rotation.x = rest[0] - Math.PI / 2;

  const joints = [];
  let parent = tailRoot;
  for (let i = 0; i < TAIL_SEGS; i++) {
    const joint = new THREE.Group();
    joint.name = 'tailjoint';
    if (i > 0) {
      joint.position.y = segLen;             // stack along the parent segment
      joint.rotation.x = rest[i] - rest[i - 1];
      // one seeded kink, so two cats do not carry identical tails
      joint.rotation.z = (hash1(i * 3 + 1, seed) - 0.5) * 0.10;
    }
    joint.userData.baseX = joint.rotation.x;
    joint.userData.baseZ = joint.rotation.z;

    const a = i / TAIL_SEGS, b = (i + 1) / TAIL_SEGS;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(
      (TAIL_R0 + (TAIL_R1 - TAIL_R0) * b) * h,
      (TAIL_R0 + (TAIL_R1 - TAIL_R0) * a) * h,
      segLen, 5), material);
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
  const body = torso.getObjectByName('body');
  const skullBaseX = skull.rotation.x;
  let stirs = 0;
  let stirT = -1;      // -1 idle, else seconds into the stir
  let env = 0;         // 0..1, the shape of it

  function stir() {
    if (stirT >= 0) return false;
    stirT = 0;
    stirs++;
    return true;
  }

  function update(dt, simTime) {
    if (stirT >= 0) {
      stirT += dt;
      if (stirT >= STIR_DUR) { stirT = -1; env = 0; }
      else { const s = Math.sin(Math.PI * (stirT / STIR_DUR)); env = s * s; }
    }

    // breathing, in the barrel only — scaling the whole cat would pump its legs
    // through the ground
    const br = 1 + 0.014 * Math.sin(simTime * 0.75);
    body.scale.x = br;
    body.scale.z = br;

    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      const w = i / (joints.length - 1);
      j.rotation.x = j.userData.baseX
        + env * TAIL_CURL * (0.35 + 0.65 * w)
        + 0.012 * Math.sin(simTime * 0.50 - i * 0.7);
      j.rotation.z = j.userData.baseZ
        + env * TAIL_SWEEP * (0.2 + 0.8 * w)
        + 0.020 * Math.sin(simTime * 0.55 - i * 0.6);
    }

    for (let i = 0; i < ears.length; i++) {
      const ear = ears[i];
      const k = i === 0 ? 1 : 0.68;           // one ear goes further than the other
      ear.rotation.x = -EAR_SWIVEL * env * k;
      ear.rotation.z = ear.userData.baseZ
        + EAR_SPREAD * env * k * Math.sign(ear.userData.baseZ || 1);
    }

    skull.rotation.x = skullBaseX - 0.10 * env;
    skull.rotation.y = 0.26 * env;
  }

  function meshes() {
    const out = [];
    group.traverse((o) => { if (o.isMesh && !o.userData.isOutline) out.push(o); });
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
