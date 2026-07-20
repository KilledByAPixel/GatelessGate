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

// A boulder is a few lumps grown together, not one smooth blob. Merged, so the
// whole scatter is still a single instanced draw.
function rockGeometry(seed = 1) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.DodecahedronGeometry(0.45 * (0.58 + 0.5 * hash1(i * 7 + 1, seed)), 0);
    d.scale(1, 0.62 + 0.32 * hash1(i * 7 + 2, seed), 1);
    d.rotateY(hash1(i * 7 + 3, seed) * Math.PI);
    d.rotateZ((hash1(i * 7 + 4, seed) - 0.5) * 0.7);
    d.translate(
      (hash1(i * 7 + 5, seed) - 0.5) * 0.48,
      hash1(i * 7 + 6, seed) * 0.10,
      (hash1(i * 7 + 7, seed) - 0.5) * 0.48,
    );
    parts.push(d);
  }
  return mergeSimple(parts);
}

// A shrub is a cluster of lobes around a centre, so it breaks the silhouette
// instead of reading as one squashed sphere.
function bushGeometry(seed = 1) {
  const parts = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const d = new THREE.DodecahedronGeometry(0.30 * (0.7 + 0.6 * hash1(i * 6 + 1, seed)), 0);
    d.scale(1.12, 0.82, 1.12);
    const a = (i / N) * Math.PI * 2 + hash1(i * 6 + 2, seed) * 1.2;
    const rad = i === 0 ? 0 : 0.30 * (0.5 + hash1(i * 6 + 3, seed));
    d.translate(Math.cos(a) * rad, 0.16 + 0.24 * hash1(i * 6 + 4, seed), Math.sin(a) * rad);
    parts.push(d);
  }
  return mergeSimple(parts);
}

export function makeRocks({ count = 12, seed = 51, groundSeed = 21, keepout = [], rMin = 4, rMax = 24, color = '#A8A296' } = {}) {
  const pts = scatterPoints({ count, rMin, rMax, seed, keepout });
  const geo = rockGeometry(seed);
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
  const geo = bushGeometry(seed);
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
  // one tuft = blades splaying OUTWARD from a shared base (a patch, not a teepee).
  // each blade pivots at its base (y=0) and leans away from center.
  const blades = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const b = new THREE.ConeGeometry(0.03, 0.34, 3, 1, true); // open-ended: no base cap
    b.translate(0, 0.17, 0);                 // base at origin so rotation pivots there
    b.rotateZ(0.55 + 0.2 * ((i * 5) % 3));    // tilt away from vertical (~31–43°)
    b.rotateY((i / N) * Math.PI * 2 + 0.4);   // spread the lean around the compass
    blades.push(b);
  }
  const stub = new THREE.ConeGeometry(0.03, 0.3, 3, 1, true);
  stub.translate(0, 0.15, 0); stub.rotateZ(0.1); // one near-upright blade at the middle
  blades.push(stub);
  const merged = mergeSimple(blades);
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
export function mergeSimple(geos) {
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
