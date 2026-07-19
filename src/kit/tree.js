import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { GRAY_DARK } from '../palette.js';

// A simple ink tree: tapered trunk with a cluster of faceted canopy blobs that
// always overlap the trunk top (one blob is centered on the trunk so the crown
// never floats free of it). Set dressing — not the hero tree (cases 5/37).
export function makeTree({ height = 3.2, seed = 2, trunkColor = GRAY_DARK, canopyColor = '#3B3B45' } = {}) {
  const g = new THREE.Group();
  g.name = 'tree';
  const trunkH = height * 0.5;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 * height, 0.09 * height, trunkH, 7),
    toonMaterial({ color: trunkColor, flat: true })
  );
  trunk.name = 'trunk';
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = 0.05;
  g.add(trunk);

  const canopyMat = toonMaterial({ color: canopyColor, flat: true });
  const blobs = 5;
  for (let i = 0; i < blobs; i++) {
    const centered = i === 0; // the anchor blob sits on the trunk, connecting the crown
    const a = hash1(i * 4 + 1, seed) * Math.PI * 2;
    const r = centered ? 0 : height * (0.06 + 0.09 * hash1(i * 4 + 2, seed));
    const blobR = height * (centered ? 0.25 : 0.16 + 0.07 * hash1(i * 4 + 3, seed));
    // anchor blob straddles the trunk top; the rest cluster tightly above it
    const y = centered
      ? trunkH * 0.96 + blobR * 0.25
      : trunkH + height * (0.04 + 0.16 * hash1(i * 4 + 4, seed));
    const blob = new THREE.Mesh(new THREE.DodecahedronGeometry(blobR, 0), canopyMat);
    blob.name = 'canopy';
    blob.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.85);
    blob.rotation.set(hash1(i * 7 + 5, seed) * 3, hash1(i * 7 + 6, seed) * 3, 0);
    blob.scale.y = 0.82;
    g.add(blob);
  }
  return g;
}
