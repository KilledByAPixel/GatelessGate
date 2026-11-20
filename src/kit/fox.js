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
//   2. A short pointed muzzle under big upright triangular ears. The head is
//      ONE wedge (skull.js): a skull with real depth and cheek to it, drawn
//      out to a point with barely a stop — a ball with a spout on it was a
//      toy's head, the dog's blunt muzzle under a brow is the other animal,
//      and a wedge with no skull behind it is a needle on the end of a neck.
//      The ears are most of the head's outline: taller than the skull is
//      deep, and BROAD at the base from the side as well as the front. Tall
//      and thin they were a hare's, or a pair of horns. The neck under it is
//      a ruff: thick the whole way up, so the head sits on the chest's own
//      mass rather than on a stalk.
//   3. THE BRUSH. A fox is mostly tail, and the brush is the biggest single
//      shape on it. It leaves the rump level with the back and falls away
//      behind in one arc, swelling through its middle to about the depth of
//      the body and drawn to a point not far off the ground. Never above the
//      back — cocked up is the dog's line, and the two animals are told apart
//      by that at any distance. A thin tail reads as a cat, and a straight
//      one as a bar stuck in the animal.
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

// THE BRUSH, root to tip along its own centre line: [y, z, depth, half-width]
// in heights, y and z measured from the root (the hinge it sweeps about), the
// last row being the tip itself. `depth` is the half-thickness seen from the
// side, laid square to the line, so the two outlines are the line offset
// either way by it; the brush is deeper than it is wide, because seen from
// above a round one of this depth is wider than the animal carrying it.
// The body plan's own stiff tail is a straight loft and cannot bend, so the
// fox builds this one itself.
const BRUSH_ROOT = [0.065, -0.38];      // [above the body's axis, z] — inside the rump
const BRUSH = [
  [0.0, 0.0, 0.085, 0.07],
  [-0.045, -0.15, 0.125, 0.1],
  [-0.15, -0.31, 0.175, 0.125],
  [-0.26, -0.455, 0.17, 0.12],
  [-0.385, -0.61, 0.1, 0.075],
  [-0.49, -0.755, 0, 0],
];

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). Read down the
// `top` column: a flat crown and then one long fall to the nose, with the
// stop no more than a change of slope. The half-widths are the other half of
// it — broad at the cheek and pinched hard just ahead of it, so from the front
// and from above the face is a triangle.
const SKULL = [
  [-0.1, 0.076, -0.066, 0.08],
  [-0.03, 0.106, -0.084, 0.115],
  [0.04, 0.1, -0.078, 0.1],
  [0.1, 0.06, -0.062, 0.058],
  [0.165, 0.034, -0.048, 0.037],
  [0.225, 0.016, -0.038, 0.025],
];
const SKULL_BACK = [0.006, -0.128];     // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.013, 0.246];
const HEAD_NOSE_DOWN = 0.1;             // rad the whole head is carried nose-down
// The skull hinges straight below the point the neck ends on: an offset fore
// or aft swings the cheek off the end of the neck as the head turns.
const HINGE_DOWN = 0.02;                // x height
// An ear is a little flatter fore and aft than it is wide, but only a little:
// flattened to a leaf it is a broad triangle from the front and a spike from
// the side, and the side is how this animal is usually seen.
const EAR_FLAT = 0.95;

const STIR = 2.4;                        // seconds for one whole response

// A deep fold at the hock: a fox stands crouched over its hind legs, and the
// angle is most of what keeps it from reading as a small dog on stilts.
const KNEE = 0.38;                       // rad, hind hock bend

