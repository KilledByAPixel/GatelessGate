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

// A square pen: lattice on three sides, the fourth left standing open.
//
// Case 37 needs exactly that. The buffalo forces its head, horns, body and
// hooves through the lattice — and cannot get its tail through — while one whole
// side of the pen stands open beside it. The koan's absurdity is the point, so
// the open side has to be plainly visible in the shot, not implied.
//
// `open` names the missing wall: '+z' is nearest the camera, '+x' is to its right.
export function makePen({
  size = 5.4, height = 1.9, open = '+x', panelsPerSide = 2, bars = 4, color = WASH.dark,
} = {}) {
  const g = new THREE.Group();
  g.name = 'pen';
  const half = size / 2;
  const w = size / panelsPerSide;

  // a lattice panel is built in the XY plane facing +z; the x-walls turn onto it
  const sides = [['-z', 0, -half, 0], ['+z', 0, half, 0],
    ['-x', -half, 0, Math.PI / 2], ['+x', half, 0, Math.PI / 2]];

  const walls = [];
  for (const [name, cx, cz, rot] of sides) {
    if (name === open) continue;
    walls.push(name);
    for (let i = 0; i < panelsPerSide; i++) {
      const off = -half + w * (i + 0.5);
      const panel = makeLattice({ width: w, height, bars, color });
      panel.rotation.y = rot;
      panel.position.set(cx + (rot ? 0 : off), 0, cz + (rot ? off : 0));
      g.add(panel);
    }
  }
  g.userData.open = open;

  // circles along the standing walls, for the prop keepout. Grass is left to
  // grow through a fence, as it does.
  g.footprint = (r = 0.9, per = 5) => {
    const out = [];
    for (const [name, cx, cz, rot] of sides) {
      if (name === open) continue;
      for (let i = 0; i <= per; i++) {
        const off = -half + size * (i / per);
        out.push({ x: g.position.x + cx + (rot ? 0 : off), z: g.position.z + cz + (rot ? off : 0), r });
      }
    }
    return out;
  };
  g.userData.walls = walls;
  return g;
}
