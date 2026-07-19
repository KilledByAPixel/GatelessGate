import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// A small ink quadruped. Featureless by design. Params flex toward a fox or
// cat later (color, ear size, tail). Faces +z.
export function makeDog({ height = 0.5, color = INK, seed = 1 } = {}) {
  void seed; // deterministic; reserved for future per-dog variation
  const g = new THREE.Group();
  g.name = 'dog';
  const mat = toonMaterial({ color, flat: true });
  const h = height;
  const legH = 0.42 * h;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * h, 0.7 * h, 4, 8), mat);
  body.name = 'body';
  body.rotation.x = Math.PI / 2;                 // lie along z
  body.position.set(0, legH + 0.26 * h, 0);
  g.add(body);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * h, 0.05 * h, legH, 6), mat);
    leg.name = 'leg';
    leg.position.set(sx * 0.16 * h, legH / 2, sz * 0.34 * h);
    g.add(leg);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * h, 12, 10), mat);
  head.name = 'head';
  head.position.set(0, legH + 0.42 * h, 0.6 * h);
  g.add(head);

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * h, 0.11 * h, 0.22 * h, 7), mat);
  snout.name = 'snout';
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, legH + 0.36 * h, 0.82 * h);
  g.add(snout);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09 * h, 0.18 * h, 5), mat);
    ear.name = 'ear';
    ear.position.set(sx * 0.12 * h, legH + 0.6 * h, 0.55 * h);
    g.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * h, 0.055 * h, 0.4 * h, 6), mat);
  tail.name = 'tail';
  tail.position.set(0, legH + 0.42 * h, -0.5 * h);
  tail.rotation.x = -0.9;                          // cocked up and back
  g.add(tail);

  return g;
}
