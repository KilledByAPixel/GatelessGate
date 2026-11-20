import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { hash1, noise1 } from '../util/noise.js';
import { makeQuadruped } from './quadruped.js';
import { skullGeometry } from './skull.js';

// Hyakujo's fox (case 2): the dog's body plan run slim and low. Three things
// carry the silhouette at distance, and a fox that misses any of them reads as
// a small dog:
//
//   1. LOW and LONG. A fox is a line held just off the ground, not a box on
//      legs. Short legs under a long body.
//   2. A narrow pointed muzzle under big upright triangular ears. The head is
//      ONE wedge (skull.js): broad at the cheek, flat on top, and drawn
//      straight out to a point with barely a stop — a ball with a spout on it
//      was a toy's head, and the dog's blunt muzzle under a brow is the other
//      animal. The ears are most of the head's outline: taller than the skull
//      is deep, and BROAD at the base. Tall and thin they were a hare's, or a
//      pair of horns.
//   3. THE BRUSH. A fox is mostly tail. It leaves the croup and is carried
//      low and straight out behind, never above the back — cocked up is the
//      dog's line, and the two animals are told apart by that at any distance
//      — and it is two thirds as thick as the body. A thin tail reads as a
//      cat.
//
// Faces +z like every quadruped in the kit. Built on makeQuadruped so the
// leg-to-belly join is computed rather than guessed (see THE LEG RULE there),
// then the skull and the brush are lifted onto pivots of their own so the koan
// can turn them without touching the shared body plan.

// Proportions in units of `height`. Named, because the tail anchor below is
// DERIVED from them — hand-tuned offsets drift the moment anything changes.
const LEG_H = 0.42, BODY_DROP = 0.17;
const BODY_Y = LEG_H + BODY_DROP;        // height of the body's axis
const BODY_R = 0.16, BODY_LEN = 0.66;

// THE BRUSH. A 'stiff' tail is centred on its own origin, so half of
// its length lives inside the animal. Rather than guess an offset and discover
// the thick end poking out of the back, anchor the buried end at a stated
// point inside the croup and solve for the centre the quadruped wants. The
// tail then emerges cleanly from the rump at any length or angle.
const TAIL_TILT = -1.72;                // rad off vertical, backward: past level, so it trails a touch down
const TAIL_LEN = 0.90;
const TAIL_ROOT = [0.045, -0.30];       // [above the body's axis, z] — inside the croup
const TAIL_AXIS_Y = Math.cos(TAIL_TILT);
const TAIL_AXIS_Z = Math.sin(TAIL_TILT);
const TAIL_UP = TAIL_ROOT[0] + (TAIL_LEN / 2) * TAIL_AXIS_Y;
const TAIL_BACK = -(TAIL_ROOT[1] + (TAIL_LEN / 2) * TAIL_AXIS_Z);

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). Read down the
// `top` column: a flat crown and then one long fall to the nose, with the
// stop no more than a change of slope. The half-widths are the other half of
// it — broad at the cheek and pinched hard just ahead of it, so from the front
// and from above the face is a triangle.
const SKULL = [
  [-0.075, 0.058, -0.042, 0.06],
  [-0.01, 0.08, -0.07, 0.092],
  [0.06, 0.07, -0.064, 0.078],
  [0.115, 0.042, -0.054, 0.044],
  [0.18, 0.028, -0.044, 0.031],
  [0.25, 0.014, -0.034, 0.021],
];
const SKULL_BACK = [0.01, -0.1];        // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.012, 0.272];
const HEAD_NOSE_DOWN = 0.1;             // rad the whole head is carried nose-down
// The skull hinges straight below the point the neck ends on: an offset fore
// or aft swings the cheek off the end of the neck as the head turns.
const HINGE_DOWN = 0.02;                // x height
// A cone is as deep as it is wide, and an ear is a leaf: flattened fore and
// aft, so it is a broad triangle from the front and a blade from the side.
const EAR_FLAT = 0.55;

const STIR = 2.4;                        // seconds for one whole response

// A deep fold at the hock: a fox stands crouched over its hind legs, and the
// angle is most of what keeps it from reading as a small dog on stilts.
const KNEE = 0.38;                       // rad, hind hock bend

