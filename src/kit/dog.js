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
  // Taller legs and a slimmer barrel: the first pass was short-legged and
  // fat-bodied, which reads as a pig rather than a dog.
  const legH = 0.52 * h;
  const bodyR = 0.22 * h;
  const bodyY = legH + 0.16 * h;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, 0.72 * h, 4, 8), mat);
  body.name = 'body';
  body.rotation.x = Math.PI / 2;                 // lie along z
  body.position.set(0, bodyY, 0);
  g.add(body);

  // Legs run PAST the belly rather than stopping at it. A capsule narrows toward
  // its sides, so legs set at the old width ended below the body surface at that
  // x and left a visible gap between foot and barrel.
  const legTop = legH + 0.14 * h;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * h, 0.045 * h, legTop, 6), mat);
    leg.name = 'leg';
    leg.position.set(sx * 0.13 * h, legTop / 2, sz * 0.32 * h);
    g.add(leg);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.20 * h, 12, 10), mat);
  head.name = 'head';
  head.position.set(0, bodyY + 0.22 * h, 0.56 * h);
  g.add(head);

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * h, 0.10 * h, 0.20 * h, 7), mat);
  snout.name = 'snout';
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, bodyY + 0.16 * h, 0.76 * h);
  g.add(snout);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075 * h, 0.16 * h, 5), mat);
    ear.name = 'ear';
    ear.position.set(sx * 0.11 * h, bodyY + 0.36 * h, 0.52 * h);
    g.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * h, 0.05 * h, 0.38 * h, 6), mat);
  tail.name = 'tail';
  tail.position.set(0, bodyY + 0.10 * h, -0.44 * h);
  tail.rotation.x = -1.0;                          // cocked up and back
  g.add(tail);

  return g;
}
