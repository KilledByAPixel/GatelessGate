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
    const t = simTime * 0.35;
    stepCloth(cloth, dt, {
      gravity: [0, -3.5, 0],
      iterations: 4,
      force: (x, y, z, i) => {
        const gust = 2.2 + 2.5 * noise3(x * 0.4 + t, y * 0.4, t * 0.7, seed);
        const fz = (noise3(x * 0.8, y * 0.8 + t, t, seed + 4) - 0.5) * 2.6;
        return [gust, 0, fz];
      },
    });
    copyPositions();
  };

  return { group, update, cloth };
}
