import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';
import { applyFoliageWind } from './foliage.js';

// THE pine: a straight trunk carrying a stack of hexagonal cone tiers that
// taper to a true point.
//
// This model has been two other things. First a stack of concentric cones on
// a stub (too mechanical), then a sumi-e experiment — an elbowed trunk with
// flat cloud-pads kicked off to alternating sides. Frank ended that one:
// "maybe you did a pass on it and messed it up so it was more interesting
// looking... it looks really weird. Make it more like a straight-up pine
// tree, same geometries, more straight up, pointy top like a pine tree has."
// So: the classic silhouette, kept honest by SMALL seeded irregularities
// (tier radius, spin, a slight off-centre set) instead of by crooking the
// whole tree. A stand of them varies without any one of them looking bent.
//
//   1. a STRAIGHT vertical trunk — root flare, one tapered bole;
//   2. TIERS: six-sided cones, each smaller than the one below, overlapping
//      so the profile stays one solid triangle at fog distance;
//   3. a POINTY TOP — the crown tier is a true cone whose apex is the
//      highest vertex of the tree.
//
// pineGeometry() returns ONE merged BufferGeometry so a whole stand can be
// drawn as a single InstancedMesh (see makeForest); makePine() wraps it in a
// mesh for the hero pine placed by hand (cases 36, 41).
// THE WIND GOES THROUGH IT — as a BEND, tier riding tier (Frank: "it would be
// cool for the pine if it also, like, bend a little bit where it was like a
// hierarchy and each kind of successive one was bent a little, so it swayed a
// tiny little bit").
//
// The first attempt displaced each tier on its own and was wrong in two ways at
// once, both of which Frank named: "the ones on the top move more, they're
// moving way too much", and "it feels kinda lopsided... moving way too much off
// the side". Both are the same mistake. A tier translated sideways while the
// bole underneath it stands still does not read as a tree bending, it reads as
// cones sliding off a pole — and the lateral flutter the leaf clusters use, put
// on a solid cone the size of a tier, is pure sideways slide.
//
// So the pine is a CANTILEVER now: the whole tree, trunk included, bends about
// its own foot on a height-squared curve (aColumn in kit/foliage.js), which
// pins the base without pinning the tree. The tiers are along for that ride at
// very nearly the bole's own weight, and everything below is what is left of
// "each one moves on its own" — deliberately small, because the ride IS the
// effect and any tier that argues with it goes back to sliding.
// How far the mast leans relative to a broadleaf's outermost foliage. THE DIAL
// FOR HOW MUCH A PINE BENDS — TIER_LAG is the separate one for whether that
// bend reads as a hierarchy.
//
// It went 1.0 -> 0.62 -> 0.95 across two live passes, and the round trip is
// worth recording because the second move was made for a reason that turned
// out to be wrong. 0.62 was damping for "moving way too much"; what was
// actually too much was the sideways slide of tiers displaced independently of
// a motionless bole, which the cantilever fixed on its own. With that gone the
// damping only made the tree lifeless, and Frank read the result exactly right:
// "the pine is moving even less than the other tree."
//
// Which it structurally would at parity. A broadleaf carries EVERY leaf cluster
// out at sway ~1, while a column's weight is height-squared, so most of a
// pine's mass sits well down the curve and only the crown gets full travel. The
// mean part of a pine therefore moves far less than the mean part of a tree for
// the same number, and matching them by eye means a pine's number reads higher.
const MAST_SWAY = 1.95;
const TIER_LAG = 0.28;      // radians of phase per tier — the lag that curves the
                            // mast as it sways. 1.35 made each tier its own event;
                            // a quarter-radian reads as one bend arriving late at
                            // the top, which is the hierarchy Frank asked for.
const TIER_FLEX = 0.16;     // how much more than the bole a tier flexes at its own
                            // height. Small on purpose: this is the whole margin
                            // by which a tier may leave the trunk's curve.
const TIER_LIFE = 0.30;     // the tiers' share of the leaf flutter — the pine's own
                            // "needles moving" dial, separate from the bend above.
                            // 1 was the "off the side" wobble (a full cluster-shiver
                            // on a cone this size is pure lateral slide) and 0.18
                            // overshot the correction; 0.30 is life without slide.

