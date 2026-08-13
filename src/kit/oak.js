import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { GRAY_DARK, WASH } from '../palette.js';

// THE oak — the one Joshu points at when he is asked why Bodhidharma came
// (case 38), and the one Kyogen hangs from by his teeth (case 5: k5.js hangs
// makeHangingMonk from ITS OWN hand-authored branch mesh, not from anything
// read off this builder — the contract with k5 is purely visual: at
// height 5.0 / seed 13 / yaw 4.9, the crown this file grows must stay clear
// of the fixed world-space swing column k5.js hangs him on. See
// tests/k5.test.js's canopy-clearance assertion, which is the actual gate —
// pass that and the branch reads as buried in the tree without ever
// touching the man. Built the same cheap way as makeTree (every limb merged
// into one mesh, all the foliage into another, so it is two draw calls no
// matter how many branches) but it is deliberately a different animal.
//
// A scatter tree is slender and vertical. This one is short in the bole,
// throws four heavy, knotty primaries — one of them a near-horizontal hero
// limb, a low bough that elbows out of the crown — and carries a domed crown
// WIDER than the tree is tall. It has to read as "that one" from across the
// meadow before anyone reads a word of the case.
//
// The hero limb is MODERATED by default (overnight pass 2, Frank: "that
// weird extra branch... an extra long branch for some reason"): it finishes
// at the crown's fringe as a shoulder in the mass, not a spear past it.
// `reach: 1` restores the full reaching limb for a scene that stages
// something on it — the workbench and showcase hang the case-5 monk from
// canopyPoints[0] (the sorted-outward anchor list, so the fringe anchor is
// always first whichever lobe is outermost). The option only stretches the
// hero limb's own segments: the deterministic stream is consumed in the same
// order at any reach, so every other limb and every crown lobe of a given
// seed stays exactly where it was.
//
// makeTree cannot be talked into this silhouette — its bole radius, limb spread
// and crown size are all fixed fractions of `height` with no way in — so the
// shape is authored here. tree.js is left alone. Fork angles here run wider
// than tree.js's (a sapling's forks lean 19-39 degrees off their parent; an
// oak's lean 55-98) and limb radius falls off more slowly generation to
// generation (0.66-0.80 here vs tree.js's 0.66-0.68), so a cut branch reads
// thick and old rather than twiggy.
//
// Trunk and canopy are separate meshes on purpose: case 38 wants the leaves red
// and the wood on the same grey ramp as every other tree in the book.
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

  const wood = [];
  const leaves = [];
  const anchors = [];
  let draw = 0;
  const rnd = () => hash1(draw++, seed);   // one deterministic stream for the whole tree
  // hero-limb constants, lerped tamed -> legacy by `reach`. Every branch of
  // this lerp consumes rnd() identically, so reach moves ONLY the hero limb.
  const R = (tame, legacy) => tame + (legacy - tame) * reach;

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const _v = new THREE.Vector3();

  const BOLE_LEN = 0.30 * H;    // short: the crown starts low, the way old oaks do
  const BOLE_R = 0.085 * H;     // and thick — nearly twice makeTree's, relatively
  const DEPTH = 2;              // bole -> primaries -> secondaries -> foliage

  // one clump of leaves, and the spot underneath it a leaf can let go from
  function addLobe(x, y, z, r) {
    const blob = new THREE.DodecahedronGeometry(r, 0);
    blob.scale(1.08, 0.80, 1.08);   // squashed: crowns spread wider than they are tall
    blob.translate(x, y, z);
    leaves.push(blob);
    anchors.push(new THREE.Vector3(x, y - r * 0.62, z));
  }

  // a small knuckle where two segments meet: reads as a knot/burl and hides
  // the radius step where a heavier-falloff child meets its parent's tip
  function addKnuckle(m, r) {
    const knot = new THREE.DodecahedronGeometry(r, 0);
    knot.applyMatrix4(m);
    wood.push(knot);
  }

  function grow(m, len, rad, level, hero) {
    const seg = new THREE.CylinderGeometry(rad * 0.64, rad, len, 6);
    seg.translate(0, len / 2, 0);           // grow upward from the joint
    seg.applyMatrix4(m);
    wood.push(seg);

    const tip = m.clone().multiply(T(0, len, 0));
    if (level >= DEPTH) {
      // a clump at every limb tip: this is what stitches the crown onto the wood
      // and what keeps its outline ragged instead of a ball. The tamed hero
      // limb takes a crown-sized clump — its tip sits at the skirt, and a
      // small ball there reads as a lollipop on a stick, not a low bough
      // shoulder. At full reach the legacy small clump returns: out past the
      // crown, small is what keeps the limb readable as wood with leaves.
      _v.setFromMatrixPosition(tip);
      addLobe(_v.x, _v.y, _v.z, H * ((hero ? R(0.14, 0.10) : 0.10) + 0.05 * rnd()));
      return;
    }

    if (hero) {
      // THE hero branch: one continuous reach, not a fork. A second segment
      // in almost the same direction as the first — composing the same-axis
      // tilt additively (RZ(a)*RZ(b) = RZ(a+b)) is what turns a primary that
      // left the bole climbing into a limb that finishes near-horizontal,
      // the way a real low bough elbows out from an upward start. The tiny
      // extra droop (rather than a sharp new angle) is the clean underside
      // line: one smooth concave curve a body could actually hang from,
      // not a knee.
      addKnuckle(tip, rad * 0.72);
      const droop = 0.38 + 0.12 * rnd();
      const wobble = (rnd() - 0.5) * 0.10;
      const child = tip.clone().multiply(RY(wobble)).multiply(RZ(droop));
      grow(child, len * (R(0.34, 0.56) + R(0.10, 0.16) * rnd()), rad * 0.80, level + 1, true);
      return;
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
      // Tamed, the hero primary is only a touch longer than its siblings
      // (1.24 vs 1.18) — its character is the horizontal elbow, not raw
      // length. At reach 1 it grows the legacy 1.62-1.80 spear again.
      const scale = isHero ? R(1.24, 1.62) + R(0.10, 0.18) * rnd() : level === 0 ? 1.18 : 0.42;
      const fall = isHero ? 0.80 : level === 0 ? 0.66 : 0.66;
      if (level === 0) addKnuckle(tip, rad * 0.62);
      grow(child, len * scale * (0.86 + 0.28 * rnd()), rad * fall, level + 1, isHero);
    }
  }

  // the root flare: an oak is fattest where it meets the ground. It used to
  // be a squashed dodecahedron ball resting at the foot, which read as
  // "kinda like a rock at its base" (Frank) — a boulder beside the trunk,
  // not the trunk itself. A short tapered collar instead: same width at the
  // ground, but it runs INTO the bole so the flare is the trunk widening.
  const flare = new THREE.CylinderGeometry(BOLE_R * 1.02, BOLE_R * 1.5, 0.07 * H, 6);
  flare.translate(0, 0.035 * H, 0);
  wood.push(flare);

  grow(new THREE.Matrix4(), BOLE_LEN, BOLE_R, 0);

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

  const trunk = new THREE.Mesh(mergeSimple(wood), washMaterial({ color: trunkColor, flat: true }));
  trunk.name = 'trunk';
  const canopy = new THREE.Mesh(mergeSimple(leaves), washMaterial({ color: canopyColor, flat: true }));
  canopy.name = 'canopy';
  g.add(trunk, canopy);

  // Where a leaf can let go: the underside of each clump, in the oak's LOCAL
  // space. Sorted outward, because a leaf released from the fringe falls in
  // clear air and one released from the middle falls through the mass unseen.
  anchors.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  g.canopyPoints = anchors;
  return g;
}