export function makeFox({ height = 0.45, color = INK_LIT, seed = 2 } = {}) {
  const { group, material } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    // deep at the chest and tucked at the flank, with the croup carried as
    // high as the withers: a back that falls to the rump is a dog standing
    torso: { chest: 1.35, loin: 0.62, withers: 1.0, back: 0.92, croup: 1.0, shoulderW: 0.78, barrelW: 0.9, hipW: 0.82 },
    legBury: .13,
    // FINE LIMBS. A fox's front leg is about a quarter of its chest's depth
    // below the elbow and barely swells above it; a forearm half as deep as
    // the chest is a dog's leg under a fox. `legR` scales the whole leg and
    // `legTaper` the forearm alone, so the shoulder, thigh and paw — stated
    // as multiples of `legR` — are raised to keep the masses they had.
    legH: LEG_H, legR: 0.047, legTaper: 0.76, hipX: 0.07, hipZ: 0.31,
    legs: { knee: KNEE, shoulder: 3.6, thigh: 3.7, foot: 1.5, hindSet: 0.09 },
    // A ruff, not a stalk: the throat starts low on the chest, the nape leaves
    // the back early, and the taper spends little of that on the way up. Its
    // end still has to fit inside the skull it enters, turned or not.
    neck: { r: 0.078, w: 0.9, root: 0.7, set: 0.05, taper: 1.0, arch: 0.02 },
    // The plan's ball only says where the head is carried — forward, and a
    // little above the back — and how far it is nosed down; its geometry is
    // replaced by the loft below. No snout: the muzzle is that loft's front.
    head: { shape: 'sphere', r: 0.1, fwd: 0.56, up: 0.215, tilt: HEAD_NOSE_DOWN },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): base offsets from
    // the point the neck ends on — inside the back corners of the skull, so
    // the join is buried — and leaning out a little.
    ears: { r: 0.072, h: 0.235, x: 0.062, y: 0.05, z: -0.012, tilt: 0.3 },
    // no plan tail: the brush is built below, on its own hinge
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

  // ---- the brush, on its own hinge --------------------------------------
  // The hinge is the root, buried in the rump, and the mesh hangs from it
  // untransformed: the sweep turns the whole arc about the point it grows
  // from.
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, (BODY_Y + BRUSH_ROOT[0]) * height, BRUSH_ROOT[1] * height);
  group.add(tailPivot);
  const tailMesh = new THREE.Mesh(brushGeometry(BRUSH, height), material);
  tailMesh.name = 'tail';
  tailPivot.add(tailMesh);

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

// One closed loft along a curved centre line in the animal's side plane. Each
// ring is an ellipse standing across the brush, square to the line where it
// crosses it, with a vertex at its top and at its bottom — so the side
// outline is exactly the line offset by each row's depth, the same cut as the
// trunk and the skull. The root is fanned shut on a point further inside the
// rump and the far end on the tip, so the mesh is closed.
function brushGeometry(rows, unit, seg = 8) {
  const last = rows.length - 1;                       // the tip: an apex, not a ring
  const pos = [], idx = [];
  for (let i = 0; i < last; i++) {
    const a = rows[Math.max(i - 1, 0)], b = rows[i + 1];
    let dy = b[0] - a[0], dz = b[1] - a[1];
    const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
    const [y, z, r, w] = rows[i];
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2, sn = Math.sin(t);
      pos.push(Math.cos(t) * w * unit, (y + sn * dz * r) * unit, (z - sn * dy * r) * unit);
    }
  }
  for (let i = 0; i < last - 1; i++) {
    const a = i * seg, b = a + seg;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const dy0 = rows[1][0] - rows[0][0], dz0 = rows[1][1] - rows[0][1];
  const p0 = pos.length / 3;
  pos.push(0, (rows[0][0] - 0.4 * dy0) * unit, (rows[0][1] - 0.4 * dz0) * unit);
  for (let j = 0; j < seg; j++) idx.push(p0, (j + 1) % seg, j);
  const p1 = pos.length / 3;
  pos.push(0, rows[last][0] * unit, rows[last][1] * unit);
  const e = (last - 1) * seg;
  for (let j = 0; j < seg; j++) idx.push(p1, e + j, e + (j + 1) % seg);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
