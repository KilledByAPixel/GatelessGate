import * as THREE from '../../lib/three.module.js';

// ONE HEAD, occiput to nose. A ball skull with a muzzle part stuck on its
// front is a toy's head however good the body under it is: the ball's front
// shows as a step above the muzzle, and the two parts never share a line. So a
// head is a single closed loft whose side profile is stated outright — the
// same cut as the trunk in quadruped.js, and for the same reason.
//
// `rows` run from the back of the skull to the nose, each
//
//   [z, top, bottom, halfWidth]
//
// in the caller's own unit (`unit` scales them — pass the animal's height),
// measured from the head's ORIGIN: the point the quadruped plan calls the head
// centre, which is where the neck's last ring is centred. So the rows say
// where the skull sits around the end of the neck, and a species that wants
// the neck to enter low at the back of the head writes its rows high and
// forward of zero. +z is out the nose, +y is up.
//
// Each ring is an ellipse standing across the head with a vertex at its top
// and at its bottom, so the two outlines the rows were written from are
// exactly the outlines the mesh has: the STOP is a drop in `top` between two
// rows, the jaw line is `bottom`, and nothing has to be eyeballed through a
// facet. Both ends are fanned shut (`back`, `nose` are [y, z] apexes), so the
// mesh is closed and a point-in-mesh probe works on it.
export function skullGeometry(rows, { unit = 1, seg = 8, back, nose } = {}) {
  const pos = [], idx = [];
  for (const [z, top, bot, w] of rows) {
    const cy = (top + bot) / 2, ay = (top - bot) / 2;
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(t) * w * unit, (cy + Math.sin(t) * ay) * unit, z * unit);
    }
  }
  const last = rows.length - 1;
  for (let i = 0; i < last; i++) {
    const a = i * seg, b = a + seg;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const first = rows[0], end = rows[last];
  const b0 = back ?? [(first[1] + first[2]) / 2, first[0]];
  const n0 = nose ?? [(end[1] + end[2]) / 2, end[0]];
  const p0 = pos.length / 3;
  pos.push(0, b0[0] * unit, b0[1] * unit);
  for (let j = 0; j < seg; j++) idx.push(p0, (j + 1) % seg, j);
  const p1 = pos.length / 3;
  pos.push(0, n0[0] * unit, n0[1] * unit);
  for (let j = 0; j < seg; j++) idx.push(p1, last * seg + j, last * seg + (j + 1) % seg);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
