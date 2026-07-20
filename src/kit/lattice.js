import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// A standing lattice panel: a frame with vertical and horizontal bars. Reusable
// as a window/fence/screen; case 37's enclosure. Stands from y=0 to height.
export function makeLattice({ width = 2.2, height = 2.0, bars = 5, color = WASH.dark } = {}) {
  const g = new THREE.Group();
  g.name = 'lattice';
  const mat = toonMaterial({ color, flat: true });
  const t = 0.06;

  const rail = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
    m.name = 'rail';
    m.position.set(x, y, 0);
    g.add(m);
  };
  rail(width, t, 0, height - t / 2);              // top
  rail(width, t, 0, t / 2);                        // bottom
  rail(t, height, -width / 2 + t / 2, height / 2); // left
  rail(t, height, width / 2 - t / 2, height / 2);  // right

  for (let i = 1; i < bars; i++) {
    const x = -width / 2 + (i / bars) * width;
    const v = new THREE.Mesh(new THREE.BoxGeometry(t * 0.6, height, t * 0.6), mat);
    v.name = 'bar';
    v.position.set(x, height / 2, 0);
    g.add(v);
  }
  const hRows = Math.max(1, Math.round(bars * height / width));
  for (let j = 1; j < hRows; j++) {
    const y = (j / hRows) * height;
    const hbar = new THREE.Mesh(new THREE.BoxGeometry(width, t * 0.6, t * 0.6), mat);
    hbar.name = 'bar';
    hbar.position.set(0, y, 0);
    g.add(hbar);
  }
  return g;
}
