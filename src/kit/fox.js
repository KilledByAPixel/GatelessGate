import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';
import { hash1, noise1 } from '../util/noise.js';
import { makeQuadruped } from './quadruped.js';

// Hyakujo's fox (case 2): the dog's body plan run slim and low. Three things
// carry the silhouette at distance, and a fox that misses any of them reads as
// a small dog:
//
//   1. LOW and LONG. A fox is a line held just off the ground, not a box on
//      legs. Short legs under a long barrel.
//   2. A narrow pointed muzzle under big upright triangular ears. The ears are
//      most of the head's outline.
//   3. THE BRUSH. A fox is mostly tail. It is carried low and straight out
//      behind — never cocked up like the dog's — and it is two thirds as thick
//      as the body. A thin tail reads as a cat.
//
// Faces +z like every quadruped in the kit. Built on makeQuadruped so the
// leg-to-belly join is computed rather than guessed (see THE LEG RULE there),
// then the skull and the brush are lifted onto pivots of their own so the koan
// can turn them without touching the shared body plan.

// Proportions in units of `height`. Named, because the tail anchor below is
// DERIVED from them — hand-tuned offsets drift the moment anything changes.
const LEG_H = 0.42, BODY_DROP = 0.16;
const BODY_Y = LEG_H + BODY_DROP;        // height of the barrel's axis
const BODY_R = 0.16, BODY_LEN = 0.82;

// THE BRUSH. A 'stiff' tail is a cylinder centred on its own origin, so half of
// its length lives inside the animal. Rather than guess an offset and discover
// the thick end poking out of the back, anchor the buried end ON the barrel's
// axis at TAIL_ROOT_Z and solve for the centre the quadruped wants. The tail
// then emerges cleanly from the rump at any length or angle.
const TAIL_TILT = -1.2;                 // rad: sends the tail back, and a touch down
const TAIL_LEN = 0.90;
const TAIL_ROOT_Z = -0.30;
const TAIL_AXIS_Y = Math.cos(TAIL_TILT);
const TAIL_AXIS_Z = Math.sin(TAIL_TILT);
const TAIL_UP = (TAIL_LEN / 2) * TAIL_AXIS_Y;
const TAIL_BACK = -(TAIL_ROOT_Z + (TAIL_LEN / 2) * TAIL_AXIS_Z);

// where the skull hinges — the back of the head, behind and below its centre
const NECK_TOP = [0, 0.78, 0.44];

const STIR = 2.4;                        // seconds for one whole response

// A bare four-post barrel reads as a table (quadruped.js's SECOND RULE) — the
// hind pair folds at the hock so the silhouette shows which end drives, the
// same fix the buffalo and the horse left on the table for budget and got
// away without (see their own headers). A fox has room: k2's scene sits well
// under the draw cap (see the header of k2.js — no other test flags it), so
// there is nothing stopping the fold here.
const KNEE = 0.4;                        // rad, hind hock bend

export function makeFox({ height = 0.45, color = INK, seed = 2 } = {}) {
  const { group } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    legH: LEG_H, legR: 0.062, legTaper: 1.0, hipX: 0.105, hipZ: 0.31,
    legs: { knee: KNEE },
    neck: { r: 0.078, len: 0.30 },
    head: { shape: 'sphere', r: 0.125, fwd: 0.55, up: 0.26 },
    // long and narrow, and set a little below the head's centre — the muzzle,
    // not the skull, is what should be sticking out
    snout: { r0: 0.028, r1: 0.078, len: 0.28, fwd: 0.73, up: 0.235 },
    // twice the head's radius tall: on a fox the ears are half the head.
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): base offsets
    // from the skull's centre — high on top with a touch of forward, inside
    // the 0.125 radius so the join is buried — leaning 0.44 out.
    ears: { r: 0.05, h: 0.3, x: 0.051, y: 0.09, z: 0.0, tilt: 0.44 },
    tail: {
      kind: 'stiff', r0: 0.05,
      // the root end (buried in the barrel — see THE BRUSH above) reads as
      // "two thirds as thick as the body": r1 solved directly against
      // BODY_R rather than left at a hand-tuned value that drifts the moment
      // the barrel's own radius changes.
      r1: BODY_R * 2 / 3,
      length: TAIL_LEN, up: TAIL_UP, back: TAIL_BACK, tilt: TAIL_TILT,
    },
  });
  group.name = 'fox';

  // ---- the skull, onto its own hinge -----------------------------------
  // makeQuadruped hangs the head, muzzle and ears straight off the body, which
  // is right for a body plan and useless for a look. Re-parent them onto a
  // pivot at the back of the skull; the neck stays behind, buried, so the head
  // turns against it instead of dragging it along.
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(NECK_TOP[0] * height, NECK_TOP[1] * height, NECK_TOP[2] * height);
  group.add(headPivot);
  for (const part of group.children.slice()) {
    if (part.name === 'head' || part.name === 'snout' || part.name === 'ear') {
      part.position.sub(headPivot.position);
      headPivot.add(part);
    }
  }
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  // (The old EAR_SPIN facet hack lived here — quadruped.js now bakes half a
  // facet of pre-spin into the ear GEOMETRY so a flat face meets the 3/4
  // camera, and rotation.y belongs to the shared placement. Nothing to do.)

  // ---- the brush, onto its own hinge -----------------------------------
  // Rotating the tail MESH about y does nothing: y is its own long axis. The
  // sweep has to happen about the anchor, which is exactly where the pivot goes.
  const tailMesh = group.children.find((c) => c.name === 'tail');
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, BODY_Y * height, TAIL_ROOT_Z * height);
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