export function pineGeometry({ height = 4, tiers = 5, seed = 3 } = {}) {
  const parts = [];
  const sway = [], phase = [], leaf = [], column = [];
  // Every part of a pine is on the same mast, so every part carries the same
  // 1/height normaliser — the shader turns it into the height fraction per
  // VERTEX, which is what lets the one-piece bole bend instead of shifting.
  const col = 1 / height;
  // One deterministic stream for the whole tree, drawn in build order: trunk
  // first, then tiers bottom-to-top. The order stays stable from here on.
  let draw = 0;
  const rnd = () => hash1(draw++, seed);

  // ---- the trunk: straight up -------------------------------------------
  const rBase = height * 0.038;      // thick enough to survive fog distance
  const rTip = height * 0.012;
  const rootH = height * 0.055;      // an old trunk flares at the ground
  const root = new THREE.CylinderGeometry(rBase, rBase * 1.35, rootH, 5);
  root.translate(0, rootH / 2, 0);
  parts.push(root);
  sway.push(MAST_SWAY); phase.push(0); leaf.push(0); column.push(col);
  const boleH = height * 0.62;       // the rest of it is inside the tiers
  const bole = new THREE.CylinderGeometry(rTip, rBase, boleH, 5);
  bole.translate(0, rootH + boleH / 2, 0);
  parts.push(bole);
  // The bole IS the mast: full weight and no phase of its own, so it is the
  // curve everything else is measured against. Its foot still does not move —
  // that is the height term resolving per vertex, not a per-part exemption,
  // which is the whole reason the trunk can be one cylinder and still bend.
  sway.push(MAST_SWAY); phase.push(0); leaf.push(0); column.push(col);

  // ---- the tiers ----------------------------------------------------------
  // Each tier is a six-sided TRUE cone (an apex, not a plateau): stacked and
  // overlapping, they read as one pointed tree, and the topmost apex IS the
  // pointy top. Radii, spin and a slight off-centre set are seeded per tier
  // so two pines never match, but every jitter is small — the tree stands
  // straight; the variation is in the foliage, not the posture.
  for (let i = 0; i < tiers; i++) {
    const f = tiers === 1 ? 1 : i / (tiers - 1);   // 0 lowest tier, 1 crown
    const baseY = height * (0.20 + 0.52 * f);
    const rad = height * (0.30 - 0.20 * f) * (0.92 + 0.16 * rnd());
    const coneH = height * (0.32 - 0.14 * f);
    const cone = new THREE.ConeGeometry(rad, coneH, 6);
    cone.rotateY(rnd() * Math.PI * 2);             // break the shared hexagon seam
    cone.translate(
      (rnd() - 0.5) * height * 0.03,               // a touch off-centre, never a lean
      baseY + coneH / 2 + (rnd() - 0.5) * height * 0.02,
      (rnd() - 0.5) * height * 0.03,
    );
    parts.push(cone);
    // A tier rides the mast's own bend — weight 1, the bole's — plus a sliver
    // of flex of its own that grows toward the crown. The height curve is
    // already doing the "higher moves more" job per vertex, so this must NOT
    // repeat it: the previous version put the whole 0.34..1.0 ramp here on top
    // of a bole that was not moving at all, which is how the top tier ended up
    // "moving way too much" and away from the trunk instead of with it.
    sway.push(MAST_SWAY * (1 + TIER_FLEX * f));
    // No seeded jitter on the phase. It was rnd() * 0.5 against a 1.35 lag, and
    // at the 0.28 lag the tiers now use, a half-radian of noise would swamp the
    // ordering and put tiers back to arriving in a scramble. The lag has to
    // read as a sequence up the tree or it is not a hierarchy.
    phase.push(i * TIER_LAG);
    leaf.push(TIER_LIFE);
    column.push(col);
  }

  return mergeSimple(parts, { aSway: sway, aPhase: phase, aLeaf: leaf, aColumn: column });
}

export function makePine({ height = 4, tiers = 5, seed = 3, color = WASH.dark } = {}) {
  const mesh = new THREE.Mesh(
    pineGeometry({ height, tiers, seed }),
    applyFoliageWind(washMaterial({ color, flat: true })));
  mesh.name = 'pine';
  mesh.userData.foliageWind = true;   // carries wind attributes — keeps bakeStatic off it
  return mesh;
}
