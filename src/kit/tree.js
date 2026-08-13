import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { applyFoliageWind } from './foliage.js';
import { GRAY_DARK, WASH } from '../palette.js';

// A deciduous ink tree grown recursively: the trunk forks into limbs, those
// fork again, and foliage sits at the branch tips. The whole skeleton is merged
// into ONE mesh and all the foliage into another, so a tree with ~25 limbs and
// ~15 leaf clusters still costs two draw calls — the same as the old
// five-blob version it replaces.
//
// Everything derives from hash1(seed), so a given seed always grows the same tree.
export function makeTree({
  height = 3.2, seed = 2, trunkColor = GRAY_DARK, canopyColor = WASH.deep, depth = 3,
} = {}) {
  const g = new THREE.Group();
  g.name = 'tree';

  const wood = [];
  const leaves = [];
  // Per-part wind attributes, one entry per pushed geometry, in push order —
  // mergeSimple spreads them across each part's vertices (see kit/foliage.js for
  // what they mean and why they are baked rather than animated on the CPU).
  // `run` is cumulative distance from the trunk's foot along the branch path,
  // normalised at the end: that is what carries the hierarchy, so it has to be
  // accumulated DOWN the recursion rather than derived from `level` afterwards.
  const woodSway = [], woodPhase = [];
  const leafSway = [], leafPhase = [];
  let maxRun = 1e-6;
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
  // A THIRD stream, for the wind phases, and for exactly the reason the second
  // one exists. Drawing the phase jitter from `rnd` shifted every fork count
  // and spread angle after it and silently rebuilt every tree in the book —
  // k38's "an oak is broader than the scatter trees" test caught it, which is
  // the only reason it was noticed at all. Wind is decoration; it must not be
  // able to move a branch.
  let phaseDraw = 0;
  const phaseRnd = () => hash1(phaseDraw++, seed * 7919 + 31);

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);

  // pushes one tapered cylinder growing up from the joint at m into the shared
  // wood[] merge list — every branch segment, at any level, goes through this.
  // `run` is the cumulative path length at the segment's FAR end; a segment
  // takes the mean of its two ends so a long limb does not snap stiffness at
  // its joints.
  function pushSeg(m, len, radTop, radBottom, run = 0, phase = 0) {
    const seg = new THREE.CylinderGeometry(radTop, radBottom, len, 5);
    seg.translate(0, len / 2, 0);
    seg.applyMatrix4(m);
    wood.push(seg);
    woodSway.push(Math.max(0, run - len / 2));
    woodPhase.push(phase);
    maxRun = Math.max(maxRun, run);
  }

  // a joint ball where two segments meet at an angle: cylinders touching
  // edge-to-edge open a wedge of daylight at every node, and a knot there both
  // closes it and reads as the burl a real fork grows. Merged into the trunk
  // mesh — zero draws.
  function pushKnot(m, r, run = 0, phase = 0) {
    const knot = new THREE.DodecahedronGeometry(r, 0);
    knot.applyMatrix4(m);
    wood.push(knot);
    woodSway.push(run);
    woodPhase.push(phase);
  }

  // `run` in, cumulative path length at this limb's base; `phase` its own wind
  // offset, derived from the parent's so a limb lags the one it grows out of
  // rather than drawing an unrelated number — the lag IS the hierarchy reading
  // as a hierarchy instead of as confetti.
  function grow(m, len, rad, level, run = 0, phase = 0) {
    let tip;
    if (level === 0) {
      // root flare: a short stub whose bottom stop is markedly wider than the
      // trunk above it, tapering back to the ordinary trunk radius before the
      // normal taper (rad -> rad*0.68) takes over — old-tree buttressing, not
      // a cone for the whole bole.
      const flareLen = len * 0.2;
      // The buttress is pinned at exactly 0. A part carries ONE sway value, so
      // this segment would otherwise average its two ends and give the ground
      // flare a small non-zero weight — invisible in motion, but it makes the
      // claim "the foot does not move" false, and this is the one part of the
      // tree where that claim is the whole point.
      pushSeg(m, flareLen, rad, rad * 2.15, 0, phase);
      maxRun = Math.max(maxRun, run + flareLen);
      const aboveFlare = m.clone().multiply(T(0, flareLen, 0));
      pushSeg(aboveFlare, len - flareLen, rad * 0.68, rad, run + len, phase);
      tip = m.clone().multiply(T(0, len, 0));
    } else if (level >= 2) {
      // limbs this far out sag under their own ink: two segments meeting at a
      // joint, the second drooping and curving away rather than continuing
      // the first segment's line straight to the tip
      const half = len / 2;
      pushSeg(m, half, rad * 0.82, rad, run + half, phase);
      const joint = m.clone().multiply(T(0, half, 0));
      const droop = 0.12 + 0.14 * droopRnd() + (level - 2) * 0.05;
      const curve = (droopRnd() - 0.5) * 0.4;
      const bent = joint.clone().multiply(RY(curve)).multiply(RZ(droop));
      pushKnot(joint, rad * 0.81, run + half, phase);      // cover the sag's elbow (trimmed 5%: proud knots read as galls)
      pushSeg(bent, half, rad * 0.68, rad * 0.82, run + len, phase);
      tip = bent.clone().multiply(T(0, half, 0));
    } else {
      pushSeg(m, len, rad * 0.68, rad, run + len, phase);
      tip = m.clone().multiply(T(0, len, 0));
    }
    const tipRun = run + len;

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
        // A cluster sits at the very end of its branch, so it takes the tip's
        // run plus its own offset — the outermost thing on the tree, which is
        // what should move most. Its phase is the branch's, nudged per blob so
        // the two or three in one cluster shiver against each other instead of
        // as one lump.
        leafSway.push(tipRun + r);
        leafPhase.push(phase + i * 0.9 + phaseRnd() * 0.6);
        maxRun = Math.max(maxRun, tipRun + r);
      }
      return;
    }

    const kids = rnd() > 0.45 ? 3 : 2;
    pushKnot(tip, rad * 0.68, tipRun, phase);          // cover the fork where the children lean away (trimmed 5%, same reason)
    for (let i = 0; i < kids; i++) {
      const azimuth = (i / kids) * Math.PI * 2 + rnd() * 1.1;
      const spread = 0.34 + 0.34 * rnd();  // lean away from the parent limb
      const child = tip.clone().multiply(RY(azimuth)).multiply(RZ(spread));
      // the child lags its parent by a fixed step plus a seeded jitter: a
      // constant step alone made every third-level limb share one phase
      grow(child, len * (0.64 + 0.14 * rnd()), rad * 0.66, level + 1,
        tipRun, phase + 1.1 + phaseRnd() * 1.4);
    }
  }

  grow(new THREE.Matrix4(), height * 0.36, height * 0.045, 0);

  // Normalise the runs to 0..1 only now — the deepest limb is not known until
  // the whole recursion has finished, and a weight scaled against anything else
  // (a guess, the height) would make short and tall trees answer the wind
  // differently for no reason a viewer could name.
  const norm = (a) => a.map((v) => Math.min(1, v / maxRun));
  const zeros = (n) => new Array(n).fill(0);
  const ones = (n) => new Array(n).fill(1);

  // aColumn 0 throughout: a broadleaf is NOT a mast. Its limbs genuinely do
  // move against each other, so it wants the branching model — see the two
  // profiles in kit/foliage.js, and pine.js for the tree that wanted the other
  // one. The attribute still has to be present on both meshes; a geometry
  // missing it would read whatever the driver last left bound.
  const trunk = new THREE.Mesh(
    mergeSimple(wood, {
      aSway: norm(woodSway), aPhase: woodPhase,
      aLeaf: zeros(wood.length), aColumn: zeros(wood.length),
    }),
    applyFoliageWind(washMaterial({ color: trunkColor, flat: true })));
  trunk.name = 'trunk';
  trunk.userData.foliageWind = true;   // carries wind attributes — keeps bakeStatic off it
  const canopy = new THREE.Mesh(
    mergeSimple(leaves, {
      aSway: norm(leafSway), aPhase: leafPhase,
      aLeaf: ones(leaves.length), aColumn: zeros(leaves.length),
    }),
    applyFoliageWind(washMaterial({ color: canopyColor, flat: true })));
  canopy.name = 'canopy';
  canopy.userData.foliageWind = true;
  g.add(trunk, canopy);
  return g;
}
