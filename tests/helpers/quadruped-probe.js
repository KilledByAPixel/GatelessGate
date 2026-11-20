import * as THREE from '../../lib/three.module.js';

// Probes for reading a quadruped's SILHOUETTE off its meshes, shared by the
// tests that pin the body plan and the ones that pin a species on top of it.
// Everything works in world space on whatever was built, so a test holds
// whichever construction produced the shape.
//
// `sectionY` is exact: the y-extent of a set of triangles where the plane
// z = const cuts them, taken from the edges that cross it — one column of the
// side profile, with no sampling density to tune. `legClouds` hands back each
// leg's vertices, split by side so a species that merges a pair into one mesh
// still yields four.

export function triangles(root, pick) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !pick(o)) return;
    const p = o.geometry.getAttribute('position');
    const idx = o.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld);
        tri.push(v.x, v.y, v.z);
      }
      out.push(tri);
    }
  });
  return out;
}

export function sectionY(tris, z) {
  let min = Infinity, max = -Infinity;
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      const za = t[a + 2], zb = t[b + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const y = t[a + 1] + (t[b + 1] - t[a + 1]) * ((z - za) / (zb - za));
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return { min, max, depth: max - min };
}

export function legClouds(root) {
  root.updateMatrixWorld(true);
  const clouds = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (o.name !== 'leg') return;
    const sides = { L: [], R: [] };
    // A mesh standing on the centreline is a merged pair and splits by side; a
    // mesh standing off it is one leg, however far its thigh reaches across.
    const pair = Math.abs(o.getWorldPosition(v).x) < 1e-6;
    o.traverse((m) => {                               // a jointed leg may carry its lower half as a child
      if (!m.isMesh) return;
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        (pair && v.x < 0 ? sides.L : sides.R).push(v.clone());
      }
    });
    for (const pts of Object.values(sides)) if (pts.length) clouds.push(pts);
  });
  return clouds;
}

// Where the legs leave the body, fore and aft. A leg standing off the
// centreline says so itself: its mesh origin is its join. A merged pair has no
// such origin, and is read off the z of its topmost vertices instead. The span
// between the two ends is the animal's own trunk, whatever overhangs it.
export function trunk(root) {
  root.updateMatrixWorld(true);
  const at = new THREE.Vector3();
  const tops = [];
  root.traverse((o) => {
    // a leg may hang ahead of or behind its own section; the trunk is the sections
    if (o.name === 'leg' && Math.abs(o.getWorldPosition(at).x) > 1e-6) tops.push(at.z - (o.userData.setZ || 0));
  });
  if (tops.length < 4) tops.length = 0;
  if (!tops.length) for (const pts of legClouds(root)) {
    const hi = Math.max(...pts.map((p) => p.y)), lo = Math.min(...pts.map((p) => p.y));
    const top = pts.filter((p) => p.y > hi - 0.1 * (hi - lo));
    tops.push(top.reduce((s, p) => s + p.z, 0) / top.length);
  }
  const zHind = Math.min(...tops), zFront = Math.max(...tops);
  return { zHind, zFront, span: zFront - zHind };
}

// Is a point inside a closed set of triangles? Parity of crossings along one
// ray. The direction is deliberately skew, so it does not run along a facet or
// through a shared edge of a body built from axis-aligned rings. It is NOT the
// ray quadruped.js's own inTrunk casts: a ray that grazed an edge would fool
// both the same way, and the probe would agree with the code it checks.
export function inside(tris, p) {
  const d = [-0.4136, 0.7259, 0.5497];
  let hits = 0;
  for (const t of tris) {
    const e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]];
    const e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(a) < 1e-12) continue;
    const s = [p.x - t[0], p.y - t[1], p.z - t[2]];
    const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / a;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / a;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / a > 1e-9) hits++;
  }
  return hits % 2 === 1;
}

// THE LEG RULE, as a test: a body narrows toward its sides, so a leg sized to
// the body's lowest point hangs in the air at the hip. Every leg's join — its
// mesh origin, which is the centre of the ring the limb hangs from — must lie
// INSIDE the body, and its foot must reach the ground. `ok` is the caller's
// assert.ok, so the message lands in that test.
export function legsJoinBody(root, label, ok, ground = 0.02) {
  const body = triangles(root, (o) => o.name === 'body');
  const legs = [];
  root.traverse((o) => { if (o.name === 'leg') legs.push(o); });
  ok(legs.length === 4, `${label} has four legs (${legs.length})`);
  const box = new THREE.Box3();
  for (const leg of legs) {
    const at = leg.getWorldPosition(new THREE.Vector3());
    ok(inside(body, at),
      `${label} leg joins inside the body: (${at.x.toFixed(3)}, ${at.y.toFixed(3)}, ${at.z.toFixed(3)})`);
    box.setFromObject(leg, true);
    ok(box.min.y < ground, `${label} leg reaches the ground: ${box.min.y.toFixed(4)}`);
  }
}
