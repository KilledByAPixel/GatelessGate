import * as THREE from '../../lib/three.module.js';

// THE WIND IN THE TREES — per-part, in the vertex shader.
//
// The old version was pulled because it moved the angle of the WHOLE TREE,
// which never looked right; individual foliage rustling is the design instead.
// The v1 breeze leaned each tree about its base pivot, which is a tree bowing,
// and a bowing tree reads as a tree being pushed over rather than as wind
// moving through it.
//
// WHY A SHADER AND NOT A HIERARCHY. A tree in this kit is TWO meshes — every
// limb merged into one, every leaf cluster into another (tree.js) — because
// mesh count is draw calls and the book's budget is 150 a scene. There are no
// branch objects to rotate; the merge already threw them away. So the identity
// a moving part needs is baked in as vertex attributes at build time
// (mergeSimple's `extras`), and the motion happens per-vertex on the GPU. Cost:
// zero draw calls, zero CPU per frame, one uniform write for the whole book.
//
//   aSway   how far along the plant this vertex is, 0 at the foot and 1 at the
//           outermost leaf — CUMULATIVE PATH LENGTH from the trunk base, not
//           branch depth. This is the trick that buys the hierarchy — branches
//           bending, and the branches above them bending too:
//           a leaf on a third-level limb carries its parents' whole run in its
//           own weight, so when it moves, everything between it and the trunk
//           has visibly moved too. No bone chain, no accumulation pass — the
//           sum is precomputed in the one number.
//   aPhase  a per-part offset so the parts do NOT arrive together. Without it
//           the sum above is one smooth curve and you are back to bowing the
//           whole tree, just with a stiffer base. This is the difference
//           between "the tree leans" and "the wind is going through it".
//
// The gust field is tuftfield.js's (the meadow's own shader), sampled the same
// way in the same units, so a scene's meadow and its trees answer ONE wind
// rather than two that happen to be blowing. Deterministic: everything is a
// function of simTime and the baked attributes, no Math.random, no wall clock.

// One shared record: every foliage material references these SAME uniform
// objects, so stepFoliageWind below is a single write that reaches every
// tree in the scene — and a tree built later
// picks up the current wind with no wiring. `uFoliageWind` at 0 leaves every
// vertex exactly where the geometry put it, which is what makes this safe to
// switch off and what keeps a windless scene bit-identical to one built before
// this file existed.
export const FOLIAGE = {
  uFoliageTime: { value: 0 },
  uFoliageWind: { value: 1 },
  uFoliageDir: { value: new THREE.Vector2(1, 0.35).normalize() },
  uFoliageGustScale: { value: 0.055 },
  uFoliageGustSpeed: { value: 2.4 },
};

// How far the outermost foliage travels, in world units, at wind 1 and a full
// gust — THE MASTER DIAL, both species, everything. This is a brush-and-ink
// book and the trees are midground furniture, so the read wanted is "alive",
// not "storm"; 0.10 turned out to be under-alive on the first live pass and
// this is the second raise on it. The ceiling is not a matter of taste: past
// about 0.25 the branching profile starts to carry visible motion down into the
// bole, and a moving bole is the whole-tree bowing that this system was built
// to get rid of.
export const FOLIAGE_REACH = 0.15;
// The leaves' own flutter, on top of the branch motion and quicker than it —
// the "leaves and stuff would move around" half of the brief. Rides aLeaf (1 on
// a broadleaf's canopy, 0 on wood, a fraction on a pine's tiers), so a limb
// never buzzes. THIS IS THE BROADLEAF LEAF DIAL: turn it up and the round
// trees' clusters shiver harder without touching the branches under them or the
// pines. Raised after the first live pass, which read as under-moved.
export const FOLIAGE_FLUTTER = 0.35;

// How stiff a branching plant is along its own length — the exponent on aSway
// in the branching profile below. Lower is limberer.
//
// It went 2.0 -> 1.7 -> 2.6. 1.7 was an attempt to make the LIMBS read, since
// at a square a point halfway along a branch travels a quarter of the tip's
// distance and vanishes. It worked, and the verdict was that the limbs are not
// the point: "the branches don't matter so much, it's mostly the foliage" —
// with visible trouble in them once the wind slider goes up. So this is now
// deliberately STIFFER than it ever was: the wood is close to inert, the canopy
// carries the motion, and turning the wind up finds nothing in the branches to
// break. Do not go far below 1.5 whatever happens — at 1.0 the weight is linear
// to the ground and the bole rocks, which is the whole-tree bowing this system
// exists to replace.
export const FOLIAGE_STIFF = 2.6;

