import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { groundHeight } from './ground.js';

// Ground dressing, each kind as ONE InstancedMesh (a single draw call):
// rocks, bushes, grass tufts. Placement is seeded, ring-shaped, and respects
// keepout circles so props never crowd the staging or a path.

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// Deterministically place `count` items in an annulus, avoiding keepouts.
export function scatterPoints({ count, rMin = 4, rMax = 24, seed = 1, keepout = [] } = {}) {
  const pts = [];
  let i = 0, tries = 0;
  while (pts.length < count && tries < count * 12) {
    tries++;
    const a = hash1(tries * 3 + 1, seed) * Math.PI * 2;
    const r = rMin + Math.sqrt(hash1(tries * 3 + 2, seed)) * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    pts.push({ x, z, u: hash1(tries * 3 + 3, seed) });
    i++;
  }
  return pts;
}

function instanced(geo, color, pts, { yOf, scaleOf, tintSpread = 0.06, sink = 0 }) {
  const mat = toonMaterial({ color, flat: true });
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  mesh.userData.noOutline = true;
  pts.forEach((pt, i) => {
    const sc = scaleOf(pt.u);
    _p.set(pt.x, (yOf ? yOf(pt) : 0) - sink * sc, pt.z);
    _e.set(0, pt.u * Math.PI * 2, 0);
    _q.setFromEuler(_e);
    _s.set(sc, sc * (0.8 + 0.4 * hash1(i * 7 + 5, 9)), sc);
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
    _c.set(color).offsetHSL(0, 0, (pt.u - 0.5) * tintSpread);
    mesh.setColorAt(i, _c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function makeRocks({ count = 12, seed = 51, groundSeed = 21, keepout = [], rMin = 4, rMax = 24, color = '#A8A296' } = {}) {
  const pts = scatterPoints({ count, rMin, rMax, seed, keepout });
  const geo = new THREE.DodecahedronGeometry(0.45, 0);
  geo.scale(1, 0.7, 1);
  const mesh = instanced(geo, color, pts, {
    yOf: (pt) => groundHeight(pt.x, pt.z, { seed: groundSeed }),
    scaleOf: (u) => 0.35 + 1.1 * u * u,   // many small, a few boulders
    sink: 0.12,
  });
  mesh.name = 'rocks';
  return mesh;
}

export function makeBushes({ count = 9, seed = 61, groundSeed = 21, keepout = [], rMin = 4, rMax = 22, color = '#4E4F49' } = {}) {
  const pts = scatterPoints({ count, rMin, rMax, seed, keepout });
  const geo = new THREE.DodecahedronGeometry(0.55, 0);
  geo.scale(1.25, 0.62, 1);
  const mesh = instanced(geo, color, pts, {
    yOf: (pt) => groundHeight(pt.x, pt.z, { seed: groundSeed }),
    scaleOf: (u) => 0.55 + 0.8 * u,
    sink: 0.1,
    tintSpread: 0.08,
  });
  mesh.name = 'bushes';
  return mesh;
}

export function makeGrass({ count = 150, seed = 81, groundSeed = 21, keepout = [], rMin = 1.5, rMax = 20, color = '#AFAA90' } = {}) {
  const pts = scatterPoints({ count, rMin, rMax, seed, keepout });
  // one tuft = three thin crossed blades, merged into a single geometry
  const blade = new THREE.ConeGeometry(0.035, 0.42, 3);
  blade.translate(0, 0.21, 0);
  const g0 = blade;
  const g1 = blade.clone(); g1.rotateY(2.1); g1.rotateZ(0.22); g1.translate(0.05, 0, 0);
  const g2 = blade.clone(); g2.rotateY(4.2); g2.rotateZ(-0.2); g2.translate(-0.04, 0, 0.03);
  const merged = mergeSimple([g0, g1, g2]);
  const mesh = instanced(merged, color, pts, {
    yOf: (pt) => groundHeight(pt.x, pt.z, { seed: groundSeed }),
    scaleOf: (u) => 0.6 + 0.9 * u,
    sink: 0.02,
    tintSpread: 0.04,
  });
  mesh.name = 'grass';
  return mesh;
}

// Minimal non-indexed geometry merge (position + normal only) — enough for
// toon-shaded props without pulling in the BufferGeometryUtils addon.
function mergeSimple(geos) {
  const nonIndexed = geos.map((g) => g.toNonIndexed());
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
