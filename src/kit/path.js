import * as THREE from '../../lib/three.module.js';
import { noise1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { groundHeight } from './ground.js';
import { WASH } from '../palette.js';

// A dirt path: a gently wandering ribbon laid on the ground, slightly darker
// than the soil. Draped over the rolling terrain via groundHeight.
//
// THE ENDING IS A BRUSHSTROKE. The road audit found nearly every road in
// the book stopping square-ended at r≈18, in plain meadow, well before the
// fog (Frank: "it ends abruptly in a lot of these") — so by default the far
// end now TAPERS to a point over its last stretch, the way ink thins when
// the brush lifts: the road reads as continuing beyond what is drawn.
// `taper: 0` restores the square end. `via` bends the centerline (a
// quadratic through one control point) for the roads that would otherwise
// run straight at a mountain — "it could kinda curve away".
export function makePath({
  from = [0, 8], to = [0, -30], width = 1.4, seed = 91, groundSeed = 21,
  wander = 1.6, samples = 26, color = WASH.stone,
  via = null, taper = 0.3,
  // The surface the ribbon drapes over. Default is the plain rolling ground
  // (bit-identical to always); a case whose terrain is reshaped — k48's
  // shored beach — passes its own, or the road's last stretch stands on the
  // unshored height and pokes up over the dip like a tent.
  groundFn = null,
} = {}) {
  const groundAt = groundFn || ((x, z) => groundHeight(x, z, { seed: groundSeed }));
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = via
      ? (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * via[0] + t * t * to[0]
      : from[0] + (to[0] - from[0]) * t;
    const z = via
      ? (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * via[1] + t * t * to[1]
      : from[1] + (to[1] - from[1]) * t;
    // lateral wander, pinned at both ends
    const sway = (noise1(t * 3.2, seed) - 0.5) * 2 * wander * Math.sin(Math.PI * t);
    pts.push([x + sway, z]);
  }
  const positions = new Float32Array((samples + 1) * 2 * 3);
  const indices = [];
  for (let i = 0; i <= samples; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(samples, i + 1)];
    // perpendicular of the local direction
    let dx = nx - px, dz = nz - pz;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    let w = width / 2 * (0.85 + 0.3 * noise1(i * 0.7, seed + 5));
    if (taper > 0) {
      const t = i / samples;
      if (t > 1 - taper) {
        const s = (1 - t) / taper;               // 1 at taper start -> 0 at the tip
        // floor at a hair's width: a true point makes degenerate faces whose
        // normals go NaN in computeVertexNormals
        w *= Math.max(0.03, s * s * (3 - 2 * s));
      }
    }
    const lx = x - dz * w, lz = z + dx * w;
    const rx = x + dz * w, rz = z - dx * w;
    const yl = groundAt(lx, lz) + 0.03;
    const yr = groundAt(rx, rz) + 0.03;
    positions.set([lx, yl, lz, rx, yr, rz], i * 6);
    if (i < samples) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, c, b, b, c, d);   // wound counter-clockwise from above
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = toonMaterial({ color });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'path';
  mesh.userData.noOutline = true; // a worn track, not a contour

  // sample the centerline at t∈[0,1] so props (gate, lanterns) sit ON the path.
  // `heading` is a rotation.y that aligns a gate's opening along the trail;
  // `perp` is the unit left-vector across the path for flanking things.
  mesh.sample = (t) => {
    const f = Math.max(0, Math.min(1, t)) * samples;
    const i = Math.min(Math.floor(f), samples - 1);
    const frac = f - i;
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const x = x0 + (x1 - x0) * frac;
    const z = z0 + (z1 - z0) * frac;
    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return {
      x, z,
      y: groundAt(x, z),
      heading: Math.atan2(dx, dz),      // gate.rotation.y so you pass through it
      perp: { x: -dz, z: dx },          // unit across-path (left) for flanking
    };
  };
  // A chain of keepout circles following the trail, for scatter/grass masks.
  // A path is a ribbon, so a couple of circles cannot mask it — without this,
  // grass grows straight through the road.
  mesh.keepout = (count = 24, r = width * 0.8) => {
    const out = [];
    for (let i = 0; i <= count; i++) {
      const p = mesh.sample(i / count);
      out.push({ x: p.x, z: p.z, r });
    }
    return out;
  };

  return mesh;
}
