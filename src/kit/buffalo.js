import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { makeTail } from './tail.js';

// A water buffalo (case 37). Bulky body, heavy horned head; the tail is a
// verlet strand at the rump. Faces +z (head forward). Returns a handle so the
// koan can tap the tail. Proportions tuned in the Phase 3 browser pass.
export function makeBuffalo({ height = 1.4, color = '#3A3A40', seed = 37 } = {}) {
  const group = new THREE.Group();
  group.name = 'buffalo';
  const mat = toonMaterial({ color, flat: true });
  const h = height;
  const legH = 0.5 * h;
  const backY = legH + 0.5 * h;

  // few segments so flatShading facets it — a smooth capsule reads as a lozenge
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5 * h, 1.05 * h, 3, 7), mat);
  body.name = 'body';
  body.rotation.x = Math.PI / 2;
  body.position.set(0, backY, 0);
  group.add(body);

  // the shoulder hump, which is most of what makes a buffalo a buffalo
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.42 * h, 7, 5), mat);
  hump.name = 'hump';
  hump.scale.set(1, 0.7, 1.25);
  hump.position.set(0, backY + 0.3 * h, 0.42 * h);
  group.add(hump);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * h, 0.09 * h, legH, 7), mat);
    leg.name = 'leg';
    leg.position.set(sx * 0.3 * h, legH / 2, sz * 0.5 * h);
    group.add(leg);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55 * h, 0.5 * h, 0.6 * h), mat);
  head.name = 'head';
  head.position.set(0, backY - 0.05 * h, 0.95 * h);
  group.add(head);

  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07 * h, 0.5 * h, 6), mat);
    horn.name = 'horn';
    horn.position.set(sx * 0.28 * h, backY + 0.28 * h, 1.0 * h);
    horn.rotation.z = sx * 1.1;                    // sweep outward
    group.add(horn);
  }

  const tail = makeTail({ segments: 7, length: 0.8 * h, thickness: 0.05 * h, color, seed });
  tail.group.position.set(0, backY + 0.1 * h, -0.75 * h);
  group.add(tail.group);

  return {
    group,
    tail,
    update(dt, simTime) { tail.update(dt, simTime); },
  };
}
