import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The kit monk, second pass: a lathed robe (narrow shoulders flaring to a wide
// hem), sleeves with the hands hidden inside, sphere head, wide sedge hat.
// Featureless by design — ink figures have no faces (a smile is an event).
// Poses: 'stand' (sleeves hang), 'point' (one sleeve raised toward +x).
export function makeMonk({ height = 1.6, stout = 1, color = INK, hat = true, pose = 'stand' } = {}) {
  const g = new THREE.Group();
  g.name = 'monk';
  const mat = toonMaterial({ color, flat: true });

  // robe: lathe profile from hem to collar, in fractions of height
  const s = stout;
  const profile = [
    [0.02, 0.0], [0.21 * s, 0.0], [0.20 * s, 0.03], [0.155 * s, 0.30],
    [0.125 * s, 0.48], [0.115 * s, 0.58], [0.13 * s, 0.64], [0.06 * s, 0.68],
  ].map(([r, y]) => new THREE.Vector2(r * height, y * height));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), mat);
  body.name = 'body';
  g.add(body);

  // sleeves: flared cuffs, pivoted at the shoulder
  const shoulderY = 0.60 * height;
  const sleeveL = 0.34 * height;
  const makeSleeve = (side, raise) => {
    const geo = new THREE.CylinderGeometry(0.035 * height, 0.065 * height, sleeveL, 7);
    geo.translate(0, -sleeveL / 2, 0); // pivot at the shoulder end; sleeve hangs down
    const arm = new THREE.Mesh(geo, mat);
    arm.name = 'arm';
    arm.position.set(side * 0.115 * s * height, shoulderY, 0);
    // hang slightly outward; a raised sleeve swings up toward +x to point
    arm.rotation.z = raise ? Math.PI - 0.95 : side * 0.28;
    if (raise) arm.rotation.y = 0.15;
    g.add(arm);
    return arm;
  };
  makeSleeve(-1, false);
  makeSleeve(1, pose === 'point');

  const headR = 0.095 * height;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 10), mat);
  head.name = 'head';
  head.position.y = 0.735 * height;
  g.add(head);

  if (hat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.185 * height, 0.10 * height, 12), mat);
    cone.name = 'hat';
    cone.position.y = 0.80 * height;
    g.add(cone);
  }
  return g;
}
