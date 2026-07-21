import { makeGround } from './ground.js';
import { makeMountains } from './mountains.js';
import { makeForest } from './forest.js';
import { makeRocks, makeBushes } from './scatter.js';
import { makeGrassField } from './grassfield.js';
import { makeTuftField } from './tuftfield.js';

// Which grass renderer composeWorld builds. Both share grassPlacements and the
// same wind uniforms; they differ only in what a grass plant IS — a geometric
// blade, or a camera-facing card carrying a whole baked tuft. Tufts are the
// default (Frank's idea: several times the apparent grass for a third of the
// instances at two triangles each); blades stay as the fallback, one toggle
// away in the debug panel.
let grassStyle = 'tufts';
export function setGrassStyle(v) { grassStyle = v === 'blades' ? 'blades' : 'tufts'; }
import { makeTree } from './tree.js';
import { hash1 } from '../util/noise.js';
import { wash } from '../palette.js';

// The shared scene grammar: every case sits in the same kind of world —
// rolling ground, mountains and forest in the fog, and a dressed midground
// (scatter trees, rocks, bushes, grass). Foreground staging stays per-koan.
// `keepout` circles ({x, z, r}) protect staging and paths from scatter.
export function composeWorld(scene, {
  seed = 1,
  groundSeed = 21,
  keepout = [],
  // Grass wants a DIFFERENT mask from props. A rock must not spawn inside a
  // monk, but grass should grow right up around his feet — clearing a wide
  // circle around every figure is what makes a meadow look staged. Pass only
  // what genuinely covers the ground here (a worn trail, a stone base).
  // Defaults to `keepout` so existing callers keep their old behaviour.
  grassKeepout = null,
  trees = 5,
  treeRing = [7, 20],
  rocks = 12,
  bushes = 9,
  // Blades in the instanced field, not clumps. This used to be 52000 back when
  // patchiness threw half of them away; once the field stopped cutting holes in
  // itself every one of them got placed and the meadow turned into a mat.
  grass = 34000,
  forests = [
    { center: [-19, 0, -27], spread: 13, count: 55 },
    { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  mountains = [
    { count: 8, distance: 52, arcSpan: 3.6, color: wash(0.16) },   // farthest band
    { count: 5, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.65 },
  ],
} = {}) {
  scene.add(makeGround({ seed: groundSeed }));
  mountains.forEach((m, i) => scene.add(makeMountains({ seed: seed * 31 + i * 7, ...m })));
  forests.forEach((f, i) => scene.add(makeForest({ seed: seed * 41 + i * 11, ...f })));

  // midground trees: real kit trees on a ring, avoiding keepouts
  const sceneTrees = [];
  let placed = 0, tries = 0;
  while (placed < trees && tries < trees * 14) {
    tries++;
    const a = hash1(tries * 5 + 2, seed * 17) * Math.PI * 2;
    const r = treeRing[0] + hash1(tries * 5 + 3, seed * 17) * (treeRing[1] - treeRing[0]);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 6) continue; // keep the near-camera foreground open
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    const t = makeTree({ seed: seed * 100 + placed, height: 2.6 + hash1(tries * 5 + 4, seed) * 1.6 });
    t.position.set(x, 0, z);
    t.rotation.y = hash1(tries * 5 + 5, seed) * Math.PI * 2;
    scene.add(t);
    sceneTrees.push(t);
    placed++;
  }

  scene.add(makeRocks({ count: rocks, seed: seed * 51, groundSeed, keepout }));
  scene.add(makeBushes({ count: bushes, seed: seed * 61, groundSeed, keepout }));

  // the meadow: one instanced field, wind animated in the vertex shader. The
  // caller must drive world.update(dt, simTime) or the wind stands still.
  // `grass` is a blade budget; a tuft card shows several blades, so the tuft
  // field spends a third as many instances for more apparent grass.
  const field = grassStyle === 'tufts'
    ? makeTuftField({
      count: Math.round(grass / 3), seed: seed * 81, groundSeed,
      keepout: grassKeepout || keepout,
    })
    : makeGrassField({
      count: grass, seed: seed * 81, groundSeed,
      keepout: grassKeepout || keepout,
    });
  scene.add(field.mesh);

  return {
    trees: sceneTrees,
    grass: field,
    update(dt, simTime) { field.update(dt, simTime); },
  };
}
