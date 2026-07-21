import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { GRAY_DARK, WASH } from '../palette.js';

// THE oak — the one Joshu points at when he is asked why Bodhidharma came
// (case 38). Built the same cheap way as makeTree (every limb merged into one
// mesh, all the foliage into another, so it is two draw calls no matter how
// many branches) but it is deliberately a different animal.
//
// A scatter tree is slender and vertical. This one is short in the bole, throws
// four heavy primaries almost sideways, and carries a domed crown WIDER than the
// tree is tall. It has to read as "that one" from across the meadow before
// anyone reads a word of the case.
//
// makeTree cannot be talked into this silhouette — its bole radius, limb spread
// and crown size are all fixed fractions of `height` with no way in — so the
// shape is authored here. tree.js is left alone.
//
// Trunk and canopy are separate meshes on purpose: case 38 wants the leaves red
// and the wood on the same grey ramp as every other tree in the book.
export function makeOak({
  height = 5.8,
  seed = 38,
  trunkColor = GRAY_DARK,
  canopyColor = WASH.deep,
  lobes = 16,
} = {}) {
  const g = new THREE.Group();
  g.name = 'oak';
  const H = height;

  const wood = [];
  const leaves = [];
  const anchors = [];
  let draw = 0;
  const rnd = () => hash1(draw++, seed);   // one deterministic stream for the whole tree

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

  function grow(m, len, rad, level) {
    const seg = new THREE.CylinderGeometry(rad * 0.64, rad, len, 6);
    seg.translate(0, len / 2, 0);           // grow upward from the joint
    seg.applyMatrix4(m);
    wood.push(seg);

    const tip = m.clone().multiply(T(0, len, 0));
    if (level >= DEPTH) {
      // a clump at every limb tip: this is what stitches the crown onto the wood
      // and what keeps its outline ragged instead of a ball
      _v.setFromMatrixPosition(tip);
      addLobe(_v.x, _v.y, _v.z, H * (0.10 + 0.05 * rnd()));
      return;
    }

    const kids = level === 0 ? 4 : (rnd() > 0.5 ? 3 : 2);
    for (let i = 0; i < kids; i++) {
      const azimuth = (i / kids) * Math.PI * 2 + rnd() * 0.9;
      // the primaries leave the bole at 50-64 degrees off vertical — that near
      // horizontal reach is the whole difference between an oak and a sapling.
      // The forks above them turn back up toward the light.
      const spread = level === 0 ? 0.88 + 0.24 * rnd() : 0.30 + 0.42 * rnd();
      const child = tip.clone().multiply(RY(azimuth)).multiply(RZ(spread));
      const scale = level === 0 ? 1.30 : 0.52;
      grow(child, len * scale * (0.86 + 0.28 * rnd()), rad * 0.58, level + 1);
    }
  }

  // the root flare: an oak is fattest where it meets the ground. Lifted so it
  // rests ON y=0 rather than half-sunk — every kit prop is authored to stand on
  // the ground plane, and the ground rolls underneath it.
  const flare = new THREE.DodecahedronGeometry(BOLE_R * 1.55, 0);
  flare.scale(1, 0.40, 1);
  flare.computeBoundingBox();
  flare.translate(0, -flare.boundingBox.min.y, 0);
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

  const trunk = new THREE.Mesh(mergeSimple(wood), toonMaterial({ color: trunkColor, flat: true }));
  trunk.name = 'trunk';
  const canopy = new THREE.Mesh(mergeSimple(leaves), toonMaterial({ color: canopyColor, flat: true }));
  canopy.name = 'canopy';
  g.add(trunk, canopy);

  // Where a leaf can let go: the underside of each clump, in the oak's LOCAL
  // space. Sorted outward, because a leaf released from the fringe falls in
  // clear air and one released from the middle falls through the mass unseen.
  anchors.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  g.canopyPoints = anchors;
  return g;
}
