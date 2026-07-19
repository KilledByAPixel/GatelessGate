import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// A single held flower (case 6). Stem, a small center, and petals arranged in a
// ring. dropPetal() detaches one petal for the scene to drift downward.
export function makeFlower({ height = 0.6, petals = 6, color = '#EED9E2', seed = 6 } = {}) {
  void seed;
  const g = new THREE.Group();
  g.name = 'flower';
  const stemMat = toonMaterial({ color: INK, flat: true });
  const petalMat = toonMaterial({ color, flat: true });
  petalMat.fog = false;                          // the bloom stays bright like the seal accent

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * height, 0.02 * height, height, 6), stemMat);
  stem.name = 'stem';
  stem.position.y = height / 2;
  g.add(stem);

  const center = new THREE.Mesh(new THREE.SphereGeometry(0.05 * height, 10, 8), toonMaterial({ color: '#E4B33E', flat: true }));
  center.name = 'center';
  center.position.y = height;
  g.add(center);

  for (let i = 0; i < petals; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.07 * height, 8, 6), petalMat);
    petal.name = 'petal';
    petal.scale.set(1, 0.4, 1.6);                // flatten into a petal
    const a = (i / petals) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.09 * height, height, Math.sin(a) * 0.09 * height);
    petal.rotation.y = -a;
    g.add(petal);
  }

  g.dropPetal = () => {
    const petal = g.children.find((c) => c.name === 'petal');
    if (!petal) return null;
    const world = petal.getWorldPosition(new THREE.Vector3()); // resolves the full ancestor transform chain
    g.remove(petal);
    petal.position.copy(world);   // correct once the caller adds it to the scene root
    return petal;
  };
  return g;
}
