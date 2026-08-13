// No THREE, no materials, no breeze: this file builds no mesh any more. It is
// numbers and placements — which is also why it is the half of the old grass
// module that is testable in plain Node.
import { wash } from '../palette.js';
import { groundHeight } from './ground.js';
import { hash1, fbm2 } from '../util/noise.js';

// WHERE THE MEADOW GOES, and how much of it there is. This file is the
// placement and tuning layer for the grass; the grass ITSELF is tuftfield.js,
// whose billboard cards are what the book ships.
//
// It used to be both. `makeGrassField` lived at the bottom — thousands of
// tapered 3D blades in one InstancedMesh, arc-bent in the vertex shader — and
// `composeWorld` chose between the two off a `grassStyle` flag that the
// workbench's "Grass tufts" switch drove. The switch shipped defaulting to
// tufts and stayed there, so the blades were dev-only for their whole life and
// were cut, since nothing shipped ever used them. Two field implementations,
// one of them
// unreachable, is also two places every retune had to be made and one of them
// silently didn't matter.
//
// What survived is everything the billboards still stand on:
//
//   grassPlacements   where every plant goes: patchy density, keepouts, the
//                     rim taper, the ground it conforms to, its seeded yaw
//   patchDensity      the noise that opens bare ground inside the field
//   grassArea/Reach   the budget maths composeWorld scales plant counts by
//   GRASS_TONE, RIM_SHRINK, GRASS_BASE_TAPER
//   set*              the three workbench sliders (reach, taper, patchiness)
//
// tuftfield.js imports the first five; scenery.js the budget maths; debug.js
// the sliders. The name stays `grassfield` because everything that reads
// "the grass field" means this — but note that tuftfield's MESH is also named
// 'grassfield', for the debug panel's sliders, so scene.getObjectByName
// ('grassfield') returns the billboards.

// Placement is baked when the field is built, so the debug panel cannot change
// patchiness live — it sets the default here and the change lands the next time
// a scene is composed.
let defaultPatchiness = 0.42;
export function setGrassPatchiness(v) { defaultPatchiness = v; }

// HOW FAR THE MEADOW REACHES, and how much of that reach it spends dissolving.
// Same deal as patchiness — baked at build time, so the workbench's two sliders
// set these and the change lands on the next page.
//
// The meadow should reach further AND taper off rather than stopping abruptly;
// both halves of that are here. Only composeWorld reads them; a builder called
// directly (the showcase, kit-preview) still gets its own radius and the stock
// taper, because those are small display fields and not a horizon.
let defaultReach = 24;      // world units from the origin to the last straggler
let defaultTaper = 0.45;    // fraction of the reach that is solid before thinning starts
export function setGrassReach(v) { if (Number.isFinite(v) && v > 0) defaultReach = v; }
export function setGrassTaper(v) { if (Number.isFinite(v) && v > 0 && v < 1) defaultTaper = v; }
export function grassReach() { return { radius: defaultReach, taper: defaultTaper }; }

// The reach and taper these fields were tuned at. composeWorld quotes its grass
// budget for THIS pair; pushing the reach out has to buy more grass or the
// slider just thins the meadow it was supposed to extend.
const GRASS_BASE_RADIUS = 20;
export const GRASS_BASE_TAPER = 0.62;

// HOW MUCH GRASS A REACH IS WORTH: the keep probability integrated over the
// disc, i.e. how much full-density ground this reach and taper add up to.
//
// The budget scales on THIS and not on pi*r^2, because the two knobs pull
// against each other — moving the taper inward removes about as much grass as
// widening the disc adds, and scaling on raw area over-bought by a quarter the
// first time both moved at once (core density came out 26% above the tuned
// value). Closed form of the smoothstep falloff below: the solid core, plus a
// band whose weights are the two integrals of (1 - smoothstep) against r.
export function grassArea(radius, taper) {
  const a = radius * taper;          // solid out to here
  const w = radius - a;              // and dissolving over this
  return Math.PI * a * a + 2 * Math.PI * w * (0.5 * a + 0.15 * w);
}
export const GRASS_BASE_AREA = grassArea(GRASS_BASE_RADIUS, GRASS_BASE_TAPER);

