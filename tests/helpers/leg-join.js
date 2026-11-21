// Where a quadruped's leg goes into its trunk: does the trunk stand out over
// the leg there? Shared by tests/leg-join.test.js and
// scripts/dev/leg-join-probe.js.
//
// THE LIP. A leg's surface crosses into the trunk's along a line. Just above
// that line the leg is inside the trunk, and the trunk's own surface is
// somewhere outside the leg's. If the two surfaces run on into each other —
// flush, or the trunk turning away at a soft crease — the trunk's surface
// stands only a little outside the leg's plane a short way up. If instead the
// trunk's faces there turn under (a lower side corner hanging out past the
// leg), the trunk stands well out of the leg's plane right above the line:
// the underside of those faces is a thin dark band the length of the join,
// with the leg's surface stepping in under it. That band is what is measured.
//
// For every point on the crossing line, step DELTA up from it and walk
// outward along the leg's own horizontal face normal while still inside the
// trunk: how far the walk gets is how far the trunk stands proud of the leg
// there. Reported per leg and per face of the leg — `outer` (facing out
// across, where the lip was), `ahead` and `behind` — as the worst, x
// height, and the lip's slope, proud / DELTA: 1 is a trunk surface leaning
// out at half a right angle from the leg's, and a flush join is near 0.
// Ahead of a front leg and behind a hind one the trunk runs on as the
// breast or the belly, so those two read high by construction: they are
// printed by the probe, not held by the test.
//
// THE TAB is the opposite fault (legExposure): the leg standing outside the
// trunk at the join, its top showing as a lit plate. Area of leg surface
// outside the trunk within BAND under the trunk's own underside, facing up
// and facing down, x 1e4 / height^2.
import * as THREE from '../../lib/three.module.js';
import { meshesOf } from './mirror.js';
import { under } from '../../src/kit/quadruped.js';

// how far above the crossing the trunk is read, x height
export const DELTA = 0.012;
const SUB = 6;

export function insideOf(tris) {
  // one skew ray, parity of crossings (as quadruped.js's own inTrunk)
  const d = new THREE.Vector3(0.5377, 0.8011, 0.2618).normalize();
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const box = new THREE.Box3();
  for (const t of tris) for (const v of t) box.expandByPoint(v);
  return (p) => {
    if (!box.containsPoint(p)) return false;
    ray.set(p, d);
    let n = 0;
    for (const [a, b, c] of tris) if (ray.intersectTriangle(a, b, c, false, hit)) n++;
    return n % 2 === 1;
  };
}

// The crossing points of one leg mesh's surface with the trunk, each with the
// leg's face normal there.
function crossings(leg, inside, top) {
  const out = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
  const pt = (p, i, j) => p[0].clone().addScaledVector(A, i / SUB).addScaledVector(B, j / SUB);
  for (const tri of leg.tris) {
    if (Math.max(tri[0].y, tri[1].y, tri[2].y) < top) continue;
    A.subVectors(tri[1], tri[0]); B.subVectors(tri[2], tri[0]); N.crossVectors(A, B);
    if (N.length() < 1e-12) continue;
    N.normalize();
    const grid = new Map();
    const at = (i, j) => {
      const k = i * 64 + j;
      if (!grid.has(k)) { const p = pt(tri, i, j); grid.set(k, { p, in: inside(p) }); }
      return grid.get(k);
    };
    const seen = new Set();
    const edge = (i0, j0, i1, j1) => {
      const k = [i0, j0, i1, j1].join(',');
      if (seen.has(k)) return;
      seen.add(k);
      const a = at(i0, j0), b = at(i1, j1);
      if (a.in === b.in) return;
      let lo = a.p.clone(), hi = b.p.clone();
      if (a.in) [lo, hi] = [hi, lo];                       // lo out, hi in
      for (let s = 0; s < 14; s++) {
        const m = lo.clone().lerp(hi, 0.5);
        if (inside(m)) hi = m; else lo = m;
      }
      out.push({ p: lo, n: N.clone() });
    };
    for (let i = 0; i < SUB; i++) for (let j = 0; i + j < SUB; j++) {
      edge(i, j, i + 1, j); edge(i, j, i, j + 1); edge(i + 1, j, i, j + 1);
    }
  }
  return out;
}

