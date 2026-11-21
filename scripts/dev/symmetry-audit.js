#!/usr/bin/env node
// Prints how far each kit animal's meshes are from being their own mirror
// image (see tests/helpers/mirror.js), worst first, in thousandths of the
// animal's height, and every piece of a mesh that is open, wound both ways
// or inside out. tests/symmetry.test.js holds all of it to zero; this is
// for finding out where, and by how much, when it does not.
//
//   node scripts/dev/symmetry-audit.js [dog fox cat cat-stand horse buffalo]
import * as THREE from '../../lib/three.module.js';
import { restAnimals, symmetryReport, shellsOf, meshesOf } from '../../tests/helpers/mirror.js';

const only = process.argv.slice(2);
for (const a of await restAnimals()) {
  if (only.length && !only.includes(a.key)) continue;
  const root = a.build();
  const h = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y;
  console.log(`\n== ${a.key}  (height ${h.toFixed(3)})`);
  for (const r of symmetryReport(root, { skip: a.skip })) {
    console.log(`  ${r.name.padEnd(10)} #${String(r.i).padEnd(3)} partner ${String(r.partner).padEnd(5)} gap ${(r.gap / h * 1000).toFixed(3).padStart(8)} mH`
      + (r.flipped ? `  flipped ${r.flipped}` : '')
      + (r.gap > 1e-5 && r.at ? `  worst at (${r.at.x.toFixed(3)}, ${r.at.y.toFixed(3)}, ${r.at.z.toFixed(3)})` : ''));
  }
  for (const m of meshesOf(root)) {
    const bad = shellsOf(m.tris).filter((s) => s.open || s.twisted || s.volume <= 0);
    if (bad.length) console.log(`  ${m.name}: ` + bad.map((s) => `{faces ${s.faces} open ${s.open} twisted ${s.twisted} vol ${s.volume.toExponential(2)}}`).join(' '));
  }
}