// How much of its height a plant has lost by the time it reaches the very edge.
// Half: enough to read as the meadow petering out into shorter, sparser stuff,
// not so much that the outermost survivors look mown.
export const RIM_SHRINK = 0.5;

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// How much grass belongs at (x, z): 0 bare ground, 1 a full stand.
//
// Two things here are deliberate, and both exist because the naive version cut a
// visible SQUARE out of the meadow. `noise2` is bilinear value noise on an
// INTEGER LATTICE, so thresholding one octave of it yields axis-aligned
// rectangles; at the frequency this used to run (0.085, a ~12-unit cell) a
// single cell falling under the threshold blanked the entire near field with a
// straight edge down each side. So:
//
//   1. the domain is ROTATED, so no cell boundary lines up with the world axes;
//   2. it is fbm, not one octave, so stand edges are ragged at three scales.
//
// fbm averages independent octaves and therefore clusters hard around 0.5, which
// would leave the whole field just above the threshold and uniformly thinned —
// hence the contrast stretch. The ramp is narrow on purpose: a stand should be
// properly dense in its middle and feather at its rim, rather than the entire
// meadow being sparse everywhere.
const PATCH_ROT = 0.6;
const PATCH_COS = Math.cos(PATCH_ROT);
const PATCH_SIN = Math.sin(PATCH_ROT);
const PATCH_FREQ = 0.13;      // ~7.7 units for the coarsest octave — several stands in view
const PATCH_RAMP = 0.30;      // threshold-to-full width
// The thinnest ground still carries grass. Without a floor the noise has genuine
// holes, and sooner or later one lands on the staging — which is precisely the
// bald patch that got reported. A meadow varies between thin and thick, not
// between none and thick, so patchiness modulates DENSITY rather than presence.
//
// Keep this low. It is the whole near-field density: at 0.34 nothing was bare
// any more, but every blade the field was asked for got placed and the meadow
// came out a wall of wheat with nowhere for the eye to rest.
const PATCH_FLOOR = 0.22;

export function patchDensity(x, z, seed = 5, patchiness = defaultPatchiness) {
  if (patchiness <= 0) return 1;
  const px = (x * PATCH_COS - z * PATCH_SIN) * PATCH_FREQ;
  const pz = (x * PATCH_SIN + z * PATCH_COS) * PATCH_FREQ;
  const patch = 0.5 + (fbm2(px, pz, seed + 7, 3) - 0.5) * 2.1;
  const t = (patch - patchiness) / PATCH_RAMP;
  const ramp = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  return PATCH_FLOOR + (1 - PATCH_FLOOR) * ramp;
}

// Where the grass goes — shared by BOTH grass renderers (the per-blade field
// below and the billboard tuft field in tuftfield.js), so the placement rules
// that were argued over one at a time — even area density, rim thinning into
// the fog, fbm patchiness with a floor, tight feathered keepouts — exist once.
// A renderer decides what a grass thing LOOKS like; this decides where grass IS.
// A custom-surface root sits a hair BELOW the surface it was given. groundFn
// callers describe prop surfaces (k11's rise is a faceted frustum, not part of
// groundHeight), and a root planted exactly ON a facet floats visibly the
// moment the analytic function and the mesh disagree by a millimetre — burying
// it is the same rule the modeling skill uses for every other join. The
// default path keeps planting AT groundHeight exactly, as it always has: the
// ground mesh is displaced by the very same function, so there is nothing to
// disagree with, and existing scenes must stay byte-identical.
const GROUND_FN_SINK = 0.02;

