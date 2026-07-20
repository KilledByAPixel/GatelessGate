import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';

// A conifer built from a bare trunk and a stack of tiered skirts that narrow
// toward the crown, each spun to its own angle so the silhouette is ragged
// rather than a single smooth cone.
//
// pineGeometry() returns ONE merged BufferGeometry so a whole stand can be
// drawn as a single InstancedMesh (see makeForest); makePine() wraps it in a
// mesh for the rare hero pine placed by hand.
export function pineGeometry({ height = 4, tiers = 5, seed = 3 } = {}) {
  const parts = [];

  const trunkH = height * 0.30;
  const trunk = new THREE.CylinderGeometry(height * 0.020, height * 0.034, trunkH, 5);
  trunk.translate(0, trunkH / 2, 0);
  parts.push(trunk);

  for (let i = 0; i < tiers; i++) {
    const f = tiers === 1 ? 0 : i / (tiers - 1);        // 0 at the lowest skirt, 1 at the crown
    const r = height * (0.30 - 0.23 * f) * (0.88 + 0.24 * hash1(i * 2 + 1, seed));
    const h = height * (0.28 - 0.11 * f);
    const y = height * (0.20 + 0.62 * f);
    const skirt = new THREE.ConeGeometry(r, h, 6, 1);
    skirt.translate(0, h / 2, 0);
    skirt.rotateY(hash1(i * 2 + 3, seed) * Math.PI);    // break the shared cone seam
    skirt.translate(0, y, 0);
    parts.push(skirt);
  }
  return mergeSimple(parts);
}

export function makePine({ height = 4, tiers = 5, seed = 3, color = '#4C5247' } = {}) {
  const mesh = new THREE.Mesh(pineGeometry({ height, tiers, seed }), toonMaterial({ color, flat: true }));
  mesh.name = 'pine';
  return mesh;
}
