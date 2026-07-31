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

// How far the cuff lip flares past the wrist. A straight cone from shoulder to
// hem reads as a stick of cloth; a sleeve reads as a sleeve when the mouth of
// it is wider than the arm above, with a nip between the two so the flare has
// something to flare FROM.
const CUFF_FLARE = 1.14;

// A sleeve, with the hand hidden inside it.
//
// THE ORIGIN IS THE SHOULDER. The profile is authored in shoulder-origin space
// so the mesh's own origin sits at the top of it and the cloth hangs along
// local -y: that is what makes an arm rotatable from the shoulder by setting
// rotation on the mesh, and it is what lets a case find the cuff at local
// (0, -len, 0) without knowing anything else about the figure. Cases do exactly
// that (k3 reads the length back off the bounding box's min.y and the cuff
// width off its max.x; k11 parents a fist to the hem; k43/k48 hang a staff off
// it), so this convention is API — the profile may be retuned, but it must
// always span y from -len to 0 and be widest at the cuff.
//
// `r0` is the shoulder, `r1` the wrist; everything between is expressed in
// terms of those two so a caller retuning either still gets the same shape.
export function sleeve({ height = 1.6, len = 0.34 * 1.6, r0 = 0.035, r1 = 0.065, mat }) {
  const a = r0 * height;              // shoulder
  const b = r1 * height;              // wrist
  const profile = [
    [0, -len],                        // the mouth of the cuff, closed
    [b * CUFF_FLARE, -len],           // THE CUFF LIP — the widest cloth on the arm
    [b * 0.99, -len * 0.930],         // the flare rolling back in
    [b * 0.76, -len * 0.840],         // the nip above it
    [b * 0.88, -len * 0.620],         // the belly of the sleeve
    [b * 0.81, -len * 0.320],
    [a, 0],                           // THE SHOULDER — origin, and the top of the bounds
    [0, 0],                           // closed
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const arm = new THREE.Mesh(new THREE.LatheGeometry(profile, 7), mat);
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
//
// Two features carry the whole read of these, and both are silhouette events
// rather than surface detail, because ink figures have no surface detail:
//
//   THE OBI. A robe is tied. Without the tie a monk is a bell, and a bell is
//   the same shape as a lampshade, a rock, or the assembly's cone — which is
//   why the crowd figure can afford to be one. The sash is drawn as three
//   points, not one: the skirt gathering below it, the pinch of the tie
//   itself (the narrowest the robe ever gets), and the blouse above, where
//   cloth is pushed up over the knot. A single pinch reads as a dent; the
//   swell above it is what makes it read as a belt.
//
//   THE COLLAR. The old profile ran the shoulder straight into the neck hole
//   in one segment, so the head sat on a funnel. A robe has a lapel that
//   stands proud of the neck, and one extra ring wide enough to clear the
//   head's cross-section at that height draws it as a step. It is the step,
//   not the taper, that says "cloth folded over" rather than "cone".
//
// RING COUNT IS A BUDGET, and it is a visual one, not a performance one. The
// material is flat-shaded, so every ring in a profile is a tone band in the
// finished figure: a first pass at this spent twelve rings and the monk came
// back striped like a stack of plates, with the obi lost among its own
// neighbours. Nine bands, with two long uninterrupted runs (the skirt, the
// chest) doing most of the height, is what lets the two events read AS events.
// If you add a point here, take one out.
//
// The two profiles are index-aligned — same ten points, same roles — so
// `kneel` can be an honest halfway blend of them.
const STAND_PROFILE = [
  [0.020, 0.000],   // hem centre, closed on the ground
  [0.212, 0.000],   // hem edge — the widest cloth he owns
  [0.200, 0.035],
  [0.150, 0.335],   // the long clean run up the skirt
  [0.128, 0.452],   // the skirt gathering under the sash
  [0.110, 0.492],   // OBI — the tie, the narrowest the robe gets
  [0.134, 0.552],   // the blouse pushed up over the knot
  [0.121, 0.652],   // chest into shoulder — this run must TAPER: held straight
                    //   it turned the torso into a drum sitting on a cone
  [0.097, 0.674],   // COLLAR — a step, not a taper
  [0.058, 0.692],   // the neck opening
];
const SIT_PROFILE = [
  [0.020, 0.000],   // hem centre, closed on the ground
  [0.300, 0.000],   // the hem pooling round the crossed legs
  [0.318, 0.052],
  [0.262, 0.190],   // the long run over the knees
  [0.212, 0.268],   // the skirt gathering under the sash
  [0.186, 0.300],   // OBI — the tie
  [0.206, 0.348],   // the blouse pushed up over the knot
  [0.160, 0.428],   // chest into shoulder
  [0.110, 0.449],   // COLLAR
  [0.068, 0.466],   // the neck opening
];

// The sedge hat, authored in its own local space (y = 0 is where the old
// cone's centre sat, so `hat` placement heights are unchanged). A cone is a
// party hat; a kasa has a BRIM — the rim is the widest AND the lowest point on
// it, and the underside slopes back up to the crown, so from any camera below
// the wearer's eyeline you see cloth turned down rather than a straight bevel.
// Traced the same way a robe is — out along the underside, up the outside, in
// at the crown — which makes it one closed solid, not a shell with a hole
// where the head goes.
const HAT_PROFILE = [
  [0.000, -0.026],  // the underside, centre — buried in the skull
  [0.150, -0.046],  // the underside sloping out and DOWN
  [0.192, -0.062],  // THE RIM: widest and lowest
  [0.178, -0.034],  // up the outside of the brim
  [0.128, -0.006],
  [0.068, 0.026],
  [0.000, 0.050],   // the crown
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
    // same lathe the robe is, at the hat's own twelve segments — one mesh, so
    // a brim costs a figure nothing in draw calls
    const brim = robeLathe(HAT_PROFILE, height, mat, 12);
    brim.name = 'hat';
    brim.position.y = st.hat * height;
    g.add(brim);
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