export function makeFox({ height = 0.45, color = INK_LIT, seed = 2 } = {}) {
  const { group } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    torso: { chest: 1.25, loin: 0.68, withers: 1.0, back: 0.92, croup: 0.95, shoulderW: 0.78, barrelW: 0.9, hipW: 0.82 },
    legBury: .13,
    legH: LEG_H, legR: 0.058, legTaper: 1.0, hipX: 0.07, hipZ: 0.31,
    legs: { knee: KNEE, shoulder: 2.0, thigh: 3.0, hindSet: 0.09 },
    // the neck's end has to fit inside the skull it enters, turned or not
    neck: { r: 0.056, w: 0.9, root: 0.65, set: 0.2, taper: 1.1, arch: 0.02 },
    // The plan's ball only says where the head is carried — low and forward,
    // barely above the back — and how far it is nosed down; its geometry is
    // replaced by the loft below. No snout: the muzzle is that loft's front.
    head: { shape: 'sphere', r: 0.1, fwd: 0.6, up: 0.2, tilt: HEAD_NOSE_DOWN },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): base offsets from
    // the point the neck ends on — inside the back corners of the skull, so
    // the join is buried — and leaning out a little.
    ears: { r: 0.062, h: 0.215, x: 0.05, y: 0.024, z: -0.03, tilt: 0.3 },
    tail: {
      // thin where it leaves the rump, fat through the middle, drawn to a
      // point: `swell` is what makes it a brush and not a club. The root end
      // is buried in the rump (see THE BRUSH above) and hand-sized against
      // it, so re-eyeball it if the body's own radius changes.
      kind: 'stiff', r0: 0.05, r1: 0.05, swell: 2.3,
      length: TAIL_LEN, up: TAIL_UP, back: TAIL_BACK, tilt: TAIL_TILT,
    },
  });
  group.name = 'fox';

  // ---- the skull, onto its own hinge -----------------------------------
  // makeQuadruped hangs the head and ears straight off the body, which is
  // right for a body plan and useless for a look. Re-parent them onto a pivot
  // under the end of the neck; the neck stays behind, buried, so the head
  // turns against it instead of dragging it along. The pivot is read off the
  // head the plan placed, so it follows the head when the carriage is retuned.
  const headMesh = group.children.find((c) => c.name === 'head');
  headMesh.geometry.dispose();
  headMesh.geometry = skullGeometry(SKULL, { unit: height, back: SKULL_BACK, nose: SKULL_NOSE });
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(0, headMesh.position.y - HINGE_DOWN * height, headMesh.position.z);
  group.add(headPivot);
  for (const part of group.children.slice()) {
    if (part.name === 'head' || part.name === 'ear') {
      part.position.sub(headPivot.position);
      headPivot.add(part);
    }
  }
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  for (const ear of ears) ear.scale.z = EAR_FLAT;
  // (The old EAR_SPIN facet hack lived here — quadruped.js now bakes half a
  // facet of pre-spin into the ear GEOMETRY so a flat face meets the 3/4
  // camera, and rotation.y belongs to the shared placement. Nothing to do.)

  // ---- the brush, onto its own hinge -----------------------------------
  // Rotating the tail MESH about y does nothing: y is its own long axis. The
  // sweep has to happen about the anchor, which is exactly where the pivot goes.
  const tailMesh = group.children.find((c) => c.name === 'tail');
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, (BODY_Y + TAIL_ROOT[0]) * height, TAIL_ROOT[1] * height);
  group.add(tailPivot);
  if (tailMesh) {
    tailMesh.position.sub(tailPivot.position);
    tailPivot.add(tailMesh);
  }

  let look = 0;          // the head's resting bearing, set by the koan
  let stir = 0;          // 1 -> 0 across one response
  let notices = 0;
  let yaw = 0, sweep = 0;

  // Everything below is a pure function of (simTime, stir). No wall clock, no
  // random: two foxes on the same seed pose identically forever.
  function update(dt, simTime) {
    if (stir > 0) stir = Math.max(0, stir - dt / STIR);
    const p = 1 - stir;                                   // 0 -> 1 across the response
    const swell = Math.sin(Math.PI * p);                  // out and back; 0 at rest
    const flick = Math.sin(Math.PI * Math.min(1, p * 3.4)); // spent in the first third

    // idle: the head drifts. Never still, never busy.
    yaw = look
      + (noise1(simTime * 0.21 + seed * 1.7, seed) - 0.5) * 0.17
      + swell * 0.42;
    headPivot.rotation.y = yaw;
    headPivot.rotation.x = (noise1(simTime * 0.16 + 5.5, seed + 3) - 0.5) * 0.06 - swell * 0.05;

    // ears: each on its own slow cycle, so they never twitch in unison, plus a
    // hard flick when something is noticed
    ears.forEach((ear, i) => {
      const ph = simTime * 0.31 + i * 0.57 + hash1(i + 1, seed);
      const w = ph - Math.floor(ph);
      const twitch = w < 0.14 ? Math.sin(Math.PI * (w / 0.14)) : 0;
      ear.rotation.x = -(twitch * 0.18 + flick * (i === 0 ? 0.44 : 0.28));
    });

    // the brush: a slow sweep that outlasts the ears
    sweep = Math.sin(simTime * 0.37 + seed) * 0.05
      + (noise1(simTime * 0.19 + 2.3, seed + 7) - 0.5) * 0.10
      + swell * 0.34;
    tailPivot.rotation.y = sweep;
    tailPivot.rotation.x = -swell * 0.09;
  }

  update(0, 0);

  return {
    group,
    head: headPivot,
    tail: tailPivot,
    ears,
    // where the fox is looking when nothing has disturbed it, in its own frame
    setLook(a) { look = a; update(0, 0); return this; },
    // an ear, a turn of the head, one sweep of the brush. Then back to nothing.
    notice() { stir = 1; notices++; },
    noticed: () => notices,
    stir: () => stir,
    headYaw: () => yaw,
    tailYaw: () => sweep,
    update,
  };
}
