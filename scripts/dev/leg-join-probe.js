#!/usr/bin/env node
// Where a quadruped's legs leave its trunk: how much of each leg's surface
// stands OUTSIDE the trunk while facing up (a lit plate or tab under the
// flank: the thigh's top showing below the haunch, the forearm's top
// showing as a notch at the elbow), and how much faces down there (a dark
// shelf). Only a band just under the trunk's own underside is counted, so
// the leg's own length (a gaskin's back faces up too) is never in it. Areas are x 1e4 / height^2, per leg, +x side (the
// legs are mirror images: tests/symmetry.test.js).
//
//   node scripts/dev/leg-join-probe.js [dog fox horse buffalo]
import * as THREE from '../../lib/three.module.js';
import { restAnimals, meshesOf } from '../../tests/helpers/mirror.js';
import { under } from '../../src/kit/quadruped.js';

const only = process.argv.slice(2);
// how far below the trunk's own underside, at the same spot, a sample still
// counts as at the join, x height
const BAND = Number(process.env.BAND || 0.04);
const insideOf = (tris) => {
  const d = new THREE.Vector3(0.5377, 0.8011, 0.2618).normalize();
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  return (p) => {
    ray.set(p, d);
    let n = 0;
    for (const [a, b, c] of tris) if (ray.intersectTriangle(a, b, c, false, hit)) n++;
    return n % 2 === 1;
  };
};

for (const a of await restAnimals()) {
  if (!['dog', 'fox', 'horse', 'buffalo'].includes(a.key)) continue;
  if (only.length && !only.includes(a.key)) continue;
  const root = a.build();
  const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  const ms = meshesOf(root);
  const body = ms.find((m) => m.name === 'body');
  const inside = insideOf(body.tris);
  const legs = ms.filter((m) => m.name === 'leg' && m.centre.x > 0).sort((p, q) => q.centre.z - p.centre.z);
  console.log(`\n== ${a.key}`);
  for (const [k, leg] of legs.entries()) {
    const top = leg.box.max.y;
    let up = 0, down = 0, upWorst = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3(), c = new THREE.Vector3();
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
        if (c.y < under(body.tris, c.x, c.z) - BAND * h) continue;
        tot++;
        if (!inside(c)) out++;
      }
      if (!tot || !out) continue;
      const exp = area * out / 15;
      if (N.y > 0.25) { up += exp * N.y; upWorst = Math.max(upWorst, N.y); } else if (N.y < -0.25) down += exp * -N.y;
    }
    const s = 1e4 / (h * h);
    console.log(`  ${k ? 'hind ' : 'front'}  exposed up-facing ${(up * s).toFixed(2).padStart(6)}  (steepest ny ${upWorst.toFixed(2)})   down-facing ${(down * s).toFixed(2).padStart(6)}`);
  }
}
