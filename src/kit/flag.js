import * as THREE from '../../lib/three.module.js';
import { createCloth, stepCloth } from '../sim/verlet.js';
import { noise3 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT, INK } from '../palette.js';

// Case 29's flag. Wind is a controllable [0..1] level (click toggles it, ~2 s ramp);
// hover injects decaying localized puffs. These behaviors travel with the component.
const WIND_TAU = 0.7;      // ~2 s to full
const PUFF_RADIUS = 0.4;
const PUFF_LIFE = 0.6;

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

  let windTarget = 1;
  let windLevel = 1;
  const puffs = []; // { x, y, age }

  const update = (dt, simTime) => {
    windLevel += (windTarget - windLevel) * (1 - Math.exp(-dt / WIND_TAU));
    for (const pf of puffs) pf.age += dt;
    while (puffs.length && puffs[0].age > PUFF_LIFE) puffs.shift();
    const t = simTime * 0.9;
    stepCloth(cloth, dt, {
      gravity: [0, -3.5, 0],
      iterations: 4,
      damping: 0.99,
      force: (x, y, z, i) => {
        const gust = (1.8 + 3.4 * noise3(x * 0.5 + t, y * 0.5, t * 0.8, seed)) * windLevel;
        const flap = (noise3(x * 1.3, y * 1.3 + t * 1.4, t * 1.2, seed + 4) - 0.5) * 7.0 * windLevel;
        const lift = (noise3(x * 0.7 + 9, t * 0.6, y * 0.7, seed + 9) - 0.5) * 2.0 * windLevel;
        // hover puffs: the tiniest brush of extra motion, and only while the
        // wind is alive — a stilled flag ignores the cursor entirely.
        let pz = 0, py = 0;
        for (const pf of puffs) {
          const dx = x - pf.x, dy = y - pf.y;
          const fall = Math.exp(-(dx * dx + dy * dy) / (PUFF_RADIUS * PUFF_RADIUS)) * (1 - pf.age / PUFF_LIFE);
          pz += fall * 3.5 * windLevel;
          py += fall * 0.9 * windLevel;
        }
        return [gust, lift + py, flap + pz];
      },
    });
    copyPositions();
  };

  return {
    group,
    mesh,
    cloth,
    update,
    setWindTarget(v) { windTarget = v ? 1 : 0; },
    toggleWind() { windTarget = windTarget < 0.5 ? 1 : 0; return windTarget >= 0.5; },
    isWindOn() { return windTarget >= 0.5; },
    windLevel() { return windLevel; },
    hoverAt(lx, ly) {
      if (windTarget < 0.5) return false;    // stilled flag: no mouse response at all
      puffs.push({ x: lx, y: ly, age: 0 });
      if (puffs.length > 8) puffs.shift();
      return true;
    },
  };
}
