import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { WASH } from '../palette.js';

const T = 0.06;   // bar thickness

// The bars of one lattice panel, merged into a SINGLE geometry: a four-sided
// frame with vertical and horizontal bars, built in the XY plane facing +z and
// standing from y=0 to height, centred on x=0. Kept separate from makeLattice
// so a wall can merge several panels into one mesh before anything is drawn.
//
// This is the whole reason the pen went from ~50 meshes to three: an inverted-
// hull outline is added per mesh, so every bar used to cost two draws. One
// merged geometry per panel (or per wall) is one silhouette, one outline.
export function latticeGeometry({ width = 2.2, height = 2.0, bars = 5 } = {}) {
  const parts = [];
  const box = (w, h, d, x, y) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, 0);
    parts.push(b);
  };

  box(width, T, T, 0, height - T / 2);              // top rail
  box(width, T, T, 0, T / 2);                       // bottom rail
  box(T, height, T, -width / 2 + T / 2, height / 2);   // left
  box(T, height, T, width / 2 - T / 2, height / 2);    // right

  for (let i = 1; i < bars; i++) {
    box(T * 0.6, height, T * 0.6, -width / 2 + (i / bars) * width, height / 2);
  }
  const hRows = Math.max(1, Math.round(bars * height / width));
  for (let j = 1; j < hRows; j++) {
    box(width, T * 0.6, T * 0.6, 0, (j / hRows) * height);
  }
  return mergeSimple(parts);
}

// A standing lattice panel as one mesh — reusable as a window, fence, or screen.
// Stands from y=0 to height, facing +z. userData carries its dimensions so a
// caller that cares can measure it without walking children (there are none).
export function makeLattice({ width = 2.2, height = 2.0, bars = 5, color = WASH.dark } = {}) {
  const mesh = new THREE.Mesh(latticeGeometry({ width, height, bars }), toonMaterial({ color, flat: true }));
  mesh.name = 'lattice';
  mesh.userData.lattice = { width, height, bars };
  return mesh;
}

// A square pen: lattice on three sides, the fourth left standing open.
//
// Case 37 needs exactly that. The buffalo forces its head, horns, body and
// hooves through the lattice — and cannot get its tail through — while one whole
// side of the pen stands open beside it. The koan's absurdity is the point, so
// the open side has to be plainly visible in the shot, not implied.
//
// Each STANDING WALL is one merged mesh: its panelsPerSide panels are baked
// into a single geometry (they are the same panel repeated, so this is just
// doubling one piece), and the wall as a whole carries one outline. Three
// walls, three meshes, six draws — where the panel-per-mesh build cost dozens.
//
// `open` names the missing wall: '+z' is nearest the camera, '+x' is to its right.
export function makePen({
  size = 5.4, height = 1.9, open = '+x', panelsPerSide = 2, bars = 4, color = WASH.dark,
} = {}) {
  const g = new THREE.Group();
  g.name = 'pen';
  const half = size / 2;
  const w = size / panelsPerSide;
  const mat = toonMaterial({ color, flat: true });

  // a panel is built in the XY plane facing +z; the x-walls turn onto it
  const sides = [['-z', 0, -half, 0], ['+z', 0, half, 0],
    ['-x', -half, 0, Math.PI / 2], ['+x', half, 0, Math.PI / 2]];

  const walls = [];
  for (const [name, cx, cz, rot] of sides) {
    if (name === open) continue;
    walls.push(name);
    // bake this wall's panels into one geometry, laid along the wall's local x
    const geos = [];
    for (let i = 0; i < panelsPerSide; i++) {
      const off = -half + w * (i + 0.5);
      const panel = latticeGeometry({ width: w, height, bars });
      panel.translate(off, 0, 0);
      geos.push(panel);
    }
    const wall = new THREE.Mesh(mergeSimple(geos), mat);
    wall.name = 'wall';
    wall.rotation.y = rot;              // the mesh turns; the bars keep their normals
    wall.position.set(cx, 0, cz);
    g.add(wall);
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
