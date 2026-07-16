import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';

// A freestanding gate with no door. Two posts, double lintel.
export function makeGate({ width = 2.4, height = 2.6, color = '#2A2A32' } = {}) {
  const g = new THREE.Group();
  g.name = 'gate';
  const mat = toonMaterial({ color });
  const flatMat = toonMaterial({ color, flat: true });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, height, 10), mat);
    post.name = 'post';
    post.position.set(sx * width / 2, height / 2, 0);
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(width * 1.4, 0.18, 0.34), flatMat);
  top.name = 'lintel';
  top.position.y = height + 0.09;
  const second = new THREE.Mesh(new THREE.BoxGeometry(width * 1.08, 0.12, 0.24), flatMat);
  second.name = 'tie';
  second.position.y = height * 0.78;
  g.add(top, second);
  return g;
}
