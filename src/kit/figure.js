import * as THREE from '../../lib/three.module.js';
import { washMaterial, frontShadow } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { INK_LIT } from '../palette.js';
import { hash1 } from '../util/noise.js';

// The shared human vocabulary — the makeQuadruped of people.
//
// Every person in the book is the same four ideas: a lathed robe (a closed hem
// on the ground flaring up to narrow shoulders), arms that are sleeves with
// the hands hidden inside, a sphere head, and — usually — a wide sedge hat. Featureless by
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

// ---- the arm ---------------------------------------------------------------
//
// An arm is cloth swept along a bent line — shoulder, elbow, wrist — and not a
// lathe. A lathe can only make a straight thing, and a straight sleeve hung
// from a shoulder is a rod however it is turned: the resting arms read as
// wooden and the raised one as a club, because nothing in either had an elbow.
// Three things carry the read, and all three are silhouette:
//
//   THE ELBOW. The line from shoulder to hand is the CHORD, and the elbow
//   stands off it. The chord is still the mesh's local -y — see the contract
//   below — so the bend costs a case nothing: the hand is where it always was.
//
//   THE SHOULDER. The arm is at its broadest where it leaves the body and is
//   closed by a cap no wider than itself. The old arm was the reverse — thin at
//   the root, fattening downward, with a ball on the hinge wider than the arm
//   leaving it — and that is a doll's joint however well the ball hides the
//   seam. The cap does the ball's job (it surrounds the hinge, so the join
//   stays covered when a case turns the arm) without standing proud of it.
//
//   THE HANG. Cloth has weight, so the underside of a sleeve drops away from
//   the forearm toward the mouth and the mouth is cut on the slant. `hang` is
//   which way is DOWN in the arm's own frame, which is what lets one rule make
//   a low back corner on a hanging sleeve, a pendant wedge under a pointing
//   one, and a mouth slipped back down a raised one. It is baked for the pose
//   the figure is built in: a case that turns the arm a little carries the
//   drape with it, and one that turns it a long way gets cloth hanging the
//   wrong way — which is a pose driver to adapt, not something to solve here.
//
// THE CONTRACT, which cases lean on and which is therefore API:
//   - the mesh's origin is the SHOULDER, so setting rotation on the mesh
//     swings the arm from it;
//   - the hand is at local (0, -len, 0), and `len` is exactly the bounding
//     box's -min.y. k3 seats a finger there, k11 a fist, k43 and k48 hang a
//     staff and a fan off it, and all of them read the length back off the box
//     rather than restating it. Nothing — elbow, drape, mouth — reaches below
//     that plane;
//   - `userData.elbow` and `userData.hand` are those two points in the mesh's
//     frame, for anything that wants the FOREARM's line rather than the
//     chord's (the two differ by the bend).
const ARM_SIDES = 8;    // even, so a ring has a vertex on each axis of its
                        //   ellipse and the drape has a true lowest point
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
// what an arm holds between being posed and being cut — shared, never drawn
const EMPTY = new THREE.BufferGeometry();

// Rings of cloth strung along `stations` and skinned, closed at both ends.
// A station is { p, r: [across, inPlane], facing?, sag? }: an ellipse centred
// on p whose first radius lies along `ref` and whose second lies in the plane
// the arm bends in. A ring faces along the path — mitred at a bend, so the
// elbow is one crease rather than a pinch — unless `facing` says otherwise.
// `sag` drops the underside of that ring along `hang`: only the half of the
// ring that faces down moves, and it moves straight down, which is what makes
// it cloth under an arm rather than a fatter arm.
function sweptCloth(stations, ref, { tip, hang } = {}) {
  const n = stations.length;
  const rings = [];
  const t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  const d = new THREE.Vector3(), across = new THREE.Vector3(), radial = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const st = stations[i];
    if (st.facing) t.copy(st.facing);
    else {
      t.set(0, 0, 0);
      if (i > 0) t.add(d.subVectors(st.p, stations[i - 1].p).normalize());
      if (i < n - 1) t.add(d.subVectors(stations[i + 1].p, st.p).normalize());
    }
    t.normalize();
    u.copy(ref).addScaledVector(t, -ref.dot(t)).normalize();
    v.crossVectors(t, u);
    // which way is down ACROSS this ring; a sleeve hanging plumb has no
    // underside, so the drape fades out as the arm comes to vertical
    let under = 0;
    if (st.sag && hang) {
      across.copy(hang).addScaledVector(t, -hang.dot(t));
      const m = across.length();
      if (m > 1e-4) across.multiplyScalar(1 / m);
      under = st.sag * Math.min(1, Math.max(0, (m - 0.05) / 0.2));
    }
    const ring = [];
    for (let k = 0; k < ARM_SIDES; k++) {
      const a = (k / ARM_SIDES) * Math.PI * 2;
      radial.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      const q = st.p.clone()
        .addScaledVector(u, Math.cos(a) * st.r[0])
        .addScaledVector(v, Math.sin(a) * st.r[1]);
      if (under) q.addScaledVector(hang, under * Math.max(0, radial.dot(across)));
      ring.push(q);
    }
    rings.push(ring);
  }

  const tris = [];
  const start = tip || rings[0].reduce((c, q) => c.add(q), new THREE.Vector3()).multiplyScalar(1 / ARM_SIDES);
  const last = rings[n - 1];
  const end = last.reduce((c, q) => c.add(q), new THREE.Vector3()).multiplyScalar(1 / ARM_SIDES);
  for (let k = 0; k < ARM_SIDES; k++) {
    const k1 = (k + 1) % ARM_SIDES;
    tris.push(start, rings[0][k1], rings[0][k]);
    for (let i = 0; i < n - 1; i++) {
      tris.push(rings[i][k], rings[i][k1], rings[i + 1][k1]);
      tris.push(rings[i][k], rings[i + 1][k1], rings[i + 1][k]);
    }
    tris.push(end, last[k], last[k1]);
  }
  return tris;
}

