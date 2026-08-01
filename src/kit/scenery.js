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
import { breezeState, breezeFalloff, treeSpringStep, TREE_BREEZE_RADIUS } from './breeze.js';

// The shared scene grammar: every case sits in the same kind of world —
// rolling ground, mountains and forest in the fog, and a dressed midground
// (scatter trees, rocks, bushes, grass). Foreground staging stays per-koan.
// `keepout` circles ({x, z, r}) protect staging and paths from scatter.
export function composeWorld(scene, {
  seed = 1,
  groundSeed = 21,
  // The earth's own value. Almost always WASH.ground — but a scene under snow
  // is a scene where the ground has gone pale, and that is one parameter, not
  // a second world grammar.
  groundColor = null,
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
  scene.add(makeGround({ seed: groundSeed, ...(groundColor ? { color: groundColor } : {}) }));
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
    // yaw OUTERMOST, so the breeze tilt below happens inside it: with the
    // default XYZ order the z-tilt would be spun by each tree's random yaw and
    // point somewhere arbitrary instead of away from the pointer
    t.rotation.order = 'YXZ';
    scene.add(t);
    sceneTrees.push(t);
    placed++;
  }

  // The pointer's breeze on the trees: a LITTLE motion, next to the grass's a
  // lot. Each scattered tree carries one damped spring (breeze.js); a pointer
  // sweeping inside TREE_BREEZE_RADIUS kicks it (impulse ∝ strength × falloff)
  // and the spring tilts the whole group a few hundredths of a radian away
  // from the pointer, ringing down on its own in about a second and a half.
  // Whole-group tilt, never vertex work — at this amplitude it reads as the
  // canopy answering. hash1 detunes each tree's spring and throw so
  // neighbours never nod in unison. Case-placed hero trees (k5's oak and kin)
  // are the cases' own and stay still — a follow-up, not this pass.
  const TREE_KICK = 2.2;                 // rad/s^2 at full strength, dead centre
  const sway = sceneTrees.map((t, i) => ({
    t, x: t.position.x, z: t.position.z,
    // the tilt is applied INSIDE the yaw ('YXZ' above), so the world push
    // direction has to be carried into each tree's local frame
    cy: Math.cos(t.rotation.y), sy: Math.sin(t.rotation.y),
    pos: 0, vel: 0,
    ax: 0, az: 1,                        // last push direction, kept through the ring-down
    rate: 0.85 + 0.3 * hash1(i * 7 + 3, seed * 23),   // detuned stiffness — phase offset
    amp: 0.8 + 0.4 * hash1(i * 7 + 5, seed * 23),     // detuned throw
  }));

  function updateTrees(dt) {
    const b = breezeState();
    for (const s of sway) {
      let impulse = 0;
      if (b.strength > 0) {
        const dx = s.x - b.x, dz = s.z - b.z;
        const d = Math.hypot(dx, dz);
        const f = breezeFalloff(d, TREE_BREEZE_RADIUS);
        if (f > 0) {
          if (d > 1e-4) { s.ax = dx / d; s.az = dz / d; }   // tilt AWAY from the pointer
          impulse = b.strength * f * TREE_KICK * s.amp * dt;
        }
      }
      if (impulse === 0 && s.pos === 0 && s.vel === 0) continue;   // at rest — costs nothing
      treeSpringStep(s, impulse, dt, { stiffness: 40 * s.rate });
      if (impulse === 0 && Math.abs(s.pos) < 1e-4 && Math.abs(s.vel) < 1e-4) {
        s.pos = 0; s.vel = 0;            // settle exactly, so the rest branch takes over
      }
      // lean the top toward world (ax, az): express the push in the tree's
      // local frame (undo the yaw), then rotate about the perpendicular axis
      const lax = s.ax * s.cy - s.az * s.sy;
      const laz = s.ax * s.sy + s.az * s.cy;
      s.t.rotation.x = laz * s.pos;
      s.t.rotation.z = -lax * s.pos;
    }
  }

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
    update(dt, simTime) { field.update(dt, simTime); updateTrees(dt); },
  };
}
