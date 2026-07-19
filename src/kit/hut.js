import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';

// A small post-and-beam shelter used as a monastery threshold (case 7). Four
// posts, a low pyramidal roof, a threshold sill across the open front.
export function makeHut({ width = 2.4, height = 2.2, depth = 2.0, color = '#4A4038' } = {}) {
  const g = new THREE.Group();
  g.name = 'hut';
  const mat = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, height, 8), mat);
    post.name = 'post';
    post.position.set(sx * width / 2, height / 2, sz * depth / 2);
    g.add(post);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(width, depth) * 0.62, 0.7, 4), flat);
  roof.name = 'roof';
  roof.rotation.y = Math.PI / 4;                  // square the pyramid to the posts
  roof.position.y = height + 0.35;
  g.add(roof);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 0.18), flat);
  sill.name = 'sill';
  sill.position.set(0, 0.06, depth / 2);
  g.add(sill);
  return g;
}
