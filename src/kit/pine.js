import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';

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
export function pineGeometry({ height = 4, tiers = 5, seed = 3 } = {}) {
  const parts = [];
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
  const boleH = height * 0.62;       // the rest of it is inside the tiers
  const bole = new THREE.CylinderGeometry(rTip, rBase, boleH, 5);
  bole.translate(0, rootH + boleH / 2, 0);
  parts.push(bole);

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
  }

  return mergeSimple(parts);
}

export function makePine({ height = 4, tiers = 5, seed = 3, color = WASH.dark } = {}) {
  const mesh = new THREE.Mesh(pineGeometry({ height, tiers, seed }), toonMaterial({ color, flat: true }));
  mesh.name = 'pine';
  return mesh;
}
