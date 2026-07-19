import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { noise2 } from '../util/noise.js';

const RING_LIFE = 2.2;
const POOL = 6;

// A stylized water surface (case 7): a translucent paper-tinted plane with a
// faint idle shimmer and expanding ripple rings. No real reflection by design.
export function makeWater({ size = 2.0, color = '#AEB8B4', seed = 7 } = {}) {
  const group = new THREE.Group();
  group.name = 'water';

  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  mat.transparent = true;
  mat.opacity = 0.72;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), mat);
  surface.name = 'surface';
  surface.rotation.x = -Math.PI / 2;
  surface.userData.noOutline = true;
  group.add(surface);

  const ringMat = toonMaterial({ color: '#F4F1E8', side: THREE.DoubleSide });
  ringMat.transparent = true;
  const rings = [];
  for (let i = 0; i < POOL; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 24), ringMat.clone());
    ring.name = 'ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    ring.visible = false;
    ring.userData.noOutline = true;
    rings.push({ mesh: ring, age: -1, x: 0, z: 0 });
    group.add(ring);
  }

  function ripple(x, z) {
    const slot = rings.find((r) => r.age < 0) || rings[0];
    slot.age = 0; slot.x = x; slot.z = z;
    slot.mesh.visible = true;
    return slot;
  }

  return {
    group,
    update(dt, simTime) {
      // idle shimmer: a barely-visible breathing of the surface opacity
      mat.opacity = 0.72 + 0.05 * (noise2(simTime * 0.3, 0, seed) - 0.5);
      for (const r of rings) {
        if (r.age < 0) continue;
        r.age += dt;
        if (r.age > RING_LIFE) { r.age = -1; r.mesh.visible = false; continue; }
        const k = r.age / RING_LIFE;
        const rad = 0.05 + k * (size * 0.5);
        r.mesh.scale.setScalar(rad);
        r.mesh.position.set(r.x, 0.01, r.z);
        r.mesh.material.opacity = 0.5 * (1 - k);
      }
    },
    ripple,
    rippleCount() { return rings.filter((r) => r.age >= 0).length; },
  };
}