// One arm. Everything is in world units (the callers scale by height).
//   len      shoulder to hand, along local -y
//   bend     how far the elbow stands off that chord, toward `toward`
//   ref      the axis the arm does NOT bend about — a ring's first radius
//   root, elbow, cuff   the three ellipses, [across, inPlane]; no `elbow`
//            means a straight run (the upper half of a folded arm)
//   capTip   where the shoulder cap closes, in the arm's frame. Default is
//            straight back along the upper arm; a hanging arm leans it in
//            toward the neck so the cap is the slope of a shoulder
//   hang, drape   see THE HANG above
//   square   the mouth is cut square to the chord rather than to the forearm:
//            for a sleeve something is seated in, where the mouth is a socket
function armGeometry({
  len, bend = 0, toward = Z_AXIS, elbowAt = 0.46, ref = X_AXIS,
  root, elbow = null, cuff, capTip = null, hang = null, drape = 0, square = false,
}) {
  const shoulder = new THREE.Vector3();
  const hand = new THREE.Vector3(0, -len, 0);
  const joint = new THREE.Vector3(0, -len * elbowAt, 0).addScaledVector(toward, bend);
  const first = elbow ? joint : hand;
  const tip = capTip
    ? capTip.clone()
    : first.clone().normalize().multiplyScalar(-0.8 * Math.min(root[0], root[1]));
  const stations = [
    { p: tip.clone().multiplyScalar(0.5), r: [root[0] * 0.66, root[1] * 0.70] },
    { p: shoulder, r: root },
  ];
  if (elbow) stations.push({ p: joint, r: elbow });
  stations.push({ p: hand, r: cuff, sag: drape, facing: square ? DOWN : null });
  const tris = sweptCloth(stations, ref, { tip, hang });

  // THE LENGTH IS THE BOX. A slanted mouth and a dropped hem both reach past
  // the hand, so whatever hangs below the shoulder is brought back to end
  // exactly on y = -len — the drape is taken out of the arm's length rather
  // than added to it. (`tris` shares its points between triangles, hence the
  // set.)
  const seen = new Set(tris);
  let low = 0;
  for (const q of seen) low = Math.min(low, q.y);
  const fit = len / -low;
  for (const q of seen) if (q.y < 0) q.y *= fit;
  joint.y *= fit;

  const pos = new Float32Array(tris.length * 3);
  const nor = new Float32Array(tris.length * 3);
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < tris.length; i += 3) {
    e1.subVectors(tris[i + 1], tris[i]);
    e2.subVectors(tris[i + 2], tris[i]);
    e2.crossVectors(e1, e2).normalize();
    for (let j = 0; j < 3; j++) {
      tris[i + j].toArray(pos, (i + j) * 3);
      e2.toArray(nor, (i + j) * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.userData.elbow = elbow ? joint : null;
  geo.userData.hand = hand.clone().multiplyScalar(fit);
  return geo;
}

function armMesh(spec, mat) {
  const geo = armGeometry(spec);
  const arm = new THREE.Mesh(geo, mat);
  arm.name = 'arm';
  arm.userData.elbow = geo.userData.elbow;
  arm.userData.hand = geo.userData.hand;
  return arm;
}

// Which way is down, seen from inside a part that has been posed — the `hang`
// its cloth should be built with. Reads the part's own rotation and its
// parents' (a forearm rides an upper arm), so it must be called after both are
// set.
function downIn(part) {
  const q = new THREE.Quaternion();
  for (let o = part; o; o = o.parent) q.premultiply(o.quaternion);
  return DOWN.clone().applyQuaternion(q.invert());
}

// The arm's proportions, in fractions of height: [across, inPlane] at the
// shoulder, the elbow and the mouth. A hanging sleeve is a panel of cloth — it
// is deeper fore-and-aft than it is thick, which is what lets it hang close to
// the robe and still be a broad shape from the side. It holds one width from
// shoulder to elbow and opens only below it: carried at the shoulder, the
// same cloth read as a slab of constant width, and a shoulder narrower than
// the elbow is the doll's joint again. A lifted arm is seen
// across its bend instead, and is rounder.
const HANG_ARM = { root: [0.037, 0.045], elbow: [0.037, 0.045], cuff: [0.049, 0.067] };
const LIFT_ARM = { root: [0.046, 0.047], elbow: [0.041, 0.042], cuff: [0.046, 0.048] };
const scaled = (pair, k) => [pair[0] * k, pair[1] * k];

// How far the mouth of a plain sleeve opens past the wrist radius it is given.
const CUFF_FLARE = 1.14;

// A plain sleeve — the straight, unposed part, for a figure that is not built
// by makeFigure (the man hanging by his teeth borrows two). Same contract as
// every arm above. `r0` is the shoulder and `r1` the wrist, in fractions of
// height; `flare` opens the mouth past the wrist, and 1 or less means the far
// end is a JOINT rather than a mouth — an elbow wearing a flare reads as a
// second wrist. `bend` (a fraction of `len`, toward local -z) and `hang` are
// the same two ideas makeFigure's arms are built from, offered here so a
// borrowed sleeve need not be a rod either.
export function sleeve({
  height = 1.6, len = 0.34 * 1.6, r0 = 0.046, r1 = 0.050, flare = CUFF_FLARE,
  bend = 0, hang = null, drape = 0, mat,
}) {
  const a = r0 * height;
  const b = r1 * height * Math.max(1, flare);
  const mouth = flare > 1;
  return armMesh({
    len,
    bend: bend * len,
    toward: Z_AXIS.clone().negate(),
    root: [a, a * 1.12],
    elbow: mouth ? [a * 0.92, a * 1.0] : null,
    cuff: mouth ? [b, b * 1.12] : [b, b],
    hang, drape: drape * height,
    square: !mouth,
  }, mat);
}

// A head: slightly OBLONG, not a ball — narrowed a touch and stretched tall —
// less spherical, more oblong, shaped the way a head is. Baked into the
// GEOMETRY, not mesh.scale: buddha.js parents its topknot and urna to this
// mesh, and a scaled mesh would distort them. Exported so those marks can place
// themselves against the true skull shell.
export const HEAD_OBLONG = [0.8, 1.10, 1.0];
export function sphereHead({ height = 1.6, r = 0.09, mat }) {
  const geo = new THREE.SphereGeometry(r * height, 14, 10);
  geo.scale(HEAD_OBLONG[0], HEAD_OBLONG[1], HEAD_OBLONG[2]);
  const head = new THREE.Mesh(geo, mat);
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
// The two profiles are index-aligned — same points, same roles, index for
// index — so `kneel` can be an honest halfway blend of them.
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
  [0.000, 0.692],   // CAP — closes the neck to the axis. Not a tone band (it
                    //   faces straight up, hidden under the head), so it sits
                    //   outside the ring budget above. It exists for the
                    //   shadow map: the figure casts front-face depth, and an
                    //   open lathe is a light pipe — sun slipped through the
                    //   head/collar annulus and lit a hole in the shadow of
                    //   every hatless figure.
];
// Exported (with the hat profile below) for `assembly.js`: the instanced
// crowd builds its per-instance geometry from the same seated silhouette the
// hero monks wear, so a background figure at fog distance is the same person,
// simplified — not a different species of pawn.
//
// THE LAP SHELF, then THE KNEES. The first seated profile tapered continuously
// from hem to collar and read as a fat dress rather than as anyone sitting
// down. The lap shelf fixed the vertical read — a wide low block, a
// near-horizontal lap turn, the torso rising visibly INSET — but the block
// itself was still a solid of revolution, which reads as a figure with no legs.
// A figure in lotus (see the reference in the gitignored local/refs) is widest
// at the KNEES, left
// and right, with a valley between them where the hands rest; a radially
// symmetric pool can never say "folded legs". So the lathe here is only the
// cloth core — the shins and the pooled robe BETWEEN the knees — pulled in to
// 0.25·h, and the knees are two ellipsoids at ±x merged into the same geometry
// by `seatedBodyGeometry` below (one mesh; the same move buddha.js's round-2
// statue made before it was folded into this kit). Same ten indices, same roles
// as STAND_PROFILE, so `kneel`'s halfway blend stays honest — the "long run up
// the skirt" is here the run up the shins, and the "skirt gathering" is the lap
// turn itself.
export const SIT_PROFILE = [
  // Round five made the base HONEST: it IS a cushion, so it is flat, about a
  // quarter the old height, with a leg shape above it so the figure reads as
  // sitting ON something. The lathe here is now only the ROBE — a slim cloth
  // core whose hem pools on the cushion's top, not on the ground. Everything
  // the robe drapes over is its own ellipsoid, merged in by seatedBodyGeometry
  // below: a flat zabuton at y=0, two cheeks resting on it at the rear, the
  // crossed shins as a wide bar in front, and the two knee crests. The lathe
  // stays inside all of them, so what reads at distance is figure-on-cushion.
  [0.020, 0.035],   // hem centre, closed on the cushion's top
  [0.150, 0.040],   // the hem pooling over the seat
  [0.158, 0.085],   // the robe over the hips — slimmed in round six, where the
                    //   seated rear read as one round mass
  [0.150, 0.150],   // rising over the leg block toward the lap
  [0.140, 0.175],   // THE LAP — a near-horizontal shelf in to the waist
  // torso rows carry the STANDING profile's widths (round seven: the seated
  // blouse and chest ran ~6% fatter and read as a heavier man)
  [0.112, 0.220],   // OBI — the tie
  [0.134, 0.265],   // the blouse pushed up over the knot
  [0.121, 0.425],   // chest — one long VERTICAL run: a meditator sits straight
  [0.097, 0.458],   // COLLAR
  [0.058, 0.478],   // the neck opening
  [0.000, 0.478],   // CAP — see STAND_PROFILE's cap; same hole, same fix, and
                    //   the pair must stay index-aligned for the kneel blend
];

// THE SEAT, in fractions of height. The base IS a cushion, so it is built as
// one — and there is a body on it.
//   CUSHION — a flat zabuton: a quarter the height of the old pooled base,
//     wider than everything above it, so a rim of it shows all round and
//     the figure reads as sitting ON something rather than melting into it.
//   SHINS — the crossed legs: one wide flat bar ACROSS the front.
//   KNEES — the two crests at ±x, long axis yawed forward-out the way a
//     folded thigh lies; still the widest thing the figure owns.
// (Round six cut the CHEEK lobes: with the hip ring slimmed they added
// nothing but width where less was wanted — the robe's own rear reads.)
const CUSHION = { r: 0.26, rTop: 0.235, hh: 0.042 };
const SHINS = { r: 0.09, scale: [2.3, 0.62, 1.0], y: 0.075, z: 0.10 };
const KNEE = { r: 0.09, scale: [1.5, 0.75, 1.1], x: 0.18, y: 0.095, z: 0.095, yaw: 0.5 };

// The whole seated body — robe lathe + cushion + cheeks + shins + knees — as
// ONE geometry (one mesh, no extra draws anywhere it is used). Exported because
// the assembly's instanced crowd must be the same person: it feeds this
// straight into its InstancedMesh (still one draw call). `width` is the radial
// squeeze (`stout`, or the crowd's SLIM): it thins the lathe and the cushion
// around the axis and carries the mass centres inward, but the flesh masses
// keep their own size — at fog distance the knees and the cushion rim are the
// events that must survive. `cushion: false` drops the zabuton — for a case
// that already lays its own mat under the figure (k10/k17/k30/k34). Two slabs
// of nearly the same size stacked read as one thing doubled, not as a cushion
// on a mat — case 17 showed exactly that, an extra thin slab under the figure.
// The body's other masses are unchanged, so he still sits on his own legs at
// the same height either way. `profile` defaults to the whole seated body. The
// waist hinge passes the rows BELOW the sash instead, so the lower half it
// builds is still a real seated body — cushion, shins and knees included —
// rather than a bare robe lathe. All three of those masses live under the sash,
// so truncating the profile does not lose any of them.
export function seatedBodyGeometry({
  height, width = 1, segments = 10, cushion: withCushion = true, profile = SIT_PROFILE,
} = {}) {
  const lathe = new THREE.LatheGeometry(
    profile.map(([r, y], i) => new THREE.Vector2((i ? r * width : r) * height, y * height)),
    segments);
  const cushion = new THREE.CylinderGeometry(
    CUSHION.rTop * width * height, CUSHION.r * width * height, CUSHION.hh * height, 10);
  cushion.translate(0, CUSHION.hh * height / 2, 0);
  const shins = new THREE.SphereGeometry(SHINS.r * height, 8, 6);
  shins.scale(SHINS.scale[0] * width, SHINS.scale[1], SHINS.scale[2]);
  shins.translate(0, SHINS.y * height, SHINS.z * height);
  const knees = [-1, 1].map((side) => {
    const k = new THREE.SphereGeometry(KNEE.r * height, 8, 6);
    k.scale(KNEE.scale[0], KNEE.scale[1], KNEE.scale[2]);
    k.rotateY(-side * KNEE.yaw);      // long axis angles forward-out: a folded thigh
    k.translate(side * KNEE.x * width * height, KNEE.y * height, KNEE.z * height);
    return k;
  });
  return mergeSimple(withCushion
    ? [lathe, cushion, shins, ...knees]
    : [lathe, shins, ...knees]);
}

// The sedge hat, authored in its own local space (y = 0 is where the old
// cone's centre sat, so `hat` placement heights are unchanged). A cone is a
// party hat; a kasa has a BRIM — the rim is the widest AND the lowest point on
// it, and the underside slopes back up to the crown, so from any camera below
// the wearer's eyeline you see cloth turned down rather than a straight bevel.
// Traced the same way a robe is — out along the underside, up the outside, in
// at the crown — which makes it one closed solid, not a shell with a hole
// where the head goes.
export const HAT_PROFILE = [
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
// standing figure's height. `staffX` is where the elder's staff plants,
// laterally, in fractions of height — and it is per-stance because the hem is.
// A standing hem clears the standing plant comfortably; a seated figure's knees
// reach much further out, so the SAME plant put the staff inside the cloth and
// it emerged through the robe like a stick stuck in a tent. Case 17 fixed that
// by hand first, and its number is what the seated stance carries here: past
// the hem plus the staff's own radius, so it reads as the teacher's staff set
// down within reach. The standing plant is untouched — every standing elder in
// the book is framed around it. `staffAng` is the BEARING of the staff plant,
// radians around +y off the local +x axis (toward +z). It exists because of a
// systematic staging coincidence the grip audit found: cases aim a standing
// elder at something up-scene with aimMonk (which turns local +x to the target)
// and the shipped camera looks over his shoulder at the same target — so a
// staff planted ON the +x axis sits exactly on the camera→figure→target line
// and reads as growing out of the wearer's hat
// (k11/k19/k21/k22/k27/k31/k34/k36/k39). Swinging the standing plant off the
// facing axis keeps it the same distance out — past the hem, beside the resting
// sleeve — but breaks the alignment for over-the-shoulder cameras. Seated
// figures face local +z (the folded sleeves), so their +x plant already IS the
// side plant and stays at 0. Cases with a bearing-sensitive staging can
// override with the `staffAng` option (additive; 0 = the old on-axis plant).
// `foldUpper`/`foldFore` are the folded-arm pitches (radians off plumb, toward
// local +z) for the two-piece arm — the upper's hang and the forearm's bend at
// the elbow — and they are per-stance because the hands' destination is: seated
// hands rest DOWN in the lap (a gentle bend), while standing hands meet at the
// waist (the forearm swings nearly horizontal). `foldCross` is the inward
// swing, and it is solved rather than chosen: whatever lays one cuff just past
// the other at the centre line, so the two mouths read as one gathered mass.
// It moves whenever the shoulder width, the forearm's length or either pitch
// does — re-measure the cuff tips after touching any of them.
// `gesture` is the sleeve length for a point/raise arm, and it is a separate
// number from `sleeve` for one reason: AN ARM DOES NOT SHORTEN WHEN ITS OWNER
// SITS DOWN. A stance's `sleeve` is a hanging/folding length, and seated it is
// cut back so the cuffs settle into the lap the knees frame rather than
// spilling past them — right for cloth at rest, wrong for cloth thrown up in
// the air, where the same cut left case 11's raised fist level with the
// hermit's own crown instead of well above it. Standing, the two are equal, so
// no standing figure in the book moves.
const KNEEL = 0.5;
const STAND_STANCE = { profile: STAND_PROFILE, shoulder: 0.60, sleeve: 0.34, gesture: 0.34, head: 0.765, hat: 0.80, armZ: 0, staff: 1.2, staffX: 0.26, staffAng: 0.2, foldUpper: -0.12, foldFore: -1.45, foldCross: 0.73 };
// Seated head/shoulder/hat ride 0.015·h higher than the lap-shelf tune did: the
// chest run in SIT_PROFILE was lengthened and steepened so a meditator sits
// STRAIGHT, the way the Buddha does — the crown now tops out at 0.610·h, still
// comfortably a seated man, and the fold angle eases to -0.44 so the cuffs keep
// landing in the lap the knees now frame.
const SIT_STANCE = { profile: SIT_PROFILE, shoulder: 0.415, sleeve: 0.24, gesture: 0.34, head: 0.545, hat: 0.560, armZ: 0.03, staff: 0.7, staffX: 0.3625, staffAng: 0, foldUpper: -0.22, foldFore: -0.31, foldCross: 1.17 };
// Kneel is DERIVED, field by field, from whatever stand and sit currently are.
// It used to repeat their values as literals, and every retune of the endpoints
// (the sit +0.015 lift, staffAng 0.9 → 0.2) silently un-halved it — four fields
// had drifted. Latent (no koan kneels; tests do), but the whole claim of this
// stance is "exactly halfway", so it is now that by construction.
const KNEEL_STANCE = { profile: mixProfile(STAND_PROFILE, SIT_PROFILE, KNEEL) };
for (const k of Object.keys(STAND_STANCE)) {
  if (k !== 'profile') KNEEL_STANCE[k] = mix(STAND_STANCE[k], SIT_STANCE[k], KNEEL);
}
const STANCES = { stand: STAND_STANCE, sit: SIT_STANCE, kneel: KNEEL_STANCE };

// The arms' own numbers, which no stance changes. Lengths are fractions of
// height, angles radians.
const SHOULDER_X = 0.130;
// A hanging arm: the swing forward both arms share and the [least, range] by
// which the two are pushed apart about it; the lean off the body; the elbow's
// stand-off as a fraction of the sleeve; how far the back of the mouth drops.
const REST = { swing: -0.08, apart: [0.04, 0.05], lean: [0.045, 0.04], bend: [0.085, 0.05], drape: 0.035 };
// A lifted arm: the elbow's stand-off, and the cloth under the forearm. A
// pointing arm is nearer level, so more of its sleeve hangs clear of it.
const LIFT = { bend: 0.13, drapePoint: 0.062, drapeRaise: 0.05 };
// A hand on a staff: how far below the shoulder it grips, the most of the
// arm's length the reach may use (short of straight, so there is always an
// elbow), and the mouth of the sleeve the shaft passes through.
const GRIP = { drop: 0.26, reach: 0.95, cuff: [0.045, 0.050] };
// How far a planted staff tips off plumb, top toward its owner.
const STAFF_LEAN = 0.02;
// A folded arm: where it hinges, its shoulder, the elbow joint both halves
// share, and the forearm's mouth. It is the hanging arm turned upside down —
// SLIM AT THE SHOULDER, WIDE AT THE CUFF — and hinged closer in, so the upper
// lies against the torso's side. Given the hanging arm's shoulder it was a
// slab as deep as the torso standing off it, a seated figure read as a block
// with two boxes bolted on, and forearms no wider than the slabs above them
// vanished into the lap. The upper arm is the one part of this arm that does
// NOT follow the broadest-at-the-root rule, and the reason is that it is seen
// against the body rather than against the sky. Then the upper's lean off the
// body, the forearm's length as a fraction of the stance's sleeve, how far one
// forearm lies over the other, and how far its mouth drops.
const FOLD = { x: 0.118, root: [0.028, 0.034], joint: [0.031, 0.036], cuff: [0.044, 0.056], clear: 0.11, fore: 0.68, over: 0.04, drape: 0.035 };

// ---------------------------------------------------------------------------
// the assembly
// ---------------------------------------------------------------------------

// You select what a given figure has: `stance`, `arms` (which gesture), `hat`,
// `elder` (a staff), `stout`, `color`. Every figure has arms — `arms` chooses
// how they are held, never whether they exist.
//
// Children are named 'body', 'head', 'arm' (×2), 'hat', 'staff'; a folded arm
// carries a 'forearm', and a bowing figure a 'waist' holding its 'torso', head
// and arms. Those names are API: cases reach in by name to re-pose a sleeve,
// recolour a staff, or remove an arm. `seed` is the one option that changes
// nothing a case can name — only how the resting arms happen to hang.
export function makeFigure({
  height = 1.6, color = INK_LIT, stance = 'stand', arms = 'rest',
  hat = true, stout = 1, elder = false, staffAng, mat: matIn,
  cushion = true,          // seated only — false where the case lays its own mat
  bow = 0,                 // radians bent FORWARD at the waist; see bendForward
  seed = 0,                // integer; varies the rest pose — see makeSleeve
} = {}) {
  const g = new THREE.Group();
  g.name = 'figure';
  const mat = matIn || washMaterial({ color, flat: true });
  const s = stout;
  const st = STANCES[stance] || STANCES.stand;
  const seated = stance === 'sit';

  if (seated) {
    // the seated body is NOT a pure lathe — the knees are merged in
    const body = new THREE.Mesh(seatedBodyGeometry({ height, width: s, cushion }), mat);
    body.name = 'body';
    g.add(body);
  } else {
    g.add(robeLathe(st.profile.map(([r, y], i) => [i === 0 ? r : r * s, y]), height, mat));
  }

  const shoulderY = st.shoulder * height;
  const sleeveL = st.sleeve * height;
  const gestureL = (st.gesture ?? st.sleeve) * height;
  // Where the arm hinges. The shoulder stands a little OUTSIDE the robe's own
  // radius at that height, so the outline steps out from the collar to the arm
  // and the arm is seen beside the body rather than as a relief on it.
  const hinge = (side, x = SHOULDER_X) => new THREE.Vector3(side * x * s * height, shoulderY, st.armZ * height);
  // An arm is posed BEFORE its cloth is cut, because the cloth hangs by the
  // pose: `place` sets the rotation on a bare mesh, `spec` reads it back.
  const cut = (mesh, spec) => {
    mesh.geometry = armGeometry(spec);
    mesh.userData.elbow = mesh.geometry.userData.elbow;
    mesh.userData.hand = mesh.geometry.userData.hand;
    return mesh;
  };
  const bare = (name) => {
    const m = new THREE.Mesh(EMPTY, mat);
    m.name = name;
    return m;
  };
  // the cap of an arm that hangs leans in toward the neck: the slope of a
  // shoulder rather than the end of a tube
  const yoke = (side) => new THREE.Vector3(-side * 0.050 * height, 0.050 * height, 0);

  // THE REST POSE IS NOT A MIRROR IMAGE. Two identical sleeves hung at the same
  // angle either side of a symmetric robe is a chess piece. Each arm takes its
  // own forward swing, its own lean off the body and its own bend, and the two
  // swings are pushed apart rather than drawn independently, so one hand is
  // always ahead of the other and no draw can land back on symmetry. All of it
  // is kept small: this is how a man stands, not a pose. The draw is keyed on
  // `seed` AND on the figure's own height and girth, because a pose that leans
  // the same way on every figure reads as a stamp wherever several stand
  // together — and most cases already build their people at different sizes,
  // so they come out different without being asked. Every draw keeps each arm
  // leaning off its own side and far short of a gesture, since cases tell a
  // resting arm from a raised one by its rotation.z.
  const key = Math.imul(seed | 0, 7919) + Math.round(height * 1000) + Math.round(s * 100) * 131;
  const ahead = hash1(1, key) < 0.5 ? -1 : 1;
  const apart = REST.apart[0] + REST.apart[1] * hash1(2, key);
  // ---- THE STAFF, AND THE HAND ON IT ---------------------------------------
  // A MAN HOLDING A STAFF HOLDS IT. The plant is where it always was — a
  // distance out past the hem, on a bearing off the facing axis (see the
  // STANCES note) — and the ARM is solved to it: the hand on that side is laid
  // on the shaft, a fixed drop below the shoulder, and the elbow takes up
  // whatever length is left over. It was the other way round by accident for
  // as long as the arms stuck out: the plant was a stored offset that happened
  // to meet a sleeve leaning far enough to reach it, and when the arms came in
  // to hang by the body every standing elder was left beside a pole he was not
  // touching. Solving the arm rather than moving the staff keeps every plant
  // the cases are framed around, and keeps the shaft clear of the hem, which a
  // staff brought in to a hanging hand would not be.
  //
  // Who holds it: the right hand, unless the right hand is busy. A figure that
  // points or raises does so with the right arm, so its staff crosses to the
  // left — the same plant mirrored — and is held there. Folded hands hold
  // nothing and a seated elder has set his staff down, so neither reaches.
  const holds = elder && !seated && arms !== 'fold';
  const staffSide = holds && (arms === 'point' || arms === 'raise') ? -1 : 1;
  const staffBearing = staffAng !== undefined ? staffAng : st.staffAng;
  const staffFoot = new THREE.Vector3(
    staffSide * Math.cos(staffBearing) * st.staffX * s * height, 0,
    Math.sin(staffBearing) * st.staffX * s * height);
  // the shaft's centre at a given height, lean and all
  const staffAt = (y) => staffFoot.clone().add(
    new THREE.Vector3(-staffSide * Math.tan(STAFF_LEAN) * y, y, 0));
  const makeGripArm = (side) => {
    const from = hinge(side);
    // an arm does not shorten when its owner kneels: the gesture length is
    // the arm's own (see `gesture` in the STANCES note)
    const reach = GRIP.reach * gestureL;
    let drop = GRIP.drop * height;
    let to = staffAt(from.y - drop);
    const flat = Math.hypot(to.x - from.x, to.z - from.z);
    // a wide hem can put the staff further out than the arm reaches that far
    // down: grip higher, where it does
    if (Math.hypot(flat, drop) > reach) {
      drop = Math.sqrt(Math.max(0, reach * reach - flat * flat));
      to = staffAt(from.y - drop);
    }
    const d = to.sub(from);
    const chord = d.length();
    const arm = bare('arm');
    arm.position.copy(from);
    // lay local -y along the chord: z leans it out to the staff, x swings it
    // fore or aft. Still a resting arm to any case that asks — on its own
    // side, far short of a gesture.
    const lean = Math.asin(Math.max(-1, Math.min(1, d.x / chord)));
    arm.rotation.z = lean;
    arm.rotation.x = Math.asin(Math.max(-1, Math.min(1, -d.z / (chord * Math.cos(lean)))));
    const half = gestureL / 2;
    g.add(cut(arm, {
      len: chord,
      // upper arm and forearm are each half the arm; the elbow stands back
      // by whatever the chord does not use
      bend: Math.sqrt(Math.max(0, half * half - chord * chord / 4)),
      elbowAt: 0.5,
      toward: Z_AXIS.clone().negate(),
      root: scaled(HANG_ARM.root, height),
      elbow: scaled(HANG_ARM.elbow, height),
      cuff: scaled(GRIP.cuff, height),
      capTip: yoke(side),
      square: true,                             // the shaft passes through this mouth
    }));
    return arm;
  };

  const makeSleeve = (side) => {
    const i = side < 0 ? 10 : 20;
    const arm = bare('arm');
    arm.position.copy(hinge(side));
    arm.rotation.x = REST.swing + side * ahead * apart;
    arm.rotation.z = side * (REST.lean[0] + REST.lean[1] * hash1(i + 1, key));
    g.add(cut(arm, {
      len: sleeveL,
      bend: (REST.bend[0] + REST.bend[1] * hash1(i + 2, key)) * sleeveL,
      toward: Z_AXIS.clone().negate(),          // the elbow sits BACK; the hand comes forward
      root: scaled(HANG_ARM.root, height),
      elbow: scaled(HANG_ARM.elbow, height),
      cuff: scaled(HANG_ARM.cuff, height),
      capTip: yoke(side),
      hang: downIn(arm), drape: REST.drape * height,
    }));
    return arm;
  };

  // THE GESTURE ARM — always the right. The mesh's rotation lays the CHORD,
  // shoulder to hand, exactly where the straight sleeve used to lie, so every
  // case that aims this arm, lifts it a little further, or seats something in
  // its cuff still finds the hand where it was. What changed is between the
  // two ends: the elbow drops below the chord, so the upper arm leaves the
  // shoulder lower and the forearm climbs more steeply than the chord does,
  // and the sleeve hangs under the forearm.
  //
  // 'raise' is NOT 'point'. Point swings the sleeve up and OUT along the
  // bearing the figure faces, which is right for indicating a thing across the
  // scene (case 29's monk and the flag). Held up beside another person it aims
  // at them, and a raised finger aimed at someone reads as an insult rather
  // than a teaching — which is exactly how case 3 first came out. This holds
  // the arm nearly vertical, a few degrees clear of the body and tipped
  // forward, so the gesture is offered to the air instead of at anybody. It
  // rests well short of plumb so a case can still ANIMATE the lift toward
  // vertical (k3 does); starting plumb would send the arm over the top and
  // back down the far side.
  const makeGestureArm = (side) => {
    const arm = bare('arm');
    arm.position.copy(hinge(side));
    if (arms === 'point') { arm.rotation.z = Math.PI - 0.95; arm.rotation.y = 0.15; }
    else { arm.rotation.z = Math.PI - 0.34; arm.rotation.x = 0.22; }
    g.add(cut(arm, {
      len: gestureL,
      bend: LIFT.bend * gestureL,
      toward: X_AXIS.clone().negate(),          // local -x is down-and-out once the arm is up
      ref: Z_AXIS,
      root: scaled(LIFT_ARM.root, height),
      elbow: scaled(LIFT_ARM.elbow, height),
      cuff: scaled(LIFT_ARM.cuff, height),
      hang: downIn(arm), drape: (arms === 'point' ? LIFT.drapePoint : LIFT.drapeRaise) * height,
      square: true,                             // a finger, a fist, a fan sits in this mouth
    }));
    return arm;
  };

  // FOLDED ARMS HAVE ELBOWS, and theirs is a real hinge. One straight sleeve
  // pitched into the lap read as very stiff arms with no forearms at all. A
  // folded arm is two pieces: a short UPPER hanging from the shoulder, ending
  // in a joint rather than a mouth, and a FOREARM hinged there, swung inward
  // and forward so the two cuffs meet at the lap centre — hands tucked into
  // the opposite sleeves, no hand detail needed. The forearm is its own mesh
  // named 'forearm', a child of the arm; its cap surrounds the elbow the way
  // the upper's surrounds the shoulder, so the joint stays covered at any
  // bend. One hand lies a little over the other, for the same reason the
  // resting arms differ.
  const makeFoldedArm = (side) => {
    const upperLen = sleeveL * 0.55;
    const arm = bare('arm');
    arm.position.copy(hinge(side, FOLD.x));
    arm.rotation.x = st.foldUpper;          // the upper hangs, only a little forward
    arm.rotation.z = side * FOLD.clear;     // elbows just clear of the body
    cut(arm, {
      len: upperLen,
      root: scaled(FOLD.root, height),
      cuff: scaled(FOLD.joint, height),
      capTip: yoke(side).multiplyScalar(0.8),
      square: true,
    });
    const fore = bare('forearm');
    fore.position.y = -upperLen;            // hinged at the elbow, in the upper's frame
    // seated: down into the lap; standing: up to the waist
    fore.rotation.x = st.foldFore + side * ahead * FOLD.over;
    fore.rotation.z = -side * st.foldCross; // and across the body, until the cuffs all but touch
    arm.add(fore);
    cut(fore, {
      len: sleeveL * FOLD.fore,
      root: scaled(FOLD.joint, height),
      cuff: scaled(FOLD.cuff, height),
      hang: downIn(fore), drape: FOLD.drape * height,
      square: true,
    });
    g.add(arm);
    return arm;
  };
  // EVERY FIGURE HAS ARMS. There used to be an opt-out here — a background
  // figure could skip its sleeves for two fewer meshes apiece, which was once
  // what let a crowd fit the draw budget at all. `bakeStatic` merges a still
  // crowd down to one mesh, so arms became free exactly where the option was
  // wanted, and no case ever passed it again. Retired: nobody should be getting
  // rid of arms.
  for (const side of [-1, 1]) {
    // the gesture arm (point/raise, always the right) is one mesh, bent in its
    // own geometry; everything else folds when the pose or the stance says so
    // — a seated pointing teacher still keeps his OTHER hand in his lap
    const gesture = (arms === 'point' || arms === 'raise') && side === 1;
    if (gesture) makeGestureArm(side);
    else if (arms === 'fold' || seated) makeFoldedArm(side);
    else if (holds && side === staffSide) makeGripArm(side);
    else makeSleeve(side);
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

  // ---- THE WAIST ----------------------------------------------------------
  // A bow is BENT AT THE WAIST, not tipped over at the feet. Cases used to do
  // it by rotating the whole figure, which leans a rigid post — and case 32
  // leaned it about the wrong axis besides, so its philosopher listed sideways
  // — bowing about the wrong axis instead of forward at the waist, which is
  // what a bow actually is and why it deserves its own pose.
  //
  // `bow` opts a figure into a HINGE: everything above the sash — the torso
  // rings of the robe, the head, the hat, the arms — is re-parented into a
  // group named 'waist', standing at the sash line. The lathe is split there
  // and the two halves share their boundary ring, so the cloth stays sealed at
  // any angle. A case bows by turning that one group about x (bodies front
  // local +z, so a positive angle carries the chest forward), which means the
  // bow can ANIMATE — case 32's happens slowly, after twenty seconds of not
  // being touched. Costs one extra mesh, and only for figures that ask. SEATED
  // FIGURES HINGE TOO, and for a while they did not — this block was guarded
  // `&& !seated`, so a case that wanted a seated man to bow had no choice but
  // to rotate the whole figure about its feet. Case 17's Chu did exactly that,
  // and once his bow was deepened from nine degrees to twenty-four it became
  // obvious what "rotate a seated man about the ground" means: his knees and
  // the staff lying beside him swung underneath the terrain, along with the
  // staff lying beside him. Bend him at the waist instead.
  //
  // The sash sits in a different place on the two profiles, so the split does
  // too: STAND_PROFILE's obi is at 0.452 of height, SIT_PROFILE's at 0.220 —
  // read off the tables above rather than shared, because a seated man is
  // folded and his waist is much nearer the ground. Everything below the split
  // (the lap shelf, the cushion, the knees) stays where it is; the staff is
  // added further down this function and so never joins the hinge at all, which
  // is right for both stances — held in the hand it rides the arm, stood on the
  // ground it stays stood on the ground.
  let waist = null;
  if (bow !== false && bow !== 0) {
    const waistY = seated ? 0.220 : 0.452;    // fraction of height: at the obi
    const rows = st.profile;
    // the first ring at or above the sash — the two halves share it
    let k = rows.findIndex(([, y]) => y >= waistY);
    if (k < 1) k = 1;

    const lower = rows.slice(0, k + 1).map(([r, y], i) => [i === 0 ? r : r * s, y]);
    const upper = rows.slice(k - 1).map(([r, y]) => [r * s, y - rows[k - 1][1]]);

    const oldBody = g.children.find((c) => c.name === 'body');
    if (oldBody) { g.remove(oldBody); oldBody.geometry.dispose(); }
    // A STANDING body IS its lathe, so re-lathing the lower rows rebuilds it
    // exactly. A SEATED one is not: seatedBodyGeometry merges the lathe with a
    // cushion, a shin mass and two knees, and replacing it with a bare lathe
    // deleted all three — the teacher in case 17 lost his legs the moment
    // seated figures were allowed to hinge, and it showed at once. Ask the
    // seated builder for the lower half instead.
    if (seated) {
      const half = new THREE.Mesh(
        seatedBodyGeometry({ height, width: s, cushion, profile: lower }), mat);
      half.name = 'body';
      g.add(half);
    } else {
      g.add(robeLathe(lower, height, mat));
    }

    waist = new THREE.Group();
    waist.name = 'waist';
    waist.position.y = rows[k - 1][1] * height;
    const torso = robeLathe(upper, height, mat);
    torso.name = 'torso';
    waist.add(torso);

    // everything that rode on the torso moves with it, in the waist's frame
    for (const child of [...g.children]) {
      if (child === waist || child.name === 'body') continue;
      child.position.y -= waist.position.y;
      g.remove(child);
      waist.add(child);
    }
    g.add(waist);
    if (typeof bow === 'number') waist.rotation.x = bow;
  }

  if (elder) {
    const staffLen = st.staff * height;
    const staffGeo = new THREE.CylinderGeometry(0.018 * height, 0.018 * height, staffLen, 6);
    staffGeo.translate(0, staffLen / 2, 0);   // base at the local origin -> stands on the ground
    const staff = new THREE.Mesh(staffGeo, mat);
    staff.name = 'staff';
    // polar plant: a distance out, swung `staffAng` around the figure (see the
    // STANCES note, and THE STAFF AND THE HAND ON IT above — the arm was
    // solved to this point, so the two must stay the same point)
    staff.position.copy(staffFoot);

    // A SEATED ELDER SETS HIS STAFF DOWN. Planted upright beside a man on the
    // ground it read as a pole stuck in the earth next to him rather than as
    // something he had set down. Laid flat it becomes what it is: the thing he
    // was carrying, put down within reach. Tipped a full quarter turn about z
    // so the shaft lies along the ground, lifted by its own radius so it RESTS
    // on the plane rather than sinking half into it, and swung a little off the
    // figure's facing axis so it reads as dropped rather than squared up like a
    // ruler. Standing/kneeling plants are untouched — a man on his feet still
    // leans on it.
    if (seated) {
      // rotation.z = π/2 lays the shaft (local +y) down onto local -x; the
      // y-turn then swings that lying shaft around the compass. π/2 + skew puts
      // it FORE-AFT beside him (running past his knees, not across his lap),
      // skewed a little so it reads dropped rather than squared up.
      const SKEW = 0.18;
      const yaw = Math.PI / 2 + SKEW;
      staff.rotation.z = Math.PI / 2;
      staff.rotation.y = yaw;
      // where the shaft now runs, from its base: RY(yaw) applied to -x
      const dz = Math.sin(yaw);
      staff.position.y = 0.018 * height;       // resting ON the ground, not buried
      // slide it half a length AFT only — the plant distance (staffX) still
      // sets how far out it lies, so the shaft stays clear of the cushion the
      // way the upright plant stayed clear of the hem
      staff.position.z -= dz * staffLen * 0.5;
    } else {
    // NEAR-VERTICAL, not leaned in. The old 0.08 rad lean tipped the top toward
    // the figure, which put the shaft at ~0.194·h off the axis right at
    // hat-brim height — the brim reaches 0.192·h — so from roughly half of all
    // camera bearings the staff read as growing out of the wearer's hat
    // (k11/k19/k21/k22/k27/k31/k34/k36/k39, the "not in the right place"
    // audit). Leaned back a hair, the shaft clears the brim. The hand is laid
    // on it wherever it stands (makeGripArm), so the lean is free to be
    // whatever clears the hat. The plant distances (staffX) are untouched.
      staff.rotation.z = staffSide * STAFF_LEAN;
    }
    g.add(staff);
  }

  // The contact-gap fix (see frontShadow's own comment in render/material.js):
  // figures are the props whose ground contact the reader looks at hardest,
  // so every one opts in. The CAP points in the robe profiles above are this
  // line's precondition — an open neck under front-face depth was a light
  // pipe through the body.
  frontShadow(g);
  return g;
}
