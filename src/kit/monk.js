import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The kit monk, first pass: capsule body, sphere head, cone hat.
// Featureless by design — ink figures have no faces (a smile is an event).
// pose 'point' raises one arm (used to stage arguments, e.g. case 29).
export function makeMonk({ height = 1.6, stout = 1, color = INK, hat = true, pose = 'stand' } = {}) {
  const g = new THREE.Group();
  g.name = 'monk';
  const mat = toonMaterial({ color });
  const bodyH = height * 0.62;
  const bodyR = 0.16 * height * stout;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyH - bodyR * 2, 4, 12), mat);
  body.name = 'body';
  body.position.y = bodyH / 2;
  const headR = 0.11 * height;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat);
  head.name = 'head';
  head.position.y = bodyH + headR * 0.9;
  g.add(body, head);
  if (hat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(headR * 1.9, headR * 1.35, 14), mat);
    cone.name = 'hat';
    cone.position.y = bodyH + headR * 1.85;
    g.add(cone);
  }
  if (pose === 'point') {
    const armLen = height * 0.4;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035 * height, armLen, 3, 8), mat);
    arm.name = 'arm';
    // shoulder near the top of the body, arm angled up-and-forward (+x)
    arm.position.set(bodyR * 0.7, bodyH * 0.86, 0);
    arm.rotation.z = -1.15; // rotate the vertical capsule toward +x and up
    arm.translateY(armLen / 2); // pivot from the shoulder end
    g.add(arm);
  }
  return g;
}
