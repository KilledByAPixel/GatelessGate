import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The shared human vocabulary — the makeQuadruped of people.
//
// Every person in the book is the same four ideas: a lathed robe (a closed hem
// on the ground flaring up to narrow shoulders), sleeves with the hands hidden
// inside, a sphere head, and — usually — a wide sedge hat. Featureless by
// design: ink figures have no faces (a smile is an event). This module owns
// those parts and the assembly; `monk.js` is a thin naming layer over it, and
// anything else that needs a person (a girl, a woman on the road, a keeper at
// a stall) is the same figure with different options.
//
// The part builders are exported on their own so a bespoke figure — the man
// hanging by his teeth in case 5, say — can borrow the vocabulary without
// taking the standing assembly with it.

// ---------------------------------------------------------------------------
// the parts
// ---------------------------------------------------------------------------

// A robe. `profile` is [[r, y], ...] in FRACTIONS OF HEIGHT, authored from the
// hem up; the first point is the closed centre of the hem, so a figure is a
// solid that stands on y = 0 rather than an open shell. Ten segments is the
// house number: enough that the silhouette curves, few enough that the facets
// still read as brush strokes under flat shading.
export function robeLathe(profile, height, mat, segments = 10) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r * height, y * height));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, segments), mat);
  body.name = 'body';
  return body;
}

// A sleeve, with the hand hidden inside it.
//
// THE ORIGIN IS THE SHOULDER. The geometry is translated down by half its
// length so the mesh's own origin sits at the top of it and the cloth hangs
// along local -y: that is what makes an arm rotatable from the shoulder by
// setting rotation on the mesh, and it is what lets a case find the cuff at
// local (0, -len, 0) without knowing anything else about the figure. Cases do
// exactly that (k3 reads the length back off the bounding box; k11 parents a
// fist to the hem; k43/k48 hang a staff off it), so this convention is API.
export function sleeve({ height = 1.6, len = 0.34 * 1.6, r0 = 0.035, r1 = 0.065, mat }) {
  const geo = new THREE.CylinderGeometry(r0 * height, r1 * height, len, 7);
  geo.translate(0, -len / 2, 0);
  const arm = new THREE.Mesh(geo, mat);
  arm.name = 'arm';
  return arm;
}

// A head: a sphere, centred on its own origin, the caller sets the height.
export function sphereHead({ height = 1.6, r = 0.095, mat }) {
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * height, 14, 10), mat);
  head.name = 'head';
  return head;
}

// A neck bridging two points — the hanging monk's solve, promoted.
//
// Featureless solids leave a visible gap wherever a sphere head meets a robe
// collar at an angle, and the head then reads as floating a little clear of
// the body. A short tapered column spanning the gap, oriented by the vector
// between the two points, closes it without moving either piece. `pad` is
// extra length (in the same units as `a` and `b`) so both ends sink into the
// solids they join rather than butting against them.
export function neckBetween(a, b, { r0 = 0.056, r1 = 0.070, mat, pad = 0.03 } = {}) {
  const dir = b.clone().sub(a);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(r0, r1, dir.length() + pad, 8), mat);
  neck.name = 'neck';
  neck.position.copy(a).addScaledVector(dir, 0.5);
  neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return neck;
}

// ---------------------------------------------------------------------------
// the stances
// ---------------------------------------------------------------------------

// Robe profiles, authored hem-first in fractions of height. Point 0 is the
// closed centre of the hem and is the one point `stout` never widens — the
// figure is thickened around its axis, not stretched off it.
const STAND_PROFILE = [
  [0.02, 0.0], [0.21, 0.0], [0.20, 0.03], [0.155, 0.30],
  [0.125, 0.48], [0.115, 0.58], [0.13, 0.64], [0.06, 0.68],
];
const SIT_PROFILE = [
  [0.02, 0.0], [0.30, 0.0], [0.32, 0.05], [0.27, 0.16],
  [0.20, 0.28], [0.165, 0.36], [0.15, 0.42], [0.07, 0.46],
];

const mix = (a, b, t) => a + (b - a) * t;
const mixProfile = (a, b, t) => a.map(([r, y], i) => [mix(r, b[i][0], t), mix(y, b[i][1], t)]);

