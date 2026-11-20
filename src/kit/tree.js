import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { applyFoliageWind } from './foliage.js';
import { clothe, flarePoints } from './limbs.js';
import { GRAY_DARK, WASH } from '../palette.js';

// A deciduous ink tree grown recursively: the trunk forks into limbs, those
// fork again, and foliage sits at the branch tips. The whole skeleton is
// skinned into ONE mesh and all the foliage merged into another, so a tree with
// a couple of dozen limbs and as many leaf clusters still costs two draw calls.
//
// IT IS BUILT IN TWO PASSES, and the split is the point. `grow` lays down the
// SKELETON — where every fork is, how each limb leans, where the leaves sit —
// and is the only thing that draws from the seed. `clothe` (kit/limbs.js, the
// limb builder every broadleaf shares) then decides how that skeleton is
// skinned: which child at a fork carries its parent on, how thick each limb
// is, where a lateral is rooted. So the wood can be reworked without moving a
// single leaf, and a crown a case was composed around stays where it was.
//
// Everything derives from hash1(seed), so a given seed always grows the same tree.

// What the limbs are made of — `clothe` in limbs.js says what each one means.
const SIDES = 6;
const TIP = 0.72;
const LATERAL = 0.66;
// The foot: how far up the bole the widening runs, as a share of the bole, and
// how much wider than the bole the ground ring is, in bole radii.
const FLARE_TOP = 0.28;
const FLARE_SPREAD = 0.95;

export function makeTree({
  height = 3.2, seed = 2, trunkColor = GRAY_DARK, canopyColor = WASH.deep, depth = 3,
} = {}) {
  const g = new THREE.Group();
  g.name = 'tree';

  const leaves = [];
  // Per-part wind attributes, one entry per pushed leaf geometry, in push order
  // — mergeSimple spreads them across each part's vertices (see kit/foliage.js
  // for what they mean and why they are baked rather than animated on the CPU).
  // The wood carries the same two numbers PER VERTEX, straight off the skin.
  // `run` is cumulative distance from the trunk's foot along the branch path,
  // normalised at the end: that is what carries the hierarchy, so it has to be
  // accumulated DOWN the recursion rather than derived from `level` afterwards.
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
  // k37's "an oak is broader than the scatter trees" test caught it, which is
  // the only reason it was noticed at all. Wind is decoration; it must not be
  // able to move a branch.
  let phaseDraw = 0;
  const phaseRnd = () => hash1(phaseDraw++, seed * 7919 + 31);

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const at = (m) => new THREE.Vector3().setFromMatrixPosition(m);

  // THE SKELETON. `run` in, cumulative path length at this limb's base; `phase`
  // its own wind offset, derived from the parent's so a limb lags the one it
  // grows out of rather than drawing an unrelated number — the lag IS the
  // hierarchy reading as a hierarchy instead of as confetti. Returns the node:
  // where the limb starts (S), its elbow if it has one (J), its tip (E).
  function grow(m, len, level, run = 0, phase = 0) {
    const node = { S: at(m), J: null, E: null, len, level, run, phase, kids: [] };
    let tip;
    if (level >= 2) {
      // limbs this far out sag under their own ink: two stretches meeting at an
      // elbow, the second drooping and curving away rather than continuing the
      // first one's line straight to the tip
      const half = len / 2;
      const joint = m.clone().multiply(T(0, half, 0));
      const droop = 0.12 + 0.14 * droopRnd() + (level - 2) * 0.05;
      const curve = (droopRnd() - 0.5) * 0.4;
      const bent = joint.clone().multiply(RY(curve)).multiply(RZ(droop));
      node.J = at(joint);
      tip = bent.clone().multiply(T(0, half, 0));
    } else {
      tip = m.clone().multiply(T(0, len, 0));
    }
    node.E = at(tip);
    const tipRun = run + len;
    maxRun = Math.max(maxRun, tipRun);

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
      return node;
    }

    const kids = rnd() > 0.45 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const azimuth = (i / kids) * Math.PI * 2 + rnd() * 1.1;
      const spread = 0.34 + 0.34 * rnd();  // lean away from the parent limb
      const child = tip.clone().multiply(RY(azimuth)).multiply(RZ(spread));
      // the child lags its parent by a fixed step plus a seeded jitter: a
      // constant step alone made every third-level limb share one phase
      node.kids.push(grow(child, len * (0.64 + 0.14 * rnd()), level + 1,
        tipRun, phase + 1.1 + phaseRnd() * 1.4));
    }
    return node;
  }

  const rad = height * 0.045;
  const root = grow(new THREE.Matrix4(), height * 0.36, 0);
  // The foot is pinned: every ring of the flare carries a run of exactly zero,
  // and the run only starts counting above it. A flare with any weight at all
  // is invisible in motion, but it makes the claim "the foot does not move"
  // false, and this is the one part of the tree where that claim is the point.
  const flareTop = root.len * FLARE_TOP;
  const foot = flarePoints({
    top: flareTop, spread: rad * FLARE_SPREAD,
    radiusAt: (y) => rad * (1 - (1 - TIP) * y / root.len),
  }).map((pt) => ({ ...pt, run: 0 }));
  const wood = clothe(root, foot, {
    sides: SIDES, baseR: rad, taper: () => TIP, lateral: LATERAL, extra: { flareTop },
  });

  // Normalise the runs to 0..1 only now — the deepest limb is not known until
  // the whole recursion has finished, and a weight scaled against anything else
  // (a guess, the height) would make short and tall trees answer the wind
  // differently for no reason a viewer could name.
  const norm = (a) => a.map((v) => Math.min(1, Math.max(0, v) / maxRun));
  const zeros = (n) => new Array(n).fill(0);
  const ones = (n) => new Array(n).fill(1);

  // aColumn 0 throughout: a broadleaf is NOT a mast. Its limbs genuinely do
  // move against each other, so it wants the branching model — see the two
  // profiles in kit/foliage.js, and pine.js for the tree that wanted the other
  // one. The attribute still has to be present on both meshes; a geometry
  // missing it would read whatever the driver last left bound.
  const per = (a) => new THREE.BufferAttribute(new Float32Array(a), 1);
  wood.geometry.setAttribute('aSway', per(norm(wood.run)));
  wood.geometry.setAttribute('aPhase', per(wood.phase));
  wood.geometry.setAttribute('aLeaf', per(zeros(wood.run.length)));
  wood.geometry.setAttribute('aColumn', per(zeros(wood.run.length)));
  const trunk = new THREE.Mesh(wood.geometry,
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
  // One record per limb — how each is joined to the one it grows out of, as
  // skinned (see limbs.js). Data only.
  g.userData.limbs = wood.records;
  return g;
}
