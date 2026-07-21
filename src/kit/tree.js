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

  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const RY = (a) => new THREE.Matrix4().makeRotationY(a);
  const RZ = (a) => new THREE.Matrix4().makeRotationZ(a);

  function grow(m, len, rad, level) {
    const seg = new THREE.CylinderGeometry(rad * 0.68, rad, len, 5);
    seg.translate(0, len / 2, 0);          // grow upward from the joint
    seg.applyMatrix4(m);
    wood.push(seg);

    const tip = m.clone().multiply(T(0, len, 0));

    if (level >= depth) {
      const r = height * (0.115 + 0.055 * rnd());
      const blob = new THREE.DodecahedronGeometry(r, 0);
      blob.scale(1, 0.78, 1);              // squash: crowns spread wider than they are tall
      blob.applyMatrix4(tip);
      leaves.push(blob);
      return;
    }

    const kids = rnd() > 0.45 ? 3 : 2;
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
