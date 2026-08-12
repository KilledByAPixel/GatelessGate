import * as THREE from '../../lib/three.module.js';
import { noise2 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// Gently rolling ground that runs out into the fog — the paper takes over
// before any horizon appears. Flat near the center so staging stays level.

// Height of the ground at (x, z) — shared by scatter/paths/grass so everything
// sits on the same surface. Two octaves: broad hills that actually read as
// landform, plus a finer undulation so the slopes aren't glassy. The staging
// area inside flatRadius stays level, so hand-placed props still sit at y=0.
//
// `shore` (optional) is a coast: past a waterline the land eases down below
// sea level and stays there. dx/dz point out to sea; dist is the waterline's
// distance from the origin along that vector; the beach tapers over `width`
// landward of it, meeting the water's own y (`sea`) exactly at the line, then
// settling to `sea - depth` beyond it. One parameter object shared by the
// ground mesh, the sand ribbon and anything else that asks — so the beach is
// in one place, not several nearly-identical places.
export function groundHeight(x, z, { seed = 21, roll = 1.1, flatRadius = 9, shore = null } = {}) {
  const r = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, (r - flatRadius) / 14));
  const ease = t * t * (3 - 2 * t);
  const broad = (noise2(x * 0.035 + 7, z * 0.035 + 3, seed) - 0.4) * 2;
  const fine = (noise2(x * 0.11 + 19, z * 0.11 + 5, seed + 3) - 0.5) * 0.5;
  const base = (broad * roll * 2.2 + fine * roll) * ease;
  if (!shore) return base;

  const { dx = 0, dz = -1, dist = 8, width = 4, sea = -0.35, depth = 1.4 } = shore;
  const s = x * dx + z * dz - dist;              // metres seaward of the waterline
  if (s <= -width) return base;                  // dry land, untouched
  const smooth = (u) => u * u * (3 - 2 * u);
  if (s <= 0) {                                  // the beach: land blends down to the sea
    const u = smooth((s + width) / width);
    return base * (1 - u) + sea * u;
  }
  // under water: the bed keeps easing down, then runs flat — hills would poke
  // up through the sheet out there, so past the waterline the base terrain
  // has no say at all
  return sea - depth * smooth(Math.min(1, s / (width * 1.5)));
}

export function makeGround({ size = 150, seed = 21, roll = 1.1, flatRadius = 9, color = WASH.ground, segments = 96, shore = null } = {}) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i), { seed, roll, flatRadius, shore }));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toonMaterial({ color }));
  mesh.name = 'ground';
  return mesh;
}
