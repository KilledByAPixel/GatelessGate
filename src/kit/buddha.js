import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// A seated Buddha: a broad pooled robe rising to the shoulders, a serene head,
// an ushnisha (topknot), hands resting in the lap. Reusable for any
// Buddha-statue case. Featureless — the smile, if any, is added by the scene.
export function makeBuddha({ height = 2.0, color = INK } = {}) {
  const g = new THREE.Group();
  g.name = 'buddha';
  const mat = toonMaterial({ color, flat: true });
  const H = height;

  const profile = [
    [0.02, 0.0], [0.42, 0.0], [0.44, 0.06], [0.36, 0.22],
    [0.26, 0.38], [0.22, 0.48], [0.20, 0.55], [0.09, 0.60],
  ].map(([r, y]) => new THREE.Vector2(r * H, y * H));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 12), mat);
  body.name = 'body';
  g.add(body);

  const lap = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * H, 0.40 * H, 0.1 * H, 14), mat);
  lap.name = 'lap';
  lap.position.y = 0.14 * H;
  g.add(lap);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12 * H, 16, 12), mat);
  head.name = 'head';
  head.position.y = 0.66 * H;
  g.add(head);

  const ush = new THREE.Mesh(new THREE.SphereGeometry(0.055 * H, 10, 8), mat);
  ush.name = 'ushnisha';
  ush.position.y = 0.75 * H;
  g.add(ush);

  return g;
}