export function grassPlacements({
  count, radius = 20, inner = 0, seed = 5, groundSeed = 21,
  // Where the dissolve begins, as a fraction of the radius. Was hard-coded at
  // 0.62 with a LINEAR falloff, and that combination is what read as stopping
  // abruptly: a straight ramp has a kink at each end, so the field went from
  // full to visibly thinning in one step and then hit the rim while its last
  // plants were still full-sized. Eased at both ends now (see `rim` below),
  // and the band is wider by default.
  taper = GRASS_BASE_TAPER,
  patchiness = defaultPatchiness, keepout = [],
  // (x, z) => y of the surface the grass stands on, for cases whose ground is
  // more than the terrain function (a rise, a platform). Optional and additive:
  // absent, placement is byte-identical to what it always was. Only y changes
  // when it IS given — acceptance (rim, patchiness, keepouts) never reads it,
  // so the same blades land in the same places, just at their surface's height.
  groundFn = null,
} = {}) {
  const out = [];
  // The candidate budget is 8x the ask, and the number is load-bearing: overall
  // acceptance is patchiness x rim x keepout, and in a keepout-heavy case (k19's
  // road, k1's trail) it measures as low as ~17% — at the old 4x budget those
  // cases quietly delivered two thirds of the grass they asked for and nobody
  // could tell why one meadow was thinner than the next. 8x covers the worst
  // measured case with margin; the loop still stops the moment count is met, so
  // permissive cases pay nothing.
  for (let i = 0; out.length < count && i < count * 8; i++) {
    const a = hash1(i * 4 + 1, seed) * Math.PI * 2;
    const rr = inner + Math.sqrt(hash1(i * 4 + 2, seed)) * (radius - inner); // even area density
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;

    // Thin toward the outer rim so the field dissolves into fog instead of
    // ending on a visible circle. `rim` is 0 through the solid core and eases
    // to 1 at the very edge — smoothstepped, so the thinning starts gently
    // instead of switching on, and the last stretch is nearly empty rather than
    // arriving at zero on a straight line. The renderers read it too: density
    // alone leaves FULL-SIZED plants scattered along the boundary, which is
    // what draws the edge. Shrinking them as they thin is what actually
    // dissolves the meadow.
    const rim = smooth01((rr - radius * taper) / (radius * (1 - taper)));
    if (rim > 0 && hash1(i * 4 + 13, seed) < rim) continue;

    // Large-scale patchiness: bare ground and dense stands rather than uniform
    // coverage. Wall-to-wall grass leaves the eye nowhere to rest.
    if (patchiness > 0 && hash1(i * 4 + 21, seed) > patchDensity(x, z, seed, patchiness)) continue;

    // Keepouts are FEATHERED, and the band is tight: grass should stop only where
    // something genuinely covers the ground (a worn trail, a stone base). Figures
    // stand IN grass — clearing a wide circle around them reads as fake.
    let blocked = false;
    for (const kp of keepout) {
      const d = Math.hypot(x - kp.x, z - kp.z);
      if (d < kp.r) { blocked = true; break; }
      if (d < kp.r * 1.25) {
        const f = (d - kp.r) / (kp.r * 0.25);           // 0 at the edge .. 1 at feather end
        if (hash1(i * 4 + 11, seed) > f) { blocked = true; break; }
      }
    }
    if (blocked) continue;

    out.push({
      x, z,
      y: groundFn ? groundFn(x, z) - GROUND_FN_SINK : groundHeight(x, z, { seed: groundSeed }),
      yaw: hash1(i * 4 + 7, seed) * Math.PI * 2,
      wide: 0.8 + 0.5 * hash1(i * 4 + 9, seed),
      tall: 0.65 + 0.8 * hash1(i * 4 + 5, seed),
      rim,          // 0 in the core, 1 at the very edge — the renderers shrink on it
      // tonal drift, blade to blade — mostly tone, barely hue/saturation;
      // colour noise reads as fake
      tint: [
        (hash1(i * 4 + 15, seed) - 0.5) * 0.02,
        (hash1(i * 4 + 17, seed) - 0.5) * 0.05,
        (hash1(i * 4 + 19, seed) - 0.5) * 0.16,
      ],
    });
  }
  return out;
}

// Punch-listed from Task 0 and confirmed again under Task DM's showcase: a
// dense stand of WASH.dry blades reads as a near-solid dark scribble rather
// than individual grass. WASH.dry itself is shared with a handful of unrelated
// props (odoshi's bamboo, stall timber, several koans' straw mats), so it is
// not this builder's to retune — but the FIELD's own default is. GRASS_TONE
// lifts one step lighter than WASH.dry, local to the grass renderers only —
// exported so tuftfield.js's billboard cards (the OTHER thing a grass plant
// can be, per that file's own header) share the exact same base tone rather
// than drifting apart the moment the debug panel swaps one for the other.
// AND THE NUMBER IS NOW THE NUMBER. For most of this file's life the tone was
// applied twice — once as the field material's colour and again inside every
// instance colour, which three.js multiplies — so wash(0.40) rendered at about
// wash(0.69): darker than INK_LIT, the floor the style guide sets for a lit
// surface, and a knob that moved the result roughly twice as far as it read.
// tuftfield.js carries only the VARIATION per instance now, so this constant is
// the tone the meadow actually renders at.
//
// 0.62 rather than the 0.69 it had been landing on: a step lighter, which is
// what the ground occlusion bought. The grass no longer has to carry the sense
// of mass on its own now that the earth under it is darker where it is thick
// (grassshade.js), so the blades themselves can come up out of the wash.
export const GRASS_TONE = wash(0.62);
