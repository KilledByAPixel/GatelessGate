import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
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
// always reach y = -len at the cuff and be widest there. (The shoulder ball
// below pokes a little ABOVE y = 0; min.y and max.x, the two numbers cases
// actually read, are untouched by it.)
//
// `r0` is the shoulder, `r1` the wrist; everything between is expressed in
// terms of those two so a caller retuning either still gets the same shape.
// `flare` overrides the cuff lip: 1 = a flush mouth — what an ELBOW wants,
// since the flare is a sleeve-mouth thing and a joint wearing one reads as
// a second wrist (Frank, on the folded arms).
export function sleeve({ height = 1.6, len = 0.34 * 1.6, r0 = 0.035, r1 = 0.065, flare = CUFF_FLARE, mat }) {
  const a = r0 * height;              // shoulder
  const b = r1 * height;              // wrist
  // flare <= 1 means the mouth is a JOINT (an elbow), not a cuff: the whole
  // lip-nip-belly shaping goes with it — even a flush lip kept the roll and
  // read as "still kind of a weird flare on their elbow" (Frank). A joint
  // sleeve is a plain taper, nothing else.
  const rows = flare > 1 ? [
    [0, -len],                        // the mouth of the cuff, closed
    [b * flare, -len],                // THE CUFF LIP — the widest cloth on the arm
    [b * 0.99, -len * 0.930],         // the flare rolling back in
    [b * 0.76, -len * 0.840],         // the nip above it
    [b * 0.88, -len * 0.620],         // the belly of the sleeve
    [b * 0.81, -len * 0.320],
    [a, 0],                           // THE SHOULDER — origin, and the top of the bounds
    [0, 0],                           // closed
  ] : [
    [0, -len],
    [b, -len],                        // a plain taper down to the joint
    [b * 0.94, -len * 0.55],
    [a, 0],
    [0, 0],
  ];
  const profile = rows.map(([r, y]) => new THREE.Vector2(r, y));
  // THE SHOULDER BALL. The sleeve hinges at its origin, and any rotation
  // tips its top ring away from the robe — a wedge of daylight at every
  // posed arm ("the joints show there's a gap where the arm attaches" —
  // Frank). A ball centred exactly on the hinge is rotation-invariant, so
  // the join stays covered at ANY arm pose; merged into the sleeve's own
  // geometry, it costs no mesh.
  const ball = new THREE.SphereGeometry(a * 1.22, 7, 6);   // 1.35 read as bulky pauldrons on the seated figure
  const arm = new THREE.Mesh(
    mergeSimple([new THREE.LatheGeometry(profile, 7), ball]), mat);
  arm.name = 'arm';
  return arm;
}

