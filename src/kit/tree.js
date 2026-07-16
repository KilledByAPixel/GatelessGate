import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { GRAY_DARK } from '../palette.js';

// A simple ink tree: tapered trunk, 2-3 flattened faceted canopy washes.
// Not the hero tree (cases 5/37) — set dressing for M0.
export function makeTree({ height = 3.2, seed = 2, trunkColor = GRAY_DARK, canopyColor = '#3B3B45' } = {}) {
  const g = new THREE.Group();
  g.name = 'tree';
  const trunkH = height * 0.55;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * height, 0.09 * height, trunkH, 7),
    toonMaterial({ color: trunkColor, flat: true })
  );
  trunk.name = 'trunk';
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = 0.06;
  g.add(trunk);
  const canopyMat = toonMaterial({ color: canopyColor, flat: true });
  for (let i = 0; i < 3; i++) {
    const a = hash1(i * 3 + 1, seed) * Math.PI * 2;
    const r = 0.22 * height * hash1(i * 3 + 2, seed);
    const blobR = height * (0.2 + 0.1 * hash1(i * 3 + 3, seed));
    const blob = new THREE.Mesh(new THREE.DodecahedronGeometry(blobR, 0), canopyMat);
    blob.name = 'canopy';
    blob.position.set(
      Math.cos(a) * r,
      height * (0.62 + 0.16 * hash1(i * 3 + 4, seed)),
      Math.sin(a) * r * 0.7
    );
    blob.scale.y = 0.65;
    g.add(blob);
  }
  return g;
}
