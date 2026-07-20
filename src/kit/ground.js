import * as THREE from '../../lib/three.module.js';
import { noise2 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';

// Gently rolling ground that runs out into the fog — the paper takes over
// before any horizon appears. Flat near the center so staging stays level.

// Height of the ground at (x, z) — shared by scatter/paths/grass so everything
// sits on the same surface. Two octaves: broad hills that actually read as
// landform, plus a finer undulation so the slopes aren't glassy. The staging
// area inside flatRadius stays level, so hand-placed props still sit at y=0.
export function groundHeight(x, z, { seed = 21, roll = 1.1, flatRadius = 9 } = {}) {
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - flatRadius) / 14));
  const ease = t * t * (3 - 2 * t);
  const broad = (noise2(x * 0.035 + 7, z * 0.035 + 3, seed) - 0.4) * 2;
  const fine = (noise2(x * 0.11 + 19, z * 0.11 + 5, seed + 3) - 0.5) * 0.5;
  return (broad * roll * 2.2 + fine * roll) * ease;
}

export function makeGround({ size = 150, seed = 21, roll = 1.1, flatRadius = 9, color = '#CDC6B5', segments = 96 } = {}) {
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
