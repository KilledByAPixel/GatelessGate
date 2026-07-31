import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT } from '../palette.js';
import { mergeSimple } from './scatter.js';

// The raised finger (case 3). Gutei answered every question about Zen by
// holding up one finger, and his boy attendant started answering the same way —
// so this little thing gets built twice, at two sizes, and it is the whole case.
//
// One lathed digit: a slim shaft that swells slightly, then tapers into a
// rounded tip, hinged at the local origin so it can be dropped onto the hem of a
// raised sleeve and left pointing at the sky.
//
// ONE mesh, deliberately, and it matters. The finger is this koan's red seal and
// the scene is asserted to carry exactly one accent mesh — Gutei's (the boy's
// hand is empty, his finger gone). Built from a stack of PARTS (shaft plus a
// capping sphere, the obvious first draft) the count would quietly drift and the
// assertion that keeps this case honest would stop meaning anything. Two
// GEOMETRIES merged into that one part is a different thing, and this file now
// does it once: the shaft is still a single lathe, and the nail below is a flat
// plane welded onto it with `mergeSimple` (the same trick koi.js uses for its
// fin hints) before either ever reaches a `Mesh` constructor. `f.isMesh` and
// `f.children.length === 0` — what the case actually depends on — hold exactly
// as before.
//
// Authored a good deal larger than an anatomical finger, for the same reason the
// lotus in case 6 is oversized — the thing being gestured with has to carry the
// shot, and at true scale the seal is a speck (see the file header on this
// builder's own 3x scale). That size is also the reason it is worth carving
// knuckle steps and a nail into it now: at true scale this is a smear no one
// would resolve, but a few centimetres of geometry blown up to carry a shot
// reads as a shaft unless something breaks up the taper. Kept around three
// times as long as it is wide, though: fatter than that and it stops reading as
// a finger and starts reading as a bead someone is holding up.
export function makeRaisedFinger({
  length = 0.15, radius = 0.025, color = ACCENT, segments = 9,
} = {}) {
  const L = length, R = radius;
  // (radius, height) up the digit: closed at the base so nothing shows when it
  // is sunk into a cuff, closed again at the tip so it reads round, not cut off.
  // Two step pairs (rise then a shallow step-in) stand in for the proximal and
  // middle knuckles — a joint on a finger is a swell followed by a crease, not
  // a smooth taper, and without them the lathe read as a shaft rather than a
  // digit at workbench range. The widest point (0.30L) is untouched from the
  // original profile, so the finger's overall silhouette (its bounding box,
  // its widest ring) is unchanged.
  //
  // A THIRD step, right before the tip, is the nail bed: a short FLAT run
  // (0.64L to 0.90L both sit at the same 0.50R) rather than a continued taper.
  // A first attempt left the wall tapering smoothly through that span and set
  // the nail plane at a single depth chosen to clear the taper's tightest
  // point — which meant it sat flush with, or inside, the wall everywhere the
  // taper was looser (a raycast from the nail's own facing direction proved
  // this: every ray hit the shaft first, none hit the nail). Flattening the
  // bed under it removes the tapering-clearance problem entirely: the plane
  // only has to clear ONE radius, not a range.
  const profile = [
    [0.00, 0.00],
    [R * 0.94, 0.00],
    [R * 0.99, L * 0.09],   // first knuckle: swells toward the joint
    [R * 0.87, L * 0.15],   // first knuckle: the joint's own step-in
    [R * 1.00, L * 0.30],   // second knuckle: the widest point on the digit
    [R * 0.89, L * 0.38],   // second knuckle: its step-in
    [R * 0.96, L * 0.58],
    [R * 0.68, L * 0.62],   // crease into the nail bed
    [R * 0.50, L * 0.64],   // nail bed floor starts — matches nailY0 below
    [R * 0.50, L * 0.90],   // nail bed floor ends — matches nailY1 below, still flat
    [R * 0.36, L * 0.95],   // taper resumes past the nail, toward the tip
    [R * 0.16, L * 0.98],
    [0.00, L],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shaft = new THREE.LatheGeometry(profile, segments);

  // The nail: a flat facet standing in for it, since a nail is not a body of
  // revolution and no lathe profile can produce one. Set PROUD of the (now
  // flat) 0.50R bed it sits over — 0.62R, a deliberate 0.12R standoff, comfortably
  // under the shaft's own global-max radius (1.00R at 0.30L) so the bounding
  // box the finger's shape test measures doesn't move.
  // Kept a hair inside the bed's own 0.64L-0.90L span, not flush with it: right
  // at those exact y's the lathe geometry is still the RING where the crease
  // and the taper-resume triangles land, and a ray grazing that exact seam can
  // catch a transitional facet instead of the flat floor. A small margin keeps
  // every ray inside the nail's own footprint over the bed proper.
  const nailY0 = L * 0.655, nailY1 = L * 0.885;
  const nailHalfWidth = R * 0.28;
  const nailStandoff = R * 0.62;
  const nail = new THREE.PlaneGeometry(nailHalfWidth * 2, nailY1 - nailY0);
  nail.rotateY(Math.PI / 2);                       // its normal now faces local +x, not the plane's own +z
  nail.translate(nailStandoff, (nailY0 + nailY1) / 2, 0);

  const mesh = new THREE.Mesh(
    mergeSimple([shaft, nail]),
    // DoubleSide for the merged whole: the nail is a zero-thickness plane and
    // would vanish for whichever half of every view faces away from it —
    // toonMaterial defaults FrontSide, and this is the same koi-fin lesson
    // (A7) the house style already names. One shared material, so the nail
    // costs nothing extra to draw.
    toonMaterial({ color, flat: true, side: THREE.DoubleSide }));
  mesh.name = 'finger';
  return mesh;
}
