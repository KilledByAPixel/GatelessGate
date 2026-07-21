import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { pineGeometry } from './pine.js';

// A distant stand of trees as one InstancedMesh (a single draw call), read as
// a dark mass at the edge of the fog rather than individual trees. The stand
// shares one tiered-pine geometry: still one draw call, but a ragged conifer
// silhouette instead of a field of identical smooth cones.
export function makeForest({
  count = 50, center = [0, 0, -28], spread = 16, seed = 41,
  color = WASH.mid, treeH = 2.8,
} = {}) {
  const geo = pineGeometry({ height: treeH, tiers: 5, seed });
  const mat = toonMaterial({ color, flat: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'forest';
  mesh.userData.noOutline = true; // instanced shell would collapse to one cone
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = hash1(i * 3 + 1, seed) * Math.PI * 2;
    const r = Math.sqrt(hash1(i * 3 + 2, seed)) * spread;
    const sc = 0.7 + 0.9 * hash1(i * 3 + 3, seed);
    p.set(center[0] + Math.cos(a) * r, -0.45, center[2] + Math.sin(a) * r); // bases sunk into the rolling ground
    e.set(0, hash1(i * 5 + 4, seed) * Math.PI, 0);
    q.setFromEuler(e);
    s.set(sc, sc, sc);
    m4.compose(p, q, s);
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
