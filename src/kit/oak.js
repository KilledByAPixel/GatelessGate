import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { applyFoliageWind } from './foliage.js';
import { clothe, flarePoints } from './limbs.js';
import { GRAY_DARK, WASH } from '../palette.js';

// THE oak — the one Joshu points at when he is asked why Bodhidharma came
// (case 38), and the one Kyogen hangs from by his teeth (case 5: k5.js hangs
// makeHangingMonk from ITS OWN hand-authored branch mesh, not from anything
// read off this builder — the contract with k5 is purely visual: at
// height 5.0 / seed 13 / yaw 4.9, the crown this file grows must stay clear
// of the fixed world-space swing column k5.js hangs him on. See
// tests/k5.test.js's canopy-clearance assertion, which is the actual gate —
// pass that and the branch reads as buried in the tree without ever
// touching the man. Built the same cheap way as makeTree (the limbs skinned
// into one mesh by the same builder, kit/limbs.js, and all the foliage merged
// into another, so it is two draw calls no matter how many branches) but it is
// deliberately a different animal.
//
// A scatter tree is slender and vertical. This one is short in the bole,
// throws four heavy primaries — one of them a near-horizontal hero
// limb, a low bough that elbows out of the crown — and carries a domed crown
// WIDER than the tree is tall. It has to read as "that one" from across the
// meadow before anyone reads a word of the case.
//
// The hero limb is MODERATED by default — unmoderated it read as one odd
// extra-long branch sticking out of the crown. It finishes at the crown's
// fringe as a shoulder in the mass, not a spear past it. `reach: 1` restores
// the full reaching limb for a scene that stages something on it — the
// workbench and showcase hang the case-5 monk from canopyPoints[0] (the
// sorted-outward anchor list, so the fringe anchor is always first whichever
// lobe is outermost). The option only stretches the hero limb's own segments:
// the deterministic stream is consumed in the same order at any reach, so every
// other limb and every crown lobe of a given seed stays exactly where it was.
//
// makeTree cannot be talked into this silhouette — its bole radius, limb spread
// and crown size are all fixed fractions of `height` with no way in — so the
// shape is authored here and tree.js is left alone. Fork angles here run much
// wider than a sapling's, the bole keeps its girth to the top, and a limb
// tapers more slowly along its length, so the wood reads thick and old rather
// than twiggy.
//
// Trunk and canopy are separate meshes on purpose: case 38 wants the leaves red
// and the wood on the same grey ramp as every other tree in the book.

