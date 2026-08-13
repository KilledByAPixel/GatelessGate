import * as THREE from '../../lib/three.module.js';
import { noise1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
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
  via = null, taper = 0.45,
  // The surface the ribbon drapes over. Default is the plain rolling ground
  // (bit-identical to always); a case whose terrain is reshaped — k48's
  // shored beach — passes its own, or the road's last stretch stands on the
  // unshored height and pokes up over the dip like a tent.
  groundFn = null,
} = {}) {
  const groundAt = groundFn || ((x, z) => groundHeight(x, z, { seed: groundSeed }));
  // The stroke's width factor at t: 1 along the body, thinning through the
  // tail. ONE function, shared by the ribbon and keepout() below, because the
  // two used to disagree: the ribbon tapered and the mask did not, so every
  // road ended in a full-width bald strip of cleared grass around a
  // hair-thin tip (Frank: "the path tapers at the end, but the grass keepout
  // does not taper... it looks kinda weird"). See the curve's own comment in
  // the ribbon loop for why it is mostly-linear rather than a smoothstep.
  const taperAt = (t) => {
    if (taper <= 0 || t <= 1 - taper) return 1;
    const s = (1 - t) / taper;               // 1 at taper start -> 0 at the tip
    const ss = s * s * (3 - 2 * s);
    return Math.max(0.03, 0.3 * ss + 0.7 * s);
  };
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
    // A LONG THIN TAIL, not a sudden point (Frank: "the road tapers too
    // quickly at its ends"). Smoothstep alone was the wrong curve for a
    // brush lift: near the tip it behaves like 3s², so four fifths of the
    // taper stayed at almost full width and the whole narrowing crammed
    // into the last fifth — which reads as the road being cut off, the
    // very thing the taper was added to avoid. Mixing it mostly-linear
    // (taperAt above) triples the width through the tail, so the stroke
    // thins steadily over its whole run and ends in a fine line. The
    // smoothstep share is what keeps a little softness at the taper's
    // START, where a purely linear ramp would leave a faint crease across
    // the road. The 0.03 floor is a hair's width: a true point makes
    // degenerate faces whose normals go NaN in computeVertexNormals.
    const w = width / 2 * (0.85 + 0.3 * noise1(i * 0.7, seed + 5)) * taperAt(i / samples);
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
  const mat = washMaterial({ color });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'path';

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
  //
  // THE CHAIN TAPERS THE WAY THE STROKE DOES, and that takes BOTH knobs. The
  // first fix scaled only the radii (Frank: "the grass keepout does not
  // taper... it looks kinda weird") and was wrong in the other direction
  // (Frank again: "grass appearing on top of the road in the tapered area"):
  // a chain of circles only masks a ribbon because neighbours OVERLAP, and
  // the caller's spacing is tuned so full-size circles barely do — shrink
  // the radii in place and the chain comes apart mid-taper, with grass in
  // the gaps between beads. Self-similar is the rule: through the tail the
  // circles get smaller AND proportionally closer together (step ≈ 1.1× the
  // local radius, the same ratio the full-size body chain runs at), so every
  // stretch of the narrowing stroke is covered by the same geometry that
  // covers its body. The radius floor keeps the march finite; at that size
  // the ribbon is a hair and the cleared verge with it.
  mesh.keepout = (count = 24, r = width * 0.8) => {
    let L = 0;   // chain length, for converting a world step to a t step
    for (let i = 1; i <= samples; i++) {
      L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    const radiusAt = (t) => r * Math.max(taperAt(t), 0.12);
    const bodyStep = L / count;              // the caller's own density
    const out = [];
    let t = 0;
    while (t < 1) {
      const p = mesh.sample(t);
      const rr = radiusAt(t);
      out.push({ x: p.x, z: p.z, r: rr });
      t += Math.min(bodyStep, 1.1 * rr) / L;
    }
    const tip = mesh.sample(1);
    out.push({ x: tip.x, z: tip.z, r: radiusAt(1) });
    return out;
  };

  return mesh;
}
