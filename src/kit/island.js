import * as THREE from '../../lib/three.module.js';
import { noise2 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';

// A floating slab of ground with a torn-paper rim.
// Rim noise is sampled on a circle in 2D noise space so it wraps seamlessly.
export function makeIsland({ radius = 6, thickness = 0.55, seed = 1, segments = 96, tear = 0.5, color = WASH.ground } = {}) {
  const geo = new THREE.CylinderGeometry(radius, radius * 0.92, thickness, segments, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    if (r > radius * 0.5) {
      const angle = Math.atan2(v.z, v.x);
      const n =
        noise2(Math.cos(angle) * 2.0 + 7, Math.sin(angle) * 2.0 + 7, seed) * 0.7 +
        noise2(Math.cos(angle) * 6.0 + 3, Math.sin(angle) * 6.0 + 3, seed + 9) * 0.3;
      const s = 1 + tear * (n - 0.5) * (r / radius);
      pos.setX(i, v.x * s);
      pos.setZ(i, v.z * s);
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, washMaterial({ color }));
  mesh.name = 'island';
  mesh.position.y = -thickness / 2;
  return mesh;
}
