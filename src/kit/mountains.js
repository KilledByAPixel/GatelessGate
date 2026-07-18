import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';

// Distant mountains: an arc of big faceted cones behind the scene, washed by
// the fog into layered ink silhouettes. Call twice (far light band, nearer
// darker band) for depth. Faces the -z direction the compositions look toward.
export function makeMountains({
  count = 7, distance = 46, arcCenter = 0, arcSpan = 2.8, seed = 31,
  color = '#B9B4A6', hScale = 1,
} = {}) {
  const g = new THREE.Group();
  g.name = 'mountains';
  const mat = toonMaterial({ color, flat: true });
  for (let i = 0; i < count; i++) {
    const a = arcCenter + (hash1(i * 5 + 1, seed) - 0.5) * arcSpan;
    const d = distance * (0.85 + 0.35 * hash1(i * 5 + 2, seed));
    const h = (9 + 13 * hash1(i * 5 + 3, seed)) * hScale;
    const r = h * (0.9 + 0.7 * hash1(i * 5 + 4, seed));
    const sides = 5 + Math.floor(hash1(i * 5 + 5, seed) * 3);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, sides), mat);
    m.position.set(Math.sin(a) * d, h / 2 - 1.5, -Math.cos(a) * d); // base sunk below the ground roll
    m.rotation.y = hash1(i * 7 + 6, seed) * Math.PI;
    m.name = 'mountain';
    m.userData.noOutline = true; // silhouettes are washes, not contours
    g.add(m);
  }
  return g;
}
