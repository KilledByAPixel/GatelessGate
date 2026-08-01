import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { GRAY_DARK, WASH } from '../palette.js';

// A deciduous ink tree grown recursively: the trunk forks into limbs, those
// fork again, and foliage sits at the branch tips. The whole skeleton is merged
// into ONE mesh and all the foliage into another, so a tree with ~25 limbs and
// ~15 leaf clusters still costs two draw calls (four with outlines) — the same
// as the old five-blob version it replaces.
//
// Everything derives from hash1(seed), so a given seed always grows the same tree.
export function makeTree({
  height = 3.2, seed = 2, trunkColor = GRAY_DARK, canopyColor = WASH.deep, depth = 3,
} = {}) {
  const g = new THREE.Group();
  g.name = 'tree';

  const wood = [];
  const leaves = [];
  let draw = 0;
  const rnd = () => hash1(draw++, seed);   // one deterministic stream for the whole tree
  // a second, independent seeded stream for the droop/curve detail added
  // below — kept off the `rnd`/`draw` stream on purpose: consuming it there
  // would shift every fork-count, spread-angle and leaf-placement draw that
  // follows in the traversal, changing the whole tree's silhouette for a
  // "slight" cosmetic tweak. Still fully seeded (hash1 only), just its own
  // counter.
  let droopDraw = 0;
  const droopRnd = () => hash1(droopDraw++, seed * 1013 + 7);

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);

  // pushes one tapered cylinder growing up from the joint at m into the shared
  // wood[] merge list — every branch segment, at any level, goes through this
  function pushSeg(m, len, radTop, radBottom) {
    const seg = new THREE.CylinderGeometry(radTop, radBottom, len, 5);
    seg.translate(0, len / 2, 0);
    seg.applyMatrix4(m);
    wood.push(seg);
  }

  // a joint ball where two segments meet at an angle: cylinders touching
  // edge-to-edge open a wedge of daylight at every node (Frank: "the tree
  // has gaps at the nodes"), and a knot there both closes it and reads as
  // the burl a real fork grows. Merged into the trunk mesh — zero draws.
  function pushKnot(m, r) {
    const knot = new THREE.DodecahedronGeometry(r, 0);
    knot.applyMatrix4(m);
    wood.push(knot);
  }

  function grow(m, len, rad, level) {
    let tip;
    if (level === 0) {
      // root flare: a short stub whose bottom stop is markedly wider than the
      // trunk above it, tapering back to the ordinary trunk radius before the
      // normal taper (rad -> rad*0.68) takes over — old-tree buttressing, not
      // a cone for the whole bole.
      const flareLen = len * 0.2;
      pushSeg(m, flareLen, rad, rad * 2.15);
      const aboveFlare = m.clone().multiply(T(0, flareLen, 0));
      pushSeg(aboveFlare, len - flareLen, rad * 0.68, rad);
      tip = m.clone().multiply(T(0, len, 0));
    } else if (level >= 2) {
      // limbs this far out sag under their own ink: two segments meeting at a
      // joint, the second drooping and curving away rather than continuing
      // the first segment's line straight to the tip
      const half = len / 2;
      pushSeg(m, half, rad * 0.82, rad);
      const joint = m.clone().multiply(T(0, half, 0));
      const droop = 0.12 + 0.14 * droopRnd() + (level - 2) * 0.05;
      const curve = (droopRnd() - 0.5) * 0.4;
      const bent = joint.clone().multiply(RY(curve)).multiply(RZ(droop));
      pushKnot(joint, rad * 0.81);      // cover the sag's elbow (trimmed 5% — proud knots read as galls, Frank)
      pushSeg(bent, half, rad * 0.68, rad * 0.82);
      tip = bent.clone().multiply(T(0, half, 0));
    } else {
      pushSeg(m, len, rad * 0.68, rad);
      tip = m.clone().multiply(T(0, len, 0));
    }

    if (level >= depth) {
      // a broken crown, not a lollipop: 2-3 smaller, flattened blobs offset
      // around the tip with seeded overlap — some touch, some don't, so sky
      // shows through the gaps between them rather than one solid mass
      const n = rnd() > 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const r = height * (0.075 + 0.05 * rnd());
        const blob = new THREE.DodecahedronGeometry(r, 0);
        blob.scale(1, 0.7 + 0.16 * rnd(), 1);   // squash: crowns spread wider than they are tall
        // offset scales with the blob's OWN radius, not a flat tree-wide
        // constant, so the cluster stays compact (partial overlap -> gaps)
        // without inflating the tree's overall footprint at every height
        const spread = r * 0.55;
        blob.translate(
          (rnd() - 0.5) * spread * 2,
          (rnd() - 0.5) * spread * 1.1 + r * 0.2,
          (rnd() - 0.5) * spread * 2,
        );
        blob.applyMatrix4(tip);
        leaves.push(blob);
      }
      return;
    }

    const kids = rnd() > 0.45 ? 3 : 2;
    pushKnot(tip, rad * 0.68);          // cover the fork where the children lean away (trimmed 5%, same reason)
    for (let i = 0; i < kids; i++) {
      const azimuth = (i / kids) * Math.PI * 2 + rnd() * 1.1;
      const spread = 0.34 + 0.34 * rnd();  // lean away from the parent limb
      const child = tip.clone().multiply(RY(azimuth)).multiply(RZ(spread));
      grow(child, len * (0.64 + 0.14 * rnd()), rad * 0.66, level + 1);
    }
  }

  grow(new THREE.Matrix4(), height * 0.36, height * 0.045, 0);

  const trunk = new THREE.Mesh(mergeSimple(wood), toonMaterial({ color: trunkColor, flat: true }));
  trunk.name = 'trunk';
  const canopy = new THREE.Mesh(mergeSimple(leaves), toonMaterial({ color: canopyColor, flat: true }));
  canopy.name = 'canopy';
  g.add(trunk, canopy);
  return g;
}