// Seconds of delay per unit of aPhase — how far behind the gust a part sits.
// This is the knob for whether a bend reads as travelling THROUGH a tree
// (up a pine's tiers, out along a limb) rather than the whole plant answering
// at once. Too large and parts visibly disagree instead of following.
export const FOLIAGE_LAG = 0.22;

// Injected ahead of the vertex body. Declares the attributes and the gust
// function; ggHash/ggNoise are tuftfield.js's (the meadow's own shader),
// deliberately identical so the two fields gust together instead of merely
// both gusting.
export const FOLIAGE_PARS = /* glsl */ `
attribute float aSway;
attribute float aPhase;
attribute float aLeaf;
attribute float aColumn;
uniform float uFoliageTime;
uniform float uFoliageWind;
uniform vec2 uFoliageDir;
uniform float uFoliageGustScale;
uniform float uFoliageGustSpeed;

float ggHashF(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ggNoiseF(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ggHashF(i), ggHashF(i + vec2(1.0, 0.0)), f.x),
             mix(ggHashF(i + vec2(0.0, 1.0)), ggHashF(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The displacement, in OBJECT space. The world XZ passed in is the vertex's
// own, not the plant's base — which sounds wrong and is not. A gust cell is 18
// units at the builder default and nearer 100 at the shipped slider, so every
// vertex of one tree lands inside the same cell and the sample is per-tree in
// practice. Taking it per-vertex is what lets ONE code path serve both an
// individual tree (its own modelMatrix) and forest.js's stand, which bakes
// dozens of trees into a single merged mesh and so has no per-tree origin left
// to ask for. A stand still arrives in sequence because the trees are metres
// apart in the gust field, exactly as the grass does it.
vec3 ggFoliageOffset(vec3 pos, vec2 world) {
  if (uFoliageWind <= 0.0 || aSway <= 0.0) return vec3(0.0);
  // aPhase is a DELAY IN SECONDS on this part's reading of the gust, not a
  // phase on a sine of its own. That is what keeps the hierarchy (a limb, or a
  // pine tier, answering the gust later than the one below it) without giving
  // any part a private oscillator that could disagree with the field it is
  // standing in — see the swing below for why that mattered.
  float t = uFoliageTime - aPhase * ${FOLIAGE_LAG.toFixed(4)};
  vec2 flow = world * uFoliageGustScale
            - uFoliageDir * (t * uFoliageGustSpeed * uFoliageGustScale);
  float gust = ggNoiseF(flow) * 0.70 + ggNoiseF(flow * 2.7 + 19.3) * 0.30;

  // TWO PROFILES, because a broadleaf and a conifer fail in different ways.
  //
  //   aColumn == 0 — THE BRANCHING MODEL (tree.js). aSway is cumulative run
  //     from the foot, squared so the trunk stays stiff rather than merely
  //     slow. Each part is displaced on its own; that is right for a tree whose
  //     limbs genuinely do move independently of each other.
  //
  //   aColumn > 0 — THE BENDING COLUMN (pine.js), and it exists because the
  //     branching model was WRONG for a pine. Displacing each tier on its own
  //     slides the cones sideways off a bole that is not moving, which is
  //     exactly how it read: lopsided, the top tier moving far too much off
  //     to the side. A
  //     conifer is a mast: it bends as ONE cantilever rooted at the ground, and
  //     the tiers ride that bend rather than swimming against it. aColumn is
  //     1/height, so aColumn * y is the height fraction and its SQUARE is the
  //     cantilever curve — zero displacement at the foot however hard it blows,
  //     growing quadratically to the crown. Per VERTEX, not per part, which is
  //     what keeps a one-piece bole attached to the ground while its top moves.
  float w;
  if (aColumn > 0.0) {
    float h = clamp(pos.y * aColumn, 0.0, 1.0);
    w = h * h * aSway;
  } else {
    w = pow(aSway, ${FOLIAGE_STIFF.toFixed(4)});
  }
  // SIGNED, AND OFF THE GRASS'S OWN SIGNAL. This is tuftfield.js's exact law —
  // gust * 2 - 1, the drifting noise mapped through zero — and it is here
  // because the first version was a pair of sines scaled to stay positive, so
  // every tree leaned permanently downwind and merely pulsed, while the meadow
  // beside it rocked symmetrically through upright. Half of every cycle they
  // were leaning opposite ways — the trees swaying against the grass rather
  // than with it. Same field, same mapping, same instant: now they lean
  // together and come back together, because it is one wind and not two.
  float swing = gust * 2.0 - 1.0;
  vec3 off = vec3(uFoliageDir.x, 0.0, uFoliageDir.y)
           * (uFoliageWind * ${FOLIAGE_REACH.toFixed(4)} * w * swing);

  // The leaves' flutter: quicker, smaller, and ACROSS the wind as well as along
  // it, so a cluster shivers instead of sliding. Canopy only (aLeaf).
  if (aLeaf > 0.0) {
    float f = uFoliageTime * 3.1 + aPhase * 2.3;
    vec2 cross2 = vec2(-uFoliageDir.y, uFoliageDir.x);
    float fa = uFoliageWind * ${FOLIAGE_REACH.toFixed(4)} * ${FOLIAGE_FLUTTER.toFixed(4)}
             * w * aLeaf * (0.4 + 0.6 * gust);
    off += vec3(cross2.x, 0.0, cross2.y) * fa * sin(f);
    off.y += fa * 0.5 * sin(f * 1.37 + 1.1);
  }
  return off;
}
`;

