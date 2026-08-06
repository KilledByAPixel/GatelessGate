import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// The peak layout as a pure fact: where each mountain stands and how far its
// base reaches. composeWorld asks this to keep scatter trees out of the rock,
// and the road audit asks it to see what a road is aimed at. makeMountains
// consumes THIS function — the math lives once, so mesh and footprint can
// never drift. The hash streams (i*5+1..4) are the shipped ones; changing
// them moves every mountain in the book.
export function mountainFootprints({
  count = 7, distance = 46, arcCenter = 0, arcSpan = 2.8, seed = 31, hScale = 1,
} = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = arcCenter + (hash1(i * 5 + 1, seed) - 0.5) * arcSpan;
    const d = distance * (0.85 + 0.35 * hash1(i * 5 + 2, seed));
    const h = (9 + 13 * hash1(i * 5 + 3, seed)) * hScale;
    const r = h * (0.9 + 0.7 * hash1(i * 5 + 4, seed));
    out.push({ x: Math.sin(a) * d, z: -Math.cos(a) * d, r, h });
  }
  return out;
}

// Distant mountains: an arc of big faceted cones behind the scene, washed by
// the fog into layered ink silhouettes. Call twice (far light band, nearer
// darker band) for depth. Faces the -z direction the compositions look toward.
export function makeMountains({
  count = 7, distance = 46, arcCenter = 0, arcSpan = 2.8, seed = 31,
  color = WASH.mist, hScale = 1,
} = {}) {
  const g = new THREE.Group();
  g.name = 'mountains';
  const mat = toonMaterial({ color, flat: true });
  const feet = mountainFootprints({ count, distance, arcCenter, arcSpan, seed, hScale });
  for (let i = 0; i < count; i++) {
    const { x: px, z: pz, r, h } = feet[i];
    const sides = 5 + Math.floor(hash1(i * 5 + 5, seed) * 3);
    const geo = new THREE.ConeGeometry(r, h, sides, 3);

    // Push the slopes in and out per facet-column so the silhouette breaks into
    // ridges and gullies instead of reading as a perfect cone. The displacement
    // fades to nothing at the base and the apex, so peaks stay sharp and the
    // mountain still sits flat on the ground.
    const pos = geo.attributes.position;
    for (let vi = 0; vi < pos.count; vi++) {
      const x = pos.getX(vi), y = pos.getY(vi), z = pos.getZ(vi);
      const rad = Math.hypot(x, z);
      if (rad < 1e-4) continue;                                  // leave the apex alone
      const t = (y + h / 2) / h;                                 // 0 at the base, 1 at the apex
      const ang = Math.atan2(z, x);
      const colIdx = Math.round(((ang + Math.PI) / (2 * Math.PI)) * sides) % sides;
      const ring = Math.round(t * 3);
      const n = hash1(colIdx * 17 + ring * 5 + i * 101, seed) - 0.5;
      const k = 1 + n * 0.38 * Math.sin(Math.PI * t);
      pos.setX(vi, x * k);
      pos.setZ(vi, z * k);
    }
    geo.computeVertexNormals();

    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, h / 2 - 1.5, pz); // base sunk below the ground roll
    m.rotation.y = hash1(i * 7 + 6, seed) * Math.PI;
    m.rotation.z = (hash1(i * 7 + 8, seed) - 0.5) * 0.10;          // no peak stands perfectly plumb
    m.name = 'mountain';
    m.userData.noOutline = true; // silhouettes are washes, not contours
    m.userData.footprint = { x: px, z: pz, r };   // self-describing, for the scene nets
    g.add(m);
  }
  return g;
}