// Per leg mesh of the animal under `root`: { side, front, worst, slope, at }.
// `worst` is the most the trunk stands proud of the leg DELTA above the
// crossing, x height; `slope` that over DELTA; `at` where.
export function legJoins(root) {
  const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  const ms = meshesOf(root);
  const body = ms.find((m) => m.name === 'body');
  const inside = insideOf(body.tris);
  const legs = ms.filter((m) => m.name === 'leg');
  const zMid = (Math.max(...legs.map((l) => l.centre.z)) + Math.min(...legs.map((l) => l.centre.z))) / 2;
  const up = new THREE.Vector3(0, DELTA * h, 0);
  const step = 0.0005 * h, far = 0.12 * h;
  return legs.map((leg) => {
    const side = Math.sign(leg.centre.x);
    const face = { outer: [], front: [], back: [] };
    for (const { p, n } of crossings(leg, inside, body.box.min.y)) {
      const o = new THREE.Vector3(n.x, 0, n.z);
      if (o.length() < 0.3) continue;                      // a face looking up or down
      o.normalize();
      const k = o.x * side > 0.6 ? 'outer' : o.z > 0.6 ? 'front' : o.z < -0.6 ? 'back' : null;
      if (!k) continue;
      const q = p.clone().add(up);
      let s = 0;
      if (inside(q)) while (s < far && inside(q.clone().addScaledVector(o, s + step))) s += step;
      face[k].push({ s: s / h, at: q });
    }
    const sum = (list) => {
      const w = list.reduce((m, e) => (e.s > m.s ? e : m), { s: 0, at: null });
      return { worst: w.s, slope: w.s / DELTA, at: w.at, count: list.length };
    };
    return { side: side > 0 ? '+x' : '-x', front: leg.centre.z > zMid, outer: sum(face.outer), ahead: sum(face.front), behind: sum(face.back) };
  });
}

// how far below the trunk's own underside, at the same spot, a sample still
// counts as at the join, x height
export const BAND = 0.04;

// Per leg mesh: { side, front, up, upWorst, down } — see THE TAB.
export function legExposure(root, band = BAND) {
  const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  const ms = meshesOf(root);
  const body = ms.find((m) => m.name === 'body');
  const inside = insideOf(body.tris);
  const legs = ms.filter((m) => m.name === 'leg');
  const zMid = (Math.max(...legs.map((l) => l.centre.z)) + Math.min(...legs.map((l) => l.centre.z))) / 2;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3(), c = new THREE.Vector3();
  return legs.map((leg) => {
    let up = 0, down = 0, upWorst = 0;
    for (const [p, q, r] of leg.tris) {
      A.subVectors(q, p); B.subVectors(r, p); N.crossVectors(A, B);
      const area = N.length() / 2;
      if (area < 1e-12) continue;
      N.normalize();
      // a sample grid on the triangle, each standing for an equal share
      let out = 0, tot = 0;
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4 - i; j++) {
        const u = (i + 1 / 3) / 5.33, v = (j + 1 / 3) / 5.33;
        c.copy(p).addScaledVector(A, u).addScaledVector(B, v);
        if (c.y < under(body.tris, c.x, c.z) - band * h) continue;
        tot++;
        if (!inside(c)) out++;
      }
      if (!tot || !out) continue;
      const exp = area * out / 15;
      if (N.y > 0.25) { up += exp * N.y; upWorst = Math.max(upWorst, N.y); } else if (N.y < -0.25) down += exp * -N.y;
    }
    const k = 1e4 / (h * h);
    return { side: leg.centre.x > 0 ? '+x' : '-x', front: leg.centre.z > zMid, up: up * k, upWorst, down: down * k };
  });
}
