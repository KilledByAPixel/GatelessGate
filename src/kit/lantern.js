import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// A stone lantern (tōrō): base, shaft, platform, firebox, roof, knob.
// Reused everywhere — temple gates, paths, and later the menu's progress marks.
export function makeLantern({ height = 1.15, color = WASH.stone } = {}) {
  const g = new THREE.Group();
  g.name = 'lantern';
  const mat = toonMaterial({ color, flat: true });
  const add = (geo, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    g.add(m);
    return m;
  };
  const u = height / 1.15; // proportions authored at height 1.15
  add(new THREE.CylinderGeometry(0.17 * u, 0.20 * u, 0.10 * u, 8), 0.05 * u);
  add(new THREE.CylinderGeometry(0.055 * u, 0.07 * u, 0.36 * u, 7), 0.28 * u);
  add(new THREE.CylinderGeometry(0.12 * u, 0.10 * u, 0.05 * u, 8), 0.485 * u);
  add(new THREE.CylinderGeometry(0.13 * u, 0.13 * u, 0.18 * u, 6), 0.60 * u);
  add(new THREE.ConeGeometry(0.23 * u, 0.14 * u, 6), 0.76 * u);
  add(new THREE.SphereGeometry(0.045 * u, 8, 6), 0.86 * u);
  return g;
}