// Everything a stance decides, in fractions of height. `sit` and `stand` are
// the two authored poses; `kneel` is exactly halfway between them, which is
// what kneeling is — the hem spread of a folded figure carried at most of a
// standing figure's height.
const KNEEL = 0.5;
const STANCES = {
  stand: { profile: STAND_PROFILE, shoulder: 0.60, sleeve: 0.34, head: 0.735, hat: 0.80, armZ: 0, staff: 1.2 },
  sit: { profile: SIT_PROFILE, shoulder: 0.40, sleeve: 0.24, head: 0.50, hat: 0.545, armZ: 0.03, staff: 0.7 },
  kneel: {
    profile: mixProfile(STAND_PROFILE, SIT_PROFILE, KNEEL),
    shoulder: mix(0.60, 0.40, KNEEL),
    sleeve: mix(0.34, 0.24, KNEEL),
    head: mix(0.735, 0.50, KNEEL),
    hat: mix(0.80, 0.545, KNEEL),
    armZ: mix(0, 0.03, KNEEL),
    staff: mix(1.2, 0.7, KNEEL),
  },
};

// ---------------------------------------------------------------------------
// the assembly
// ---------------------------------------------------------------------------

// You select what a given figure has: `stance`, `arms` (the gesture, or null
// to drop the sleeves entirely for a cheap crowd figure — a robe and a head,
// which is all a person in the background needs), `hat`, `elder` (a staff),
// `stout`, `color`.
//
// Children are named 'body', 'head', 'arm' (×2), 'hat', 'staff'. Those names
// are API: cases reach in by name to re-pose a sleeve, recolour a staff, or
// remove an arm.
export function makeFigure({
  height = 1.6, color = INK, stance = 'stand', arms = 'rest',
  hat = true, stout = 1, elder = false, mat: matIn,
} = {}) {
  const g = new THREE.Group();
  g.name = 'figure';
  const mat = matIn || toonMaterial({ color, flat: true });
  const s = stout;
  const st = STANCES[stance] || STANCES.stand;
  const seated = stance === 'sit';

  g.add(robeLathe(st.profile.map(([r, y], i) => [i === 0 ? r : r * s, y]), height, mat));

  const shoulderY = st.shoulder * height;
  const sleeveL = st.sleeve * height;
  const makeSleeve = (side) => {
    const arm = sleeve({ height, len: sleeveL, mat });
    arm.position.set(side * 0.115 * s * height, shoulderY, st.armZ * height);
    if (arms === 'point' && side === 1) { arm.rotation.z = Math.PI - 0.95; arm.rotation.y = 0.15; }
    // 'raise' is NOT 'point'. Point swings the sleeve up and OUT along the
    // bearing the figure faces, which is right for indicating a thing across the
    // scene (case 29's monk and the flag). Held up beside another person it aims
    // at them, and a raised finger aimed at someone reads as an insult rather
    // than a teaching — which is exactly how case 3 first came out. This holds
    // the arm nearly vertical, a few degrees clear of the body and tipped
    // forward, so the gesture is offered to the air instead of at anybody.
    // Rest sits ~20 degrees off plumb rather than dead vertical so a case can
    // still ANIMATE the lift toward vertical (k3 adds 0.24rad); starting plumb
    // would send the arm over the top and back down the far side.
    else if (arms === 'raise' && side === 1) { arm.rotation.z = Math.PI - 0.34; arm.rotation.x = 0.22; }
    else if (arms === 'fold' || seated) { arm.rotation.x = -1.15; arm.rotation.z = side * 0.12; } // fold into the lap
    else { arm.rotation.z = side * 0.28; }
    g.add(arm);
    return arm;
  };
  // a background figure can skip its sleeves — two fewer meshes apiece, which is
  // what lets a crowd fit the draw budget
  if (arms) {
    makeSleeve(-1);
    makeSleeve(1);
  }

  const head = sphereHead({ height, mat });
  head.position.y = st.head * height;
  g.add(head);

  if (hat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.185 * height, 0.10 * height, 12), mat);
    cone.name = 'hat';
    cone.position.y = st.hat * height;
    g.add(cone);
  }

  if (elder) {
    const staffLen = st.staff * height;
    const staffGeo = new THREE.CylinderGeometry(0.018 * height, 0.018 * height, staffLen, 6);
    staffGeo.translate(0, staffLen / 2, 0);   // base at the local origin -> stands on the ground
    const staff = new THREE.Mesh(staffGeo, mat);
    staff.name = 'staff';
    staff.position.set(0.26 * s * height, 0, 0.06 * height);
    staff.rotation.z = 0.08;
    g.add(staff);
  }
  return g;
}
