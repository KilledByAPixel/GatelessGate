import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { hash1 } from '../util/noise.js';
import { INK } from '../palette.js';

// A seated crowd as one InstancedMesh (one draw call): a simplified silhouette
// (pooled cone body + head) repeated in a shallow arc, each facing a focal
// point. Hero figures (Buddha, Kasyapa) are placed separately by the scene.
export function makeAssembly({ count = 8, radius = 3.0, center = [0, 0], facing = [0, 0], spread = 1.4, color = INK, seed = 6 } = {}) {
  const bodyGeo = new THREE.ConeGeometry(0.34, 0.8, 8);
  bodyGeo.translate(0, 0.4, 0);
  const headGeo = new THREE.SphereGeometry(0.12, 10, 8);
  headGeo.translate(0, 0.9, 0);
  const geo = mergeSimple([bodyGeo, headGeo]);

  const mesh = new THREE.InstancedMesh(geo, toonMaterial({ color, flat: true }), count);
  mesh.name = 'assembly';
  mesh.userData.noOutline = true;

  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const arc = Math.PI * 0.7;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const ang = -arc / 2 + t * arc;
    const rr = radius + (hash1(i * 2 + 1, seed) - 0.5) * spread;
    const x = center[0] + Math.sin(ang) * rr;
    const z = center[1] + Math.cos(ang) * rr;
    const yaw = Math.atan2(facing[0] - x, facing[1] - z);
    const sc = 0.9 + 0.2 * hash1(i * 2 + 7, seed);
    m.compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(sc, sc, sc),
    );
    mesh.setMatrixAt(i, m);
    col.setStyle(color).offsetHSL(0, 0, (hash1(i * 2 + 3, seed) - 0.5) * 0.1);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
