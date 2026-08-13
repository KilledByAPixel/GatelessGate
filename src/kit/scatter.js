import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';
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
  let tries = 0;
  while (pts.length < count && tries < count * 12) {
    tries++;
    const a = hash1(tries * 3 + 1, seed) * Math.PI * 2;
    const r = rMin + Math.sqrt(hash1(tries * 3 + 2, seed)) * (rMax - rMin);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    pts.push({ x, z, u: hash1(tries * 3 + 3, seed) });
  }
  return pts;
}

function instanced(geo, color, pts, { yOf, scaleOf, tintSpread = 0.06, sink = 0 }) {
  const mat = washMaterial({ color, flat: true });
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
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

// A shrub is 2-3 lobes grown together, not a five-lobe cluster that averages
// out toward a smoothed sphere at the size a bush actually reads. A shrub
// wants its lobes legible as lobes. Lobe
// count is itself seeded (2 or 3), and each lobe is bigger than the old
// five-lobe version's so the whole clump keeps a similar footprint with
// fewer, chunkier masses.
function bushGeometry(seed = 1) {
  const parts = [];
  const N = hash1(seed * 13 + 1, seed) < 0.5 ? 2 : 3;
  for (let i = 0; i < N; i++) {
    const d = new THREE.DodecahedronGeometry(0.34 * (0.75 + 0.5 * hash1(i * 6 + 1, seed)), 0);
    d.scale(1.15, 0.85, 1.15);
    const a = (i / N) * Math.PI * 2 + hash1(i * 6 + 2, seed) * 1.4;
    const rad = i === 0 ? 0 : 0.26 * (0.6 + hash1(i * 6 + 3, seed));
    d.translate(Math.cos(a) * rad, 0.16 + 0.22 * hash1(i * 6 + 4, seed), Math.sin(a) * rad);
    parts.push(d);
  }
  return mergeSimple(parts);
}

export function makeRocks({ count = 12, seed = 51, groundSeed = 21, keepout = [], rMin = 4, rMax = 24, color = WASH.stone } = {}) {
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

export function makeBushes({ count = 9, seed = 61, groundSeed = 21, keepout = [], rMin = 4, rMax = 22, color = WASH.dark } = {}) {
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

// ONE rock, hand-sized: the same lump-cluster geometry the instanced scatter
// draws, built as a single mesh so a case can stage a boulder on purpose.
export function makeBoulder({ size = 1.0, seed = 1, color = WASH.stone } = {}) {
  const mesh = new THREE.Mesh(rockGeometry(seed), washMaterial({ color, flat: true }));
  mesh.name = 'boulder';
  // the scatter's own seeded y-squash, so no two boulders share a silhouette
  mesh.scale.set(size, size * (0.8 + 0.4 * hash1(seed * 7 + 5, 9)), size);
  return mesh;
}

// (makeGrass — the old clump-scatter tufts — lived here until the cleanup
// pass found nothing using it: the meadow is makeTuftField's job now, with
// the grass field's own placement pass, and only this file's own test kept
// it green. Deleted outright rather than kept-on-purpose like makeTemple; the
// tuft construction it pioneered survives in tuftfield.js.)

// Minimal non-indexed geometry merge (position + normal only) — enough for
// lit props without pulling in the BufferGeometryUtils addon.
//
// `extras` is an optional map of PER-PART scalars to spread across that part's
// vertices: { aSway: [0.1, 0.4, ...] }, one number per geometry in `geos`, out
// as a 1-component float attribute. It exists because a merged mesh has no
// parts any more — the merge is the whole point, and it is also what destroys
// the ability to move one branch — so the identity a vertex shader needs has to
// be baked in at merge time, while the caller still knows which geometry was
// which. Callers that pass nothing get exactly the buffer they always did.
export function mergeSimple(geos, extras = null) {
  // already-merged geometries come in non-indexed; re-converting them only logs
  // a warning, so skip it (lattice panels merge, then walls merge those again)
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const names = extras ? Object.keys(extras) : [];
  const spread = {};
  for (const n of names) {
    if (extras[n].length !== geos.length) {
      throw new Error(`mergeSimple: extras.${n} has ${extras[n].length} values for ${geos.length} geometries`);
    }
    spread[n] = new Float32Array(total);
  }
  let o = 0;
  for (let i = 0; i < nonIndexed.length; i++) {
    const g = nonIndexed[i];
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (const name of names) spread[name].fill(extras[name][i], o, o + n);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  for (const name of names) out.setAttribute(name, new THREE.BufferAttribute(spread[name], 1));
  return out;
}
