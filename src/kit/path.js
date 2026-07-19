import * as THREE from '../../lib/three.module.js';
import { noise1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { groundHeight } from './ground.js';

// A dirt path: a gently wandering ribbon laid on the ground, slightly darker
// than the soil. Draped over the rolling terrain via groundHeight.
export function makePath({
  from = [0, 8], to = [0, -30], width = 1.4, seed = 91, groundSeed = 21,
  wander = 1.6, samples = 26, color = '#B3A98F',
} = {}) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    // lateral wander, pinned at both ends
    const sway = (noise1(t * 3.2, seed) - 0.5) * 2 * wander * Math.sin(Math.PI * t);
    pts.push([x + sway, z]);
  }
  const positions = new Float32Array((samples + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i <= samples; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(samples, i + 1)];
    // perpendicular of the local direction
    let dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const w = width / 2 * (0.85 + 0.3 * noise1(i * 0.7, seed + 5));
    const lx = x - dz * w, lz = z + dx * w;
    const rx = x + dz * w, rz = z - dx * w;
    const yl = groundHeight(lx, lz, { seed: groundSeed }) + 0.03;
    const yr = groundHeight(rx, rz, { seed: groundSeed }) + 0.03;
    positions.set([lx, yl, lz, rx, yr, rz], i * 6);
    if (i < samples) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, c, b, b, c, d);   // wound counter-clockwise from above
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = toonMaterial({ color });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'path';
  mesh.userData.noOutline = true; // a worn track, not a contour

  // sample the centerline at t∈[0,1] so props (gate, lanterns) sit ON the path.
  // `heading` is a rotation.y that aligns a gate's opening along the trail;
  // `perp` is the unit left-vector across the path for flanking things.
  mesh.sample = (t) => {
    const f = Math.max(0, Math.min(1, t)) * samples;
    const i = Math.min(Math.floor(f), samples - 1);
    const frac = f - i;
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const x = x0 + (x1 - x0) * frac;
    const z = z0 + (z1 - z0) * frac;
    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return {
      x, z,
      y: groundHeight(x, z, { seed: groundSeed }),
      heading: Math.atan2(dx, dz),      // gate.rotation.y so you pass through it
      perp: { x: -dz, z: dx },          // unit across-path (left) for flanking
    };
  };
  return mesh;
}
