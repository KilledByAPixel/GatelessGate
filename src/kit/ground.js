import * as THREE from '../../lib/three.module.js';
import { noise2 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';

// Gently rolling ground that runs out into the fog — the paper takes over
// before any horizon appears. Flat near the center so staging stays level.

// Height of the ground at (x, z) — shared by scatter/paths so props sit on it.
export function groundHeight(x, z, { seed = 21, roll = 1.1, flatRadius = 9 } = {}) {
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - flatRadius) / 18));
  const ease = t * t * (3 - 2 * t);
  const h = (noise2(x * 0.06 + 7, z * 0.06 + 3, seed) - 0.35) * roll * 2;
  return h * ease;
}

export function makeGround({ size = 150, seed = 21, roll = 1.1, flatRadius = 9, color = '#CDC6B5', segments = 56 } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i), { seed, roll, flatRadius }));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toonMaterial({ color }));
  mesh.name = 'ground';
  mesh.userData.noOutline = true; // a wash, not a contour
  return mesh;
}