// A head: slightly OBLONG, not a ball — narrowed a touch and stretched tall
// ("slightly less spherical, slightly more oblong, shaped like a head is" —
// Frank). Baked into the GEOMETRY, not mesh.scale: buddha.js parents its
// topknot and urna to this mesh, and a scaled mesh would distort them.
// Exported so those marks can place themselves against the true skull shell.
export const HEAD_OBLONG = [0.96, 1.10, 1.0];
export function sphereHead({ height = 1.6, r = 0.095, mat }) {
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
// Exported (with the hat profile below) for `assembly.js`: the instanced
// crowd builds its per-instance geometry from the same seated silhouette the
// hero monks wear, so a background figure at fog distance is the same person,
// simplified — not a different species of pawn.
//
// THE LAP SHELF, then THE KNEES. The first seated profile tapered
// continuously from hem to collar and Frank read it exactly right: "like
// they're wearing a fat dress — like they're not sitting at all." The lap
// shelf fixed the vertical read — a wide low block, a near-horizontal lap
// turn, the torso rising visibly INSET — but the block itself was still a
// solid of revolution, and Frank read THAT exactly right too: "they need,
// like, legs." A figure in lotus (see local/refs/buddha.png) is widest at
// the KNEES, left and right, with a valley between them where the hands
// rest; a radially symmetric pool can never say "folded legs". So the lathe
// here is only the cloth core — the shins and the pooled robe BETWEEN the
// knees — pulled in to 0.25·h, and the knees are two ellipsoids at ±x merged
// into the same geometry by `seatedBodyGeometry` below (one mesh; the same
// move buddha.js's round-2 statue made before it was folded into this kit).
// Same ten indices, same roles as STAND_PROFILE, so `kneel`'s halfway blend
// stays honest — the "long run up the skirt" is here the run up the shins,
// and the "skirt gathering" is the lap turn itself.
export const SIT_PROFILE = [
  // Round five made the base HONEST (Frank: "it IS a cushion — okay, cushion
  // is good, but make it flat, about a quarter the height, and give them
  // butt cheeks and a leg shape so it looks like they're sitting ON it").
  // The lathe here is now only the ROBE — a slim cloth core whose hem pools
  // on the cushion's top, not on the ground. Everything the robe drapes
  // over is its own ellipsoid, merged in by seatedBodyGeometry below: a
  // flat zabuton at y=0, two cheeks resting on it at the rear, the crossed
  // shins as a wide bar in front, and the two knee crests. The lathe stays
  // inside all of them, so what reads at distance is figure-on-cushion.
  [0.020, 0.035],   // hem centre, closed on the cushion's top
  [0.150, 0.040],   // the hem pooling over the seat
  [0.158, 0.085],   // the robe over the hips — slimmed in round six ("that round
                    //   thing that's their whole bottom part... a little smaller")
  [0.150, 0.150],   // rising over the leg block toward the lap
  [0.140, 0.175],   // THE LAP — a near-horizontal shelf in to the waist
  // torso rows carry the STANDING profile's widths (round seven: "the upper
  // torso should be shaped more like the standing one, similar size" — the
  // seated blouse/chest ran ~6% fatter and read as a heavier man)
  [0.112, 0.220],   // OBI — the tie
  [0.134, 0.265],   // the blouse pushed up over the knot
  [0.121, 0.425],   // chest — one long VERTICAL run: a meditator sits straight
  [0.097, 0.458],   // COLLAR
  [0.058, 0.478],   // the neck opening
];

// THE SEAT, in fractions of height. Frank's reading, round five: the base
// IS a cushion, so build it as one — and put a body on it.
//   CUSHION — a flat zabuton: a quarter the height of the old pooled base,
//     wider than everything above it, so a rim of it shows all round and
//     the figure reads as sitting ON something rather than melting into it.
//   SHINS — the crossed legs: one wide flat bar ACROSS the front.
//   KNEES — the two crests at ±x, long axis yawed forward-out the way a
//     folded thigh lies; still the widest thing the figure owns.
// (Round six cut the CHEEK lobes: with the hip ring slimmed they added
// nothing but width where Frank wanted less — the robe's own rear reads.)
const CUSHION = { r: 0.26, rTop: 0.235, hh: 0.042 };
const SHINS = { r: 0.09, scale: [2.3, 0.62, 1.0], y: 0.075, z: 0.10 };
const KNEE = { r: 0.09, scale: [1.5, 0.75, 1.1], x: 0.18, y: 0.095, z: 0.095, yaw: 0.5 };

// The whole seated body — robe lathe + cushion + cheeks + shins + knees —
// as ONE geometry (one mesh, no extra draws anywhere it is used).
// Exported because the assembly's instanced crowd must be the same person:
// it feeds this straight into its InstancedMesh (still one draw call).
// `width` is the radial squeeze (`stout`, or the crowd's SLIM): it thins the
// lathe and the cushion around the axis and carries the mass centres inward,
// but the flesh masses keep their own size — at fog distance the knees and
// the cushion rim are the events that must survive.
// `cushion: false` drops the zabuton — for a case that already lays its own
// mat under the figure (k10/k17/k30/k34). Two slabs of nearly the same size
// stacked read as one thing doubled, not as a cushion on a mat: Frank found
// exactly that in case 17 ("an extra thin rectangular shaped thing below this
// guy"). The body's other masses are unchanged, so he still sits on his own
// legs at the same height either way.
export function seatedBodyGeometry({ height, width = 1, segments = 10, cushion: withCushion = true } = {}) {
  const lathe = new THREE.LatheGeometry(
    SIT_PROFILE.map(([r, y], i) => new THREE.Vector2((i ? r * width : r) * height, y * height)),
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
// standing figure's height.
// `staffX` is where the elder's staff plants, laterally, in fractions of
// height — and it is per-stance because the hem is. A standing hem reaches
// 0.212h and the staff at 0.26h stands clear of it; a seated figure's knees
// reach 0.3375h, so the same 0.26h planted the staff INSIDE the cloth and it emerged
// through the robe like a stick stuck in a tent (k17's report — fixed there
// by hand first, at 0.58/1.6h = 0.3625h, which is the number promoted here:
// past the hem plus the staff's own radius, so it reads as the teacher's
// staff set down beside him, within reach). Standing keeps 0.26 exactly —
// every standing elder in the book is framed around it.
// `staffAng` is the BEARING of the staff plant, radians around +y off the
// local +x axis (toward +z). It exists because of a systematic staging
// coincidence the grip audit found: cases aim a standing elder at something
// up-scene with aimMonk (which turns local +x to the target) and the shipped
// camera looks over his shoulder at the same target — so a staff planted ON
// the +x axis sits exactly on the camera→figure→target line and reads as
// growing out of the wearer's hat (k11/k19/k21/k22/k27/k31/k34/k36/k39).
// Swinging the standing plant ~50° off the facing axis keeps it the same
// distance out — past the hem, beside the resting sleeve — but breaks the
// alignment for over-the-shoulder cameras. Seated figures face local +z
// (the folded sleeves), so their +x plant already IS the side plant and
// stays at 0. Cases with a bearing-sensitive staging can override with the
// `staffAng` option (additive; 0 = the old on-axis plant).
// `foldUpper`/`foldFore` are the folded-arm pitches (radians off plumb,
// toward local +z) for the two-piece arm — the upper's hang and the
// forearm's bend at the elbow — and they are per-stance because the hands'
// destination is: seated hands rest DOWN in the lap (a gentle bend), while
// standing hands meet at the waist (the forearm swings nearly horizontal).
// The inward swing (the cuffs crossing to the centre) is the same for all.
const KNEEL = 0.5;
const STANCES = {
  stand: { profile: STAND_PROFILE, shoulder: 0.60, sleeve: 0.34, head: 0.735, hat: 0.80, armZ: 0, staff: 1.2, staffX: 0.26, staffAng: 0.2, foldUpper: -0.12, foldFore: -1.45, foldCross: 0.92 },
  // Seated head/shoulder/hat ride 0.015·h higher than the lap-shelf tune did:
  // the chest run in SIT_PROFILE was lengthened and steepened so a meditator
  // sits STRAIGHT ("they should all kinda look like Buddha") — the crown now
  // tops out at 0.610·h, still comfortably a seated man, and the fold angle
  // eases to -0.44 so the cuffs keep landing in the lap the knees now frame.
  sit: { profile: SIT_PROFILE, shoulder: 0.415, sleeve: 0.24, head: 0.515, hat: 0.560, armZ: 0.03, staff: 0.7, staffX: 0.3625, staffAng: 0, foldUpper: -0.22, foldFore: -0.31, foldCross: 1.1 },
  kneel: {
    profile: mixProfile(STAND_PROFILE, SIT_PROFILE, KNEEL),
    shoulder: mix(0.60, 0.40, KNEEL),
    sleeve: mix(0.34, 0.24, KNEEL),
    head: mix(0.735, 0.50, KNEEL),
    hat: mix(0.80, 0.545, KNEEL),
    armZ: mix(0, 0.03, KNEEL),
    staff: mix(1.2, 0.7, KNEEL),
    staffX: mix(0.26, 0.3625, KNEEL),
    staffAng: mix(0.9, 0, KNEEL),
    foldUpper: mix(-0.12, -0.22, KNEEL),
    foldFore: mix(-1.45, -0.31, KNEEL),
    foldCross: mix(0.92, 1.1, KNEEL),
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
  hat = true, stout = 1, elder = false, staffAng, mat: matIn,
  cushion = true,          // seated only — false where the case lays its own mat
  bow = 0,                 // radians bent FORWARD at the waist; see bendForward
} = {}) {
  const g = new THREE.Group();
  g.name = 'figure';
  const mat = matIn || toonMaterial({ color, flat: true });
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
    else { arm.rotation.z = side * 0.28; }
    g.add(arm);
    return arm;
  };

  // FOLDED ARMS HAVE ELBOWS. One straight sleeve pitched into the lap read
  // as "very stiff arms... like they don't have any forearms at all"
  // (Frank). A folded arm is two sleeves: a short UPPER hanging from the
  // shoulder (its slimmer cuff is the elbow), and a FOREARM hinged there,
  // swung inward and forward so the two cuff mouths meet at the lap centre —
  // hands tucked into the opposite sleeves, no hand detail needed. The
  // forearm is a sleeve() too, so its merged shoulder ball covers the elbow
  // joint at any bend, the same way the upper's covers the shoulder.
  const makeFoldedArm = (side) => {
    const upperLen = sleeveL * 0.55;
    // the upper's mouth is an ELBOW, not a wrist: flush, no cuff lip
    const arm = sleeve({ height, len: upperLen, r1: 0.052, flare: 1, mat });
    arm.position.set(side * 0.115 * s * height, shoulderY, st.armZ * height);
    arm.rotation.x = st.foldUpper;          // the upper hangs, only a little forward
    arm.rotation.z = side * 0.12;           // elbows just clear of the body
    // a quieter mouth than a hanging sleeve: gathered hands, not trumpets
    const fore = sleeve({ height, len: sleeveL * 0.62, r1: 0.052, flare: 1.04, mat });
    fore.name = 'forearm';
    fore.position.y = -upperLen;            // hinged at the elbow, in the upper's frame
    fore.rotation.x = st.foldFore;          // seated: down into the lap; standing: up to the waist
    fore.rotation.z = -side * st.foldCross; // and across the body, until the cuffs all but touch
    arm.add(fore);
    g.add(arm);
    return arm;
  };
  // a background figure can skip its sleeves — two fewer meshes apiece, which is
  // what lets a crowd fit the draw budget
  if (arms) {
    for (const side of [-1, 1]) {
      // the gesture arm (point/raise, always the right) stays a single
      // sleeve; everything else folds when the pose or the stance says so —
      // a seated pointing teacher still keeps his OTHER hand in his lap
      const gesture = (arms === 'point' || arms === 'raise') && side === 1;
      if (!gesture && (arms === 'fold' || seated)) makeFoldedArm(side);
      else makeSleeve(side);
    }
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
  // (Frank: "he's bowing along the wrong axis... he should be bowing forward,
  // and ideally bent at the waist... it could be a separate pose").
  //
  // `bow` opts a figure into a HINGE: everything above the sash — the torso
  // rings of the robe, the head, the hat, the arms — is re-parented into a
  // group named 'waist', standing at the sash line. The lathe is split there
  // and the two halves share their boundary ring, so the cloth stays sealed at
  // any angle. A case bows by turning that one group about x (bodies front
  // local +z, so a positive angle carries the chest forward), which means the
  // bow can ANIMATE — case 32's happens slowly, after twenty seconds of not
  // being touched. Costs one extra mesh, and only for figures that ask.
  let waist = null;
  if (bow !== false && bow !== 0 && !seated) {
    const waistY = 0.452;                     // fraction of height: just under the obi
    const rows = st.profile;
    // the first ring at or above the sash — the two halves share it
    let k = rows.findIndex(([, y]) => y >= waistY);
    if (k < 1) k = 1;

    const lower = rows.slice(0, k + 1).map(([r, y], i) => [i === 0 ? r : r * s, y]);
    const upper = rows.slice(k - 1).map(([r, y]) => [r * s, y - rows[k - 1][1]]);

    const oldBody = g.children.find((c) => c.name === 'body');
    if (oldBody) { g.remove(oldBody); oldBody.geometry.dispose(); }
    g.add(robeLathe(lower, height, mat));

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
    // polar plant: same distance out, swung `staffAng` around the figure
    // (see the STANCES note). ang = 0 reproduces the old on-axis plant
    // bit-exactly: (staffX·s·h, 0, 0.06·h).
    const ang = staffAng !== undefined ? staffAng : st.staffAng;
    staff.position.set(
      Math.cos(ang) * st.staffX * s * height, 0,
      Math.sin(ang) * st.staffX * s * height);

    // A SEATED ELDER SETS HIS STAFF DOWN. Planted upright beside a man on the
    // ground it read as a pole stuck in the earth next to him — "their staff
    // is appearing kinda like just sticking up out of the ground next to
    // them, it makes it look kinda weird" (Frank). Laid flat it becomes what
    // it is: the thing he was carrying, put down within reach. Tipped a full
    // quarter turn about z so the shaft lies along the ground, lifted by its
    // own radius so it RESTS on the plane rather than sinking half into it,
    // and swung a little off the figure's facing axis so it reads as dropped
    // rather than squared up like a ruler. Standing/kneeling plants are
    // untouched — a man on his feet still leans on it.
    if (seated) {
      // rotation.z = π/2 lays the shaft (local +y) down onto local -x; the
      // y-turn then swings that lying shaft around the compass. π/2 + skew
      // puts it FORE-AFT beside him (running past his knees, not across his
      // lap), skewed a little so it reads dropped rather than squared up.
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
    // NEAR-VERTICAL, not leaned in. The old 0.08 rad lean tipped the top
    // toward the figure, which put the shaft at ~0.194·h off the axis right
    // at hat-brim height — the brim reaches 0.192·h — so from roughly half
    // of all camera bearings the staff read as growing out of the wearer's
    // hat (k11/k19/k21/k22/k27/k31/k34/k36/k39, the "not in the right
    // place" audit). At 0.02 rad the shaft clears the brim by ~0.05·h and
    // still passes within a hand's reach of the resting cuff, so it reads
    // as the same planted, gripped staff — just beside the monk instead of
    // through his hat. The plant distances (staffX) are untouched.
      staff.rotation.z = 0.02;
    }
    g.add(staff);
  }
  return g;
}
