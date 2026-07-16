import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The kit monk, first pass: capsule body, sphere head, cone hat.
// Featureless by design — ink figures have no faces (a smile is an event).
export function makeMonk({ height = 1.6, stout = 1, color = INK, hat = true } = {}) {
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
  return g;
}
