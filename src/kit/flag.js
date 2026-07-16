import * as THREE from '../../lib/three.module.js';
import { createCloth, stepCloth } from '../sim/verlet.js';
import { noise3 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT, INK } from '../palette.js';

// Case 29's flag: ink pole, accent cloth. The cloth is the only color in M0.
export function makeFlag({ cols = 24, rows = 16, width = 1.5, poleH = 3.4, seed = 11, color = ACCENT } = {}) {
  const group = new THREE.Group();
  group.name = 'flag';

  const poleMat = toonMaterial({ color: INK });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, poleH, 8), poleMat);
  pole.name = 'pole';
  pole.position.y = poleH / 2;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), poleMat);
  finial.name = 'finial';
  finial.position.y = poleH + 0.04;
  group.add(pole, finial);

  const spacing = width / (cols - 1);
  const clothH = (rows - 1) * spacing;
  const cloth = createCloth(cols, rows, spacing, (c, r) => c === 0);

  const geo = new THREE.PlaneGeometry(width, clothH, cols - 1, rows - 1);
  const mesh = new THREE.Mesh(geo, toonMaterial({ color, side: THREE.DoubleSide }));
  mesh.material.fog = false; // the accent is a seal stamp: printed over the wash, never diluted by it
  mesh.name = 'cloth';
  mesh.userData.noOutline = true; // inverted hull doesn't suit an open surface
  mesh.position.set(0.045, poleH - 0.06, 0);
  group.add(mesh);

  const copyPositions = () => {
    const p = geo.attributes.position;
    for (let i = 0; i < cloth.pins.length; i++) {
      p.setXYZ(i, cloth.positions[i * 3], cloth.positions[i * 3 + 1], cloth.positions[i * 3 + 2]);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  copyPositions();

  const update = (dt, simTime) => {
    const t = simTime * 0.9;
    stepCloth(cloth, dt, {
      gravity: [0, -3.5, 0],
      iterations: 4,
      damping: 0.99,
      force: (x, y, z, i) => {
        const gust = 1.8 + 3.4 * noise3(x * 0.5 + t, y * 0.5, t * 0.8, seed);
        const flap = (noise3(x * 1.3, y * 1.3 + t * 1.4, t * 1.2, seed + 4) - 0.5) * 7.0;
        const lift = (noise3(x * 0.7 + 9, t * 0.6, y * 0.7, seed + 9) - 0.5) * 2.0;
        return [gust, lift, flap];
      },
    });
    copyPositions();
  };

  return { group, update, cloth };
}