// What the wood is made of — `clothe` in limbs.js says what each one means.
const SIDES = 6;
const BOLE_TIP = 0.8;
const HERO_TIP = 0.8;
const LIMB_TIP = 0.7;
const LATERAL = 0.66;
// The foot: how far up the widening runs, as a share of the tree's height, and
// how much wider than the bole the ground ring is, in bole radii.
const FLARE_TOP = 0.12;
const FLARE_SPREAD = 0.5;
export function makeOak({
  height = 5.8,
  seed = 38,
  trunkColor = GRAY_DARK,
  canopyColor = WASH.deep,
  lobes = 16,
  // 0 (default): the hero limb finishes at the crown fringe — a low bough's
  // shoulder, not a spear. 1: the legacy full reach, for a scene that hangs
  // something from the limb. Values between interpolate. Additive: existing
  // callers get the tamed tree without changing a line.
  reach = 0,
} = {}) {
  const g = new THREE.Group();
  g.name = 'oak';
  const H = height;

  const leaves = [];
  const anchors = [];
  // Per-lobe wind attributes, one entry per pushed leaf geometry, in push order
  // — mergeSimple spreads them across each lobe's vertices. The canopy was the
  // last foliage in the book with none, and stood visibly still while every
  // other tree moved. The WOOD stays inert on purpose: an old oak's limbs are
  // heavy, and the branching profile in kit/foliage.js would carry canopy-scale
  // motion down limbs thick enough to make the whole tree bow — the exact read
  // the wind system was built to avoid. Leaves shiver; the oak stands.
  const leafSway = [], leafPhase = [];
  let maxLobeRun = 1e-6;
  let draw = 0;
  const rnd = () => hash1(draw++, seed);   // one deterministic stream for the whole tree
  // The phases draw from their OWN seeded stream (tree.js's third-stream
  // lesson, learned when phase jitter on `rnd` silently rebuilt every tree in
  // the book): wind is decoration, and it must not be able to move a branch —
  // or shift k5's scanned crown-clearance by one draw.
  let phaseDraw = 0;
  const phaseRnd = () => hash1(phaseDraw++, seed * 7919 + 31);
  // hero-limb constants, lerped tamed -> legacy by `reach`. Every branch of
  // this lerp consumes rnd() identically, so reach moves ONLY the hero limb.
  const R = (tame, legacy) => tame + (legacy - tame) * reach;

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);

  const BOLE_LEN = 0.30 * H;    // short: the crown starts low, the way old oaks do
  const BOLE_R = 0.085 * H;     // and thick — nearly twice makeTree's, relatively
  const DEPTH = 2;              // bole -> primaries -> secondaries -> foliage

  // one clump of leaves, and the spot underneath it a leaf can let go from
  function addLobe(x, y, z, r) {
    const blob = new THREE.DodecahedronGeometry(r, 0);
    blob.scale(1.08, 0.80, 1.08);   // squashed: crowns spread wider than they are tall
    blob.translate(x, y, z);
    leaves.push(blob);
    // The lobe's wind weight is its distance from the foot — the oak has no
    // per-branch run to accumulate (the crown is authored on a shell, not
    // grown), and distance-out is what run was measuring anyway: the fringe
    // moves most, the lobes buried against the bole barely stir. Normalised
    // against the furthest lobe once the crown is complete, tree.js's rule.
    leafSway.push(Math.hypot(x, y, z));
    leafPhase.push(phaseRnd() * 4);
    maxLobeRun = Math.max(maxLobeRun, Math.hypot(x, y, z));
    anchors.push(new THREE.Vector3(x, y - r * 0.62, z));
  }

  const at = (m) => new THREE.Vector3().setFromMatrixPosition(m);

  // THE SKELETON, and the only thing here that draws from the seed: where each
  // limb starts (S) and ends (E) and what forks from its tip. How thick the
  // wood is and how it is joined is `clothe`'s business (kit/limbs.js), so the
  // crown — and with it k5's scanned clearance — sits where the seed puts it
  // however the limbs are skinned.
  function grow(m, len, level, hero) {
    const node = { S: at(m), E: null, len, level, hero: !!hero, kids: [] };
    const tip = m.clone().multiply(T(0, len, 0));   // grow upward from the joint
    node.E = at(tip);
    if (level >= DEPTH) {
      // a clump at every limb tip: this is what stitches the crown onto the wood
      // and what keeps its outline ragged instead of a ball. The tamed hero
      // limb takes a crown-sized clump — its tip sits at the skirt, and a
      // small ball there reads as a lollipop on a stick, not a low bough
      // shoulder. At full reach the legacy small clump returns: out past the
      // crown, small is what keeps the limb readable as wood with leaves.
      addLobe(node.E.x, node.E.y, node.E.z, H * ((hero ? R(0.14, 0.10) : 0.10) + 0.05 * rnd()));
      return node;
    }

    if (hero) {
      // THE hero branch: one continuous reach, not a fork. A second stretch
      // in almost the same direction as the first — composing the same-axis
      // tilt additively (RZ(a)*RZ(b) = RZ(a+b)) is what turns a primary that
      // left the bole climbing into a limb that finishes near-horizontal,
      // the way a real low bough elbows out from an upward start. The tiny
      // extra droop (rather than a sharp new angle) is the clean underside
      // line: one smooth concave curve a body could actually hang from,
      // not a knee. Its one child is its leader, so the two stretches are
      // skinned as a single tube bent round the elbow.
      const droop = 0.38 + 0.12 * rnd();
      const wobble = (rnd() - 0.5) * 0.10;
      const child = tip.clone().multiply(RY(wobble)).multiply(RZ(droop));
      node.kids.push(grow(child, len * (R(0.34, 0.56) + R(0.10, 0.16) * rnd()), level + 1, true));
      return node;
    }

    const kids = level === 0 ? 4 : (rnd() > 0.5 ? 3 : 2);
    for (let i = 0; i < kids; i++) {
      const isHero = level === 0 && i === 0;
      const azimuth = (i / kids) * Math.PI * 2 + rnd() * 0.9;
      // Regular primaries leave the bole at 50-64 degrees off vertical — wide
      // against tree.js's forks (19-39) — and secondaries fork a touch wider
      // than before (19-44 vs 17-41). The hero primary climbs at much the
      // same angle as its siblings (it only turns horizontal at its own
      // elbow, above) so its base reads as one more thick limb leaving the
      // trunk, not a break in the tree's logic.
      const spread = isHero ? 0.95 + 0.24 * rnd()
        : level === 0 ? 0.88 + 0.24 * rnd() : 0.32 + 0.46 * rnd();
      const child = tip.clone().multiply(RY(azimuth)).multiply(RZ(spread));
      // Tamed, the hero primary is only a touch longer than its siblings — its
      // character is the horizontal elbow, not raw length. At reach 1 it grows
      // the full reaching spear again.
      const scale = isHero ? R(1.24, 1.62) + R(0.10, 0.18) * rnd() : level === 0 ? 1.18 : 0.42;
      node.kids.push(grow(child, len * scale * (0.86 + 0.28 * rnd()), level + 1, isHero));
    }
    return node;
  }

  const root = grow(new THREE.Matrix4(), BOLE_LEN, 0);

  // The root flare: an oak is fattest where it meets the ground. It has been a
  // squashed ball at the foot (a boulder beside the trunk) and then a tapered
  // collar around it, whose top edge stood out from the bole as a step. It is
  // the bole itself now — the same tube, widening over its last few rings.
  const bole = (y) => BOLE_R * (1 - (1 - BOLE_TIP) * y / BOLE_LEN);
  const flareTop = FLARE_TOP * H;
  const wood = clothe(root, flarePoints({ top: flareTop, spread: BOLE_R * FLARE_SPREAD, radiusAt: bole }), {
    sides: SIDES,
    baseR: BOLE_R,
    // The bole keeps most of its girth to the top, because four heavy
    // primaries have to be rooted inside it; the hero's first stretch tapers
    // least of the limbs, which is all that marks it as the heavy bough.
    taper: (n) => (n.level === 0 ? BOLE_TIP : n.hero && n.level === 1 ? HERO_TIP : LIMB_TIP),
    lateral: LATERAL,
    // The primaries all leave at better than fifty degrees, so the bole has no
    // leader: it ends under the crown and all four are rooted in its head.
    leads: (n) => n.level > 0,
    extra: { flareTop },
  });

  // The crown proper. Limb tips alone leave a spindly, gappy top; an oak reads
  // as ONE heavy mass with the branches disappearing into it. So the mass is
  // authored on an ellipsoid shell and the limbs are simply left to poke in.
  const CROWN_Y = 0.655 * H;   // set so the top of the mass lands at ~height
  const CROWN_RX = 0.40 * H;
  const CROWN_RY = 0.19 * H;
  const GOLD = Math.PI * (3 - Math.sqrt(5));   // a spiral, so no two lobes stack up
  for (let i = 0; i < lobes; i++) {
    const u = (i + 0.5) / lobes;                                   // skirt -> apex
    const elev = (-0.30 + 1.30 * u) * (Math.PI / 2) + (rnd() - 0.5) * 0.22;
    const az = i * GOLD + (rnd() - 0.5) * 0.5;
    const rad = CROWN_RX * Math.cos(elev) * (0.74 + 0.36 * rnd());
    addLobe(
      Math.cos(az) * rad,
      CROWN_Y + CROWN_RY * Math.sin(elev),
      Math.sin(az) * rad,
      H * (0.135 + 0.055 * rnd()),
    );
  }

  const trunk = new THREE.Mesh(wood.geometry, washMaterial({ color: trunkColor, flat: true }));
  trunk.name = 'trunk';
  // aColumn 0: a broadleaf is not a mast (see the two profiles in
  // kit/foliage.js). aLeaf 1 on every lobe — the flutter is the whole point
  // here; the branch-lean share is small at these sway weights, so the crown
  // shivers where it stands rather than sliding off the wood beneath it.
  const canopy = new THREE.Mesh(
    mergeSimple(leaves, {
      aSway: leafSway.map((v) => Math.min(1, v / maxLobeRun)),
      aPhase: leafPhase,
      aLeaf: new Array(leaves.length).fill(1),
      aColumn: new Array(leaves.length).fill(0),
    }),
    applyFoliageWind(washMaterial({ color: canopyColor, flat: true })));
  canopy.name = 'canopy';
  canopy.userData.foliageWind = true;   // carries wind attributes — keeps bakeStatic off it
  g.add(trunk, canopy);

  // Where a leaf can let go: the underside of each clump, in the oak's LOCAL
  // space. Sorted outward, because a leaf released from the fringe falls in
  // clear air and one released from the middle falls through the mass unseen.
  anchors.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  g.canopyPoints = anchors;
  // One record per limb — how each is joined to the one it grows out of, as
  // skinned (see limbs.js). Data only.
  g.userData.limbs = wood.records;
  return g;
}
