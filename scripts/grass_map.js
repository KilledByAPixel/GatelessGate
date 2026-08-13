// Diagnostic: reproduce the grass placement rules and print a coverage map.
// Written to chase a huge square of grass being clipped out around k29's
// staging. Nothing here draws — it just asks which of the three rejection rules
// (rim thinning / patchiness / keepout) is throwing blades away, and where.
import { hash1 } from '../src/util/noise.js';
import { patchDensity } from '../src/kit/grassfield.js';

const RADIUS = 20;
const COUNT = 52000;
const SEED = 29 * 81;          // composeWorld: seed * 81
const PATCHINESS = process.argv[2] ? parseFloat(process.argv[2]) : 0.42;

// k29's grass mask: the trail only. Rebuilt here from makePath's centreline.
import { noise1 } from '../src/util/noise.js';
function pathKeepout(from, to, width, seed, wander, samples, count, r) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = from[0] + (to[0] - from[0]) * t;
    const z = from[1] + (to[1] - from[1]) * t;
    const sway = (noise1(t * 3.2, seed) - 0.5) * 2 * wander * Math.sin(Math.PI * t);
    pts.push([x + sway, z]);
  }
  const out = [];
  for (let i = 0; i <= count; i++) {
    const f = Math.min(1, i / count) * samples;
    const j = Math.min(Math.floor(f), samples - 1);
    const frac = f - j;
    out.push({
      x: pts[j][0] + (pts[j + 1][0] - pts[j][0]) * frac,
      z: pts[j][1] + (pts[j + 1][1] - pts[j][1]) * frac,
      r,
    });
  }
  return out;
}
const keepout = pathKeepout([1.4, 9], [1.4, -34], 1.8, 91, 1.3, 26, 26, 1.05);

// Tally, per grid cell, how many candidate blades each rule rejected.
const N = 41;                                  // cells across the 40-unit field
const cell = (2 * RADIUS) / N;
const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => ({
  kept: 0, rim: 0, patch: 0, keep: 0,
})));
const at = (x, z) => {
  const cx = Math.floor((x + RADIUS) / cell);
  const cz = Math.floor((z + RADIUS) / cell);
  return (cx >= 0 && cx < N && cz >= 0 && cz < N) ? grid[cz][cx] : null;
};

let n = 0;
for (let i = 0; n < COUNT && i < COUNT * 4; i++) {
  const a = hash1(i * 4 + 1, SEED) * Math.PI * 2;
  const rr = Math.sqrt(hash1(i * 4 + 2, SEED)) * RADIUS;
  const x = Math.cos(a) * rr;
  const z = Math.sin(a) * rr;
  const g = at(x, z);
  if (!g) continue;

  const rimT = (rr - RADIUS * 0.62) / (RADIUS * 0.38);
  if (rimT > 0 && hash1(i * 4 + 13, SEED) < rimT) { g.rim++; continue; }

  if (hash1(i * 4 + 21, SEED) > patchDensity(x, z, SEED, PATCHINESS)) { g.patch++; continue; }

  let blocked = false;
  for (const kp of keepout) {
    const d = Math.hypot(x - kp.x, z - kp.z);
    if (d < kp.r) { blocked = true; break; }
    if (d < kp.r * 1.25) {
      const f = (d - kp.r) / (kp.r * 0.25);
      if (hash1(i * 4 + 11, SEED) > f) { blocked = true; break; }
    }
  }
  if (blocked) { g.keep++; continue; }
  g.kept++;
  n++;
}

// Print coverage as density glyphs, and beside it the dominant reason for loss.
const SHADE = ' .:-=+*#%@';
console.log(`kept ${n} of ${COUNT} candidates\n`);
console.log('COVERAGE (density)                        DOMINANT REJECTION  r=rim p=patch k=keepout');
for (let cz = 0; cz < N; cz++) {
  let a = '', b = '';
  for (let cx = 0; cx < N; cx++) {
    const g = grid[cz][cx];
    const total = g.kept + g.rim + g.patch + g.keep;
    if (!total) { a += ' '; b += ' '; continue; }
    a += SHADE[Math.min(9, Math.floor((g.kept / total) * 10))];
    const worst = Math.max(g.rim, g.patch, g.keep);
    b += g.kept / total > 0.5 ? '.'
      : worst === g.keep ? 'k' : worst === g.patch ? 'p' : 'r';
  }
  console.log(a + '   ' + b);
}

// How much of the visible near field (where the camera actually looks) is bare?
let near = 0, nearKept = 0;
for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) {
  const x = -RADIUS + (cx + 0.5) * cell, z = -RADIUS + (cz + 0.5) * cell;
  if (Math.hypot(x, z) > 12) continue;
  const g = grid[cz][cx];
  const total = g.kept + g.rim + g.patch + g.keep;
  if (!total) continue;
  near++;
  if (g.kept / total > 0.15) nearKept++;
}
console.log(`\npatchiness ${PATCHINESS} · near field (r<12): ${nearKept}/${near} cells have grass ` +
  `(${(100 * (1 - nearKept / near)).toFixed(0)}% bare)`);

// The camera always looks at the staging, so a bald patch THERE is the failure
// that actually gets noticed. Check the spots each case stands its figures on.
// each case seeds its own field (composeWorld: seed * 81), so check each one's
for (const [name, x, z, s] of [['k29 monks', 1.4, 1.7, 29], ['k29 gate', 1.4, -2.6, 29],
  ['k6 assembly', 1.2, -2.2, 6], ['k7 basin', 2.15, 0.9, 7], ['k37 buffalo', 1.0, 0.1, 37],
  ['k1 dog', 0, 0, 1]]) {
  const ring = [];
  for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a / 8 * Math.PI * 2) * 2.5;
    const pz = z + Math.sin(a / 8 * Math.PI * 2) * 2.5;
    ring.push(patchDensity(px, pz, s * 81, PATCHINESS));
  }
  const avg = ring.reduce((s, v) => s + v, 0) / ring.length;
  console.log(`  ${name.padEnd(13)} density around it: ${avg.toFixed(2)}` +
    (avg < 0.25 ? '   <-- BALD' : ''));
}
