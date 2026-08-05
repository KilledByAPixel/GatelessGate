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

// A keepout circle, written the way a case actually thinks about it: "keep the
// scatter off THIS THING". Pass anything with a `.position` — a monk, a hut, a
// group — and it reads the coordinates off it.
//
// The alternative was writing them twice: `monk.position.set(3.6, 0, 3.4)` and
// then `{ x: 3.6, z: 3.4, r: 1.2 }` a few lines later, two sets of numbers for
// one fact (Frank: "we do want the grass keepout to be based on the object
// position, but the position is not passed in, so you have to maintain two
// different sets of numbers, and it's not ideal"). They drift the moment anyone
// nudges a figure, and nothing fails — the scatter just quietly stops respecting
// something, or clears a bald patch of grass where nothing stands any more.
//
// Still takes plain `{x, z, r}` for the circles that are not objects: a path's
// own keepout(), a swathe of open water, the air over a gorge.
export function around(obj, r) {
  const p = obj && obj.position ? obj.position : obj;
  return { x: p.x, z: p.z, r };
}

// And the same thing accepted inline, so `{ at: monk, r: 1.2 }` works in the
// list without a wrapping call. Normalised once here, so everything downstream
// — rocks, bushes, both grass fields — still sees nothing but {x, z, r}.
const asCircle = (k) => (k && k.at ? around(k.at, k.r) : k);

// The shared scene grammar: every case sits in the same kind of world —
// rolling ground, mountains and forest in the fog, and a dressed midground
// (scatter trees, rocks, bushes, grass). Foreground staging stays per-koan.
// `keepout` circles ({x, z, r}, or {at: object, r}) protect staging and paths
// from scatter.
export function composeWorld(scene, {
  seed = 1,
  groundSeed = 21,
  // The earth's own value. Almost always WASH.ground — but a scene under snow
  // is a scene where the ground has gone pale, and that is one parameter, not
  // a second world grammar.
  groundColor = null,
  // A coast, passed straight through to the ground (see groundHeight). The
  // case is responsible for keeping scatter and grass off the water with
  // keepout circles — placement never samples the shore itself.
  shore = null,
  keepout = [],
  // Grass wants a DIFFERENT mask from props. A rock must not spawn inside a
  // monk, but grass should grow right up around his feet — clearing a wide
  // circle around every figure is what makes a meadow look staged. Pass only
  // what genuinely covers the ground here (a worn trail, a stone base).
  // Defaults to `keepout` so existing callers keep their old behaviour.
  grassKeepout = null,
  // (x, z) => y of the surface the grass stands on, for a case whose ground is
  // more than the terrain function — k11's rise is a prop the terrain knows
  // nothing about, and grass planted at terrain height knifed up through it.
  // The case owns the shape, so the case supplies the function (typically
  // max(groundHeight, its own relief)); absent, the fields keep planting at
  // groundHeight(groundSeed) — this world's own terrain — exactly as before.
  groundFn = null,
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
  // one shape from here down, whichever way the case wrote them
  keepout = keepout.map(asCircle);
  if (grassKeepout) grassKeepout = grassKeepout.map(asCircle);

  scene.add(makeGround({
    seed: groundSeed,
    ...(groundColor ? { color: groundColor } : {}),
    ...(shore ? { shore } : {}),
  }));
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

  // The trees deliberately do NOT answer the pointer's breeze. v1 tilted each
  // scattered tree on a damped spring and Frank pulled it: "the trees are
  // getting knocked around way too much... we don't wanna go by the base of
  // the tree" — a whole-group tilt pivots at the trunk's base, and no gentle
  // amplitude makes that read as a canopy. The grass is the instrument now;
  // if trees ever join back in it has to be canopy-only deformation, not a
  // base pivot (treeSpringStep in breeze.js is kept, uncalled, for that day).

  scene.add(makeRocks({ count: rocks, seed: seed * 51, groundSeed, keepout }));
  scene.add(makeBushes({ count: bushes, seed: seed * 61, groundSeed, keepout }));

  // the meadow: one instanced field, wind animated in the vertex shader. The
  // caller must drive world.update(dt, simTime) or the wind stands still.
  // `grass` is a blade budget; a tuft card shows several blades. The divisor
  // was 3 at first; Frank asked for about twice the coverage, and at two
  // triangles each even this is a fraction of the blade field's geometry.
  const field = grassStyle === 'tufts'
    ? makeTuftField({
      count: Math.round(grass / 1.5), seed: seed * 81, groundSeed,
      keepout: grassKeepout || keepout, groundFn,
    })
    : makeGrassField({
      count: grass, seed: seed * 81, groundSeed,
      keepout: grassKeepout || keepout, groundFn,
    });
  scene.add(field.mesh);

  return {
    trees: sceneTrees,
    grass: field,
    update(dt, simTime) { field.update(dt, simTime); },
  };
}
