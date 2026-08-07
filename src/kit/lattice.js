import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { WASH } from '../palette.js';

const T = 0.06;   // frame thickness

// The bars of one lattice panel, merged into a SINGLE geometry: a four-sided
// frame with vertical and horizontal bars, built in the XY plane facing +z and
// standing from y=0 to height, centred on x=0. Kept separate from makeLattice
// so a wall can merge several panels into one mesh before anything is drawn.
//
// This is the whole reason the pen went from ~50 meshes to three: an inverted-
// hull outline is added per mesh, so every bar used to cost two draws. One
// merged geometry per panel (or per wall) is one silhouette, one outline.
//
// BAR RHYTHM: three distinct weights, not one. The frame (T) reads as the
// timber that carries load; the verticals (0.62T) are the primary infill,
// running the panel's full height uninterrupted; the horizontals (0.46T) are
// the lighter cross-members threaded between them — the way a real kōshi
// lattice is actually built, heaviest members first, lightest last. The first
// pass drew both infill directions at the same 0.6T, which read as one flat
// grid with a frame around it rather than a built thing with a hierarchy.
const V_BAR = T * 0.62;
const H_BAR = T * 0.46;
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
    box(V_BAR, height, V_BAR, -width / 2 + (i / bars) * width, height / 2);
  }
  const hRows = Math.max(1, Math.round(bars * height / width));
  for (let j = 1; j < hRows; j++) {
    box(width, H_BAR, H_BAR, 0, (j / hRows) * height);
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
//
// `doors` hangs two lattice leaves on the open side's corner posts, each half
// the side wide, swung OUTWARD — the side reads as double doors somebody
// pushed open and left, rather than a wall that was never built (Frank, case
// 37: "on the open side it has the 2 panels rotating open like double doors
// pushed open"). A number swings both leaves by that angle (radians); a
// two-element array gives each leaf its own — [first corner, second corner]
// in the build's own [-1, +1] order along the side — and 0 for a leaf means
// it stands CLOSED in the wall plane, a real shut door, not a missing one
// (Frank's second pass: "only one half... partially open — it's too open
// right now"). `doors: 0` or omitted keeps the plain missing side.
export function makePen({
  size = 5.4, height = 1.9, open = '+x', panelsPerSide = 2, bars = 4, color = WASH.dark,
  doors = 0,
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

  // ---- the doors, pushed open ------------------------------------------
  // One leaf per corner post of the open side, half the side wide (the same
  // width as a wall panel at the default panelsPerSide, so the leaves read
  // as the wall's own panels unhung). Each is hinged at its post — the
  // lattice geometry is shifted so the frame's edge sits on the pivot — and
  // turned outward by `doors`.
  const doorLeaves = [];
  const doorAngles = Array.isArray(doors) ? doors : [doors, doors];
  if (doorAngles.some((a) => a > 0)) {
    const [, cx, cz] = sides.find((s) => s[0] === open);
    // the side runs along x for the z-walls and along z for the x-walls;
    // its outward normal is just the side's own centre direction
    const tx = cx === 0 ? 1 : 0, tz = cx === 0 ? 0 : 1;
    const nlen = Math.hypot(cx, cz);
    const nx = cx / nlen, nz = cz / nlen;
    const leafW = half;
    [-1, 1].forEach((s, idx) => {
      const angle = doorAngles[idx] || 0;
      const hx = cx + tx * half * s, hz = cz + tz * half * s;   // the hinge post
      // closed, the leaf reaches from its post back toward the side's middle;
      // rotation.y = a maps local +x to world (cos a, 0, -sin a)
      const closed = Math.atan2(tz * s, -tx * s);
      // OPEN IS PICKED, NOT DERIVED: of the two turns, the one whose free
      // edge lands further outward is the pushed-open one. Yaw sign
      // conventions are exactly where a hand-derivation goes quietly wrong.
      // (angle 0 collapses both candidates to `closed` — a shut leaf.)
      const swung = [closed + angle, closed - angle]
        .map((a) => ({ a, out: (hx + Math.cos(a) * leafW) * nx + (hz - Math.sin(a) * leafW) * nz }))
        .sort((p, q) => q.out - p.out)[0].a;
      const geo = latticeGeometry({ width: leafW, height, bars });
      geo.translate(leafW / 2, 0, 0);           // hinge edge at the local origin
      const leaf = new THREE.Mesh(geo, mat);
      leaf.name = 'door';
      leaf.position.set(hx, 0, hz);
      leaf.rotation.y = swung;
      g.add(leaf);
      doorLeaves.push({ hx, hz, a: swung, w: leafW });
    });
  }

  // Circles along the standing walls, for the prop keepout. Grass is left to
  // grow through a fence, as it does. World space, cave.js style: local
  // circles first, then position AND yaw applied at call time — a rotated
  // pen must not mask the wrong ground (this used to add position only;
  // latent because case 37 does not rotate its pen).
  g.footprint = (r = 0.9, per = 5) => {
    const local = [];
    for (const [name, cx, cz, rot] of sides) {
      if (name === open) continue;
      for (let i = 0; i <= per; i++) {
        const off = -half + size * (i / per);
        local.push({ x: cx + (rot ? 0 : off), z: cz + (rot ? off : 0) });
      }
    }
    // an open leaf sticks out past the pen's own square — cover its length,
    // hinge to free edge, or scatter grows a bush through a door
    for (const d of doorLeaves) {
      for (const t of [0.25, 0.6, 0.95]) {
        local.push({ x: d.hx + Math.cos(d.a) * d.w * t, z: d.hz - Math.sin(d.a) * d.w * t });
      }
    }
    const cos = Math.cos(g.rotation.y), sin = Math.sin(g.rotation.y);
    return local.map((c) => ({
      x: g.position.x + c.x * cos + c.z * sin,
      z: g.position.z - c.x * sin + c.z * cos,
      r,
    }));
  };
  g.userData.walls = walls;
  return g;
}
