import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';

// A rice bowl (case 7): a lathed shell (outside up, over the rim, back down the
// inside) on a small foot. Opening upward.
export function makeBowl({ radius = 0.22, color = '#6E6A62' } = {}) {
  const g = new THREE.Group();
  g.name = 'bowl';
  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  const R = radius;
  // profile in world units: up the outside, over the rim, back down the inside
  const prof = [
    [0.06, 0.03], [R, 0.03], [R, 0.05], [R * 1.02, 0.30],
    [R * 0.96, 0.30], [R * 0.9, 0.06], [0.04, 0.06],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mat);
  shell.name = 'bowl';
  g.add(shell);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.42, R * 0.5, 0.03, 14), mat);
  foot.name = 'foot';
  foot.position.y = 0.015;
  g.add(foot);
  return g;
}