// The one line that goes in the vertex body, after `transformed` exists. The
// gust is sampled at the UNDISPLACED world position — feeding a vertex its own
// displaced position would let the offset drive its own input, which drifts.
export const FOLIAGE_BODY = /* glsl */ `
transformed += ggFoliageOffset(transformed, (modelMatrix * vec4(position, 1.0)).xz);
`;

// Hang the wind on a material. Idempotent-ish: a material may only be given one
// onBeforeCompile, so this OWNS that hook for whatever it is called on.
//
// customProgramCacheKey is not optional. Three.js keys compiled programs by
// material type plus a handful of flags, so a Lambert with this injection and a
// plain Lambert hash to the same program and the second one built wins — which
// showed up as the wind working or not depending on which case was visited
// first. The key makes them different programs.
export function applyFoliageWind(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, FOLIAGE);
    shader.vertexShader = FOLIAGE_PARS + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${FOLIAGE_BODY}`,
    );
  };
  material.customProgramCacheKey = () => 'gg-foliage';
  return material;
}

// Advance the wind. One call per tick from main.js — see FOLIAGE above for why
// one call is enough for every tree in the book.
export function stepFoliageWind(simTime) {
  FOLIAGE.uFoliageTime.value = Number.isFinite(simTime) ? simTime : 0;
}

// The workbench's wind sliders reach the trees through here, so the meadow and
// the wood move together (debug.js writes the same three numbers into the grass
// uniforms and the wildflowers' record). Trees take a FRACTION of the grass's
// wind: at the shipped 1.5 a blade lies most of the way over, and foliage that
// leaned that far would be the bowing tree again.
export const FOLIAGE_WIND_SHARE = 0.34;
export function setFoliageWeather({ wind, gustScale, gustSpeed } = {}) {
  if (Number.isFinite(wind)) FOLIAGE.uFoliageWind.value = Math.max(0, wind) * FOLIAGE_WIND_SHARE;
  if (Number.isFinite(gustScale)) FOLIAGE.uFoliageGustScale.value = gustScale;
  if (Number.isFinite(gustSpeed)) FOLIAGE.uFoliageGustSpeed.value = gustSpeed;
}

// What the trees are answering right now, IN THE SAME UNITS setFoliageWeather
// takes — the grass's wind, before the share above is applied — so a case that
// wants to hold the wood still for a moment (case 29, when the flag stops) can
// read the weather it found, scale it, and hand back exactly that. Reading the
// uniform directly and writing it back would have divided by the share once and
// never multiplied it again, which is a wood 34% as lively every time the flag
// came back up.
export function foliageWind() {
  return FOLIAGE.uFoliageWind.value / FOLIAGE_WIND_SHARE;
}
