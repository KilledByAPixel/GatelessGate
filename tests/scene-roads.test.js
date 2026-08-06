import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mountainFootprints } from '../src/kit/mountains.js';

// No road ends deep inside a mountain. Same 0.85·r rule the trees and
// forests enforce; the outer skirt is legal because makePath's default
// taper has dissolved the road to a hair before the rock face.
// scripts/dev/road-audit.js is the workbench version of this check (it
// also reports aims and abrupt endings, which are art calls, not law).
//
// Deliberate exceptions, verified by eye — read the reason before "fixing":
//   k19 — custom mountains; its road dissolves into the treeline under the
//         red moon exactly as composed (shots/k19-road.jpeg, 2026-08-06).
//   k23 — computed from/to (the absence), custom mountains.
const BY_EYE = new Set(['k19.js', 'k23.js']);

const BANDS = [
  { count: 8, distance: 52, arcSpan: 3.6 },
  { count: 5, distance: 33, arcSpan: 2.4, hScale: 0.65 },
];

test('no statically-parsable road ends deep inside a mountain', () => {
  const files = readdirSync('src/koans').filter((f) => /^k\d+\.js$/.test(f));
  let checked = 0;
  for (const file of files) {
    if (BY_EYE.has(file)) continue;
    const src = readFileSync(`src/koans/${file}`, 'utf8');
    const paths = [...src.matchAll(/makePath\(\{([^}]*)\}/g)];
    if (!paths.length) continue;
    // a case that overrides `mountains:` needs its own eyes, not this math
    if (/mountains:\s*\[/.test(src)) continue;
    const idM = src.match(/const ID = (\d+)/);
    const seedM = src.match(/composeWorld\(scene, \{[\s\S]*?seed: (\w+)/);
    let seed = idM ? Number(idM[1]) : null;
    if (seedM && /^\d+$/.test(seedM[1])) seed = Number(seedM[1]);
    if (seed === null) continue;
    const feet = BANDS.flatMap((b, i) => mountainFootprints({ seed: seed * 31 + i * 7, ...b }));
    for (const p of paths) {
      const to = p[1].match(/to:\s*\[([-\d.]+),\s*([-\d.]+)\]/);
      if (!to) continue;
      const tx = Number(to[1]), tz = Number(to[2]);
      checked++;
      for (const f of feet) {
        const d = Math.hypot(tx - f.x, tz - f.z);
        assert.ok(d > f.r * 0.85,
          `${file}: road ends at (${tx}, ${tz}), ${(f.r * 0.85 - d).toFixed(1)} deep inside the mountain at (${f.x.toFixed(1)}, ${f.z.toFixed(1)})`);
      }
    }
  }
  assert.ok(checked > 20, `only ${checked} roads statically checkable — the parse broke`);
});
