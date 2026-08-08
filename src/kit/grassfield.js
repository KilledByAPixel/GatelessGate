import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { wash } from '../palette.js';
import { groundHeight } from './ground.js';
import { hash1, fbm2 } from '../util/noise.js';
import { breezeState, makePokeSpring, pokeSpringStep, GRASS_POKE_RADIUS } from './breeze.js';

// Dense wind-blown grass: thousands of tapered blades in ONE InstancedMesh,
// bent entirely in the vertex shader from a single uTime uniform, so the wind
// costs no per-frame CPU work and no extra draw calls.
//
// The blade bends along a CIRCULAR ARC rather than being displaced sideways: a
// lateral offset shears the blade and lengthens it, which reads as rubber. Arc
// bending is length-preserving, so the blade curves the way a real one does.
// Gusts travel along the wind axis so the wind blows THROUGH the field instead
// of every blade oscillating in place.
const UP = new THREE.Vector3(0, 1, 0);

// Placement is baked when the field is built, so the debug panel cannot change
// patchiness live — it sets the default here and the change lands the next time
// a scene is composed.
let defaultPatchiness = 0.42;
export function setGrassPatchiness(v) { defaultPatchiness = v; }

// HOW FAR THE MEADOW REACHES, and how much of that reach it spends dissolving.
// Same deal as patchiness — baked at build time, so the workbench's two sliders
// set these and the change lands on the next page.
//
// Frank: "can we do something with the grass to make it taper off a little bit
// more instead of stopping so abruptly... and it could go a little bit further."
// Both halves of that are here. Only composeWorld reads them; a builder called
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
export const GRASS_BASE_RADIUS = 20;
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
export const GRASS_TONE = wash(0.40);

export function makeGrassField({
  count = 52000, radius = 20, taper = GRASS_BASE_TAPER, inner = 0, seed = 5, groundSeed = 21,
  color = GRASS_TONE, height = 0.34, width = 0.05, wind = 1,
  windDir = [1, 0.35], gustScale = 0.055, gustSpeed = 2.4,
  patchiness = defaultPatchiness,   // 0 = wall-to-wall turf; higher opens bare ground
  keepout = [],
  groundFn = null,                  // see grassPlacements — the surface the blades stand on
} = {}) {
  // one blade: a tapered strip, origin at the base, segmented so it can curve.
  // BOW is a static curve baked into the rest pose itself — the geometry no
  // longer describes an upright rectangle, it describes a bowed quad strip.
  // It is the same shape for every instance (one shared geometry buffer, one
  // draw call), but each blade's own random yaw (grassPlacements) rotates that
  // bow into a different world-space direction per blade, so the field reads
  // as many individually curved strokes rather than one shape repeated
  // identically — "seeded" via the placement seed that already drives yaw.
  const SEG = 5;
  const BOW = height * 0.30;
  const geo = new THREE.PlaneGeometry(width, height, 1, SEG);
  geo.translate(0, height / 2, 0);              // base at the origin
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;             // 0 at base, 1 at tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.85) + BOW * t * t);  // taper AND bow
  }
  geo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: wind },
    uWindDir: { value: new THREE.Vector2(windDir[0], windDir[1]).normalize() },
    uGustScale: { value: gustScale },   // world units per noise cell — gust patch size
    uGustSpeed: { value: gustSpeed },   // how fast the field drifts downwind
    // the pointer's breeze (src/kit/breeze.js): blades near the stroke bend
    // ALONG the drag direction. uPokeAmt/uPokeDir read a damped spring driven
    // by the drag vector (see update below); uPokeAmt defaults to 0, so a
    // scene whose pointer never moves renders exactly as it did before the
    // breeze existed.
    uPokePos: { value: new THREE.Vector2(0, 0) },
    uPokeDir: { value: new THREE.Vector2(0, 0) },
    uPokeAmt: { value: 0 },
    uPokeR: { value: GRASS_POKE_RADIUS },
  };
  // The response spring: one per field, integrated once per tick in update().
  // Its state is exactly what the poke uniforms publish.
  const poke = makePokeSpring();

  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  // A dense stand was reading as a near-solid dark mass: half the field's
  // blades face away from the key light after their random yaw and land in
  // the toon ramp's darkest step, and thousands of them overlapping on screen
  // reads as one dark scribble rather than individual strokes. A small
  // emissive floor (tied to the grass's own colour, not a flat white) puts a
  // ceiling under how dark any blade can go while leaving the ramp's shading
  // contrast intact above it — the same "hold a floor under the dark end"
  // idea PATCH_FLOOR already uses for density, applied to tone.
  mat.emissive = new THREE.Color(color);
  mat.emissiveIntensity = 0.16;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float uTime;
      uniform float uWind;
      uniform vec2 uWindDir;
      uniform float uGustScale;
      uniform float uGustSpeed;
      uniform vec2 uPokePos;
      uniform vec2 uPokeDir;
      uniform float uPokeAmt;
      uniform float uPokeR;

      // Cheap 2D value noise. A sine of dot(pos, windDir) is a PLANE WAVE: every
      // blade the same distance along the wind axis moves identically, which
      // reads as a bar sweeping the field. Sampling a noise field that drifts
      // downwind instead gives patchy gusts and lulls in both dimensions.
      float ggHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float ggNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(ggHash(i), ggHash(i + vec2(1.0, 0.0)), f.x),
                   mix(ggHash(i + vec2(0.0, 1.0)), ggHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      ` +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iPos = instanceMatrix[3].xyz;
        float H = ${height.toFixed(4)};
        float s = clamp(transformed.y, 0.0, H);        // arclength from the base

        // the whole noise field slides downwind, so gusts arrive and pass
        vec2 flow = iPos.xz * uGustScale - uWindDir * (uTime * uGustSpeed * uGustScale);
        float gust = ggNoise(flow) * 0.70 + ggNoise(flow * 2.7 + 19.3) * 0.30;   // 0..1

        // per-blade stiffness: neighbours must not move in lockstep
        float stiff = 0.65 + 0.7 * fract(sin(dot(iPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
        // strength never goes negative — grass does not lean into the wind
        float thetaWind = uWind * (0.12 + 0.40 * gust) * stiff;
        float droop = 0.24 * stiff;   // a real blade is never straight, even at rest

        // resolve the world wind direction into this blade's local frame, so every
        // blade leans the same way in world space despite its random yaw
        vec2 ix = normalize(vec2(instanceMatrix[0].x, instanceMatrix[0].z) + vec2(1e-6));
        vec2 iz = normalize(vec2(instanceMatrix[2].x, instanceMatrix[2].z) + vec2(1e-6));

        // the pointer's brush: blades near the stroke bend ALONG the drag
        // direction (uPokeDir carries the spring's sign, so the swing-back
        // after release reads as a reversal, not a fade), with a small radial
        // share for volume — the read stays "brushed the way I moved". It
        // joins the same arc bend the wind uses, so the tip factor is the arc
        // itself and roots stay planted. Falloff mirrors breezeFalloff in
        // breeze.js — smoothstep to zero at uPokeR.
        vec2 pokeD = iPos.xz - uPokePos;
        float pokeDist = length(pokeD);
        float pokeT = clamp(1.0 - pokeDist / uPokeR, 0.0, 1.0);
        float pokeFall = pokeT * pokeT * (3.0 - 2.0 * pokeT);
        vec2 radialDir = pokeDist > 1e-4 ? pokeD / pokeDist : vec2(0.0);
        vec2 pokeVec = (uPokeDir + radialDir * 0.18)
                     * (uPokeAmt * pokeFall * (0.55 + 0.15 * gust) * stiff);

        // wind (shared world direction) plus the blade's own resting lean (local
        // +z, so calm grass leans every which way instead of all one way)
        vec2 bendVec = vec2(dot(ix, uWindDir), dot(iz, uWindDir)) * thetaWind
                     + vec2(dot(ix, pokeVec), dot(iz, pokeVec))
                     + vec2(0.0, 1.0) * droop;
        float theta = length(bendVec);
        vec2 bendDir = theta > 1e-5 ? bendVec / theta : vec2(0.0, 1.0);

        // circular arc: constant curvature k over arclength s. Length-preserving,
        // so the blade curves instead of stretching.
        float k = theta / H;
        float arcY, arcOff;
        if (abs(k) < 1e-4) { arcY = s; arcOff = 0.0; }
        else { arcY = sin(k * s) / k; arcOff = (1.0 - cos(k * s)) / k; }

        transformed.y = arcY;
        transformed.x += bendDir.x * arcOff;
        transformed.z += bendDir.y * arcOff;

        // tip micro-flutter: a second, faster, smaller ripple with a seeded
        // per-blade phase and detuned frequency, weighted t^3 so it lives in
        // the last third of the blade — the field shimmers instead of swaying
        // as one. It rides uWind and the gust, so a windless scene stays
        // bit-identical to the pre-flutter render. Small on purpose: sumi-e,
        // not a shampoo ad.
        float flPhase = ggHash(iPos.xz * 3.71 + 7.13) * 6.2832;
        float flFreq = 5.7 + 2.6 * ggHash(iPos.xz * 1.93 + 2.17);
        float tipT = s / H;
        float fl = sin(uTime * flFreq + flPhase)
                 * uWind * 0.014 * (0.35 + 0.65 * gust) * tipT * tipT * tipT;
        transformed.x += bendDir.x * fl;
        transformed.z += bendDir.y * fl;
      #endif
      `)
      // Blades are yawed around Y only (grassPlacements never tips a blade off
      // vertical), so a blade's LOCAL up is always WORLD up regardless of its
      // yaw — blending the shading normal partway toward it, tuftfield.js's
      // own fix for the identical dark-mass symptom, lifts a blade's face out
      // of the ramp's shadow band without flattening it into a billboard: the
      // other 45% keeps the blade's own facing so a stand still has shape.
      .replace('#include <beginnormal_vertex>', `
      vec3 objectNormal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), 0.55));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
      `);

    // Mark every grass fragment in the alpha channel so the ink pass can skip
    // it. A blade is thinner than a pixel at distance, and a depth-edge filter
    // crawls badly on sub-pixel geometry. This costs one instruction and no
    // extra pass — the alternative is a whole ID buffer.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;   // ink-mask marker',
    );
  };
  mat.customProgramCacheKey = () => 'grassfield-arc-poke-v2';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'grassfield';
  mesh.userData.noOutline = true;   // an inverted hull on a blade is noise
  mesh.userData.uniforms = uniforms; // so the debug panel can reach the wind live
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  const base = new THREE.Color(color);
  const col = new THREE.Color();
  const spots = grassPlacements({ count, radius, taper, inner, seed, groundSeed, patchiness, keepout, groundFn });
  let n = 0;
  for (const p of spots) {
    v.set(p.x, p.y, p.z);
    q.setFromAxisAngle(UP, p.yaw);
    // shorter as it thins — a blade, so only the height goes; its thickness is
    // already sub-pixel out there
    sc3.set(p.wide, p.tall * (1 - RIM_SHRINK * p.rim), 1);
    m.compose(v, q, sc3);
    mesh.setMatrixAt(n, m);
    col.copy(base).offsetHSL(p.tint[0], p.tint[1], p.tint[2]);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    mesh,
    get blades() { return mesh.count; },
    setWind(w) { uniforms.uWind.value = w; },
    setWindDir(x, z) { uniforms.uWindDir.value.set(x, z).normalize(); },
    setGust(scale, speed) {
      if (scale !== undefined) uniforms.uGustScale.value = scale;
      if (speed !== undefined) uniforms.uGustSpeed.value = speed;
    },
    update(dt, simTime) {
      uniforms.uTime.value = simTime;
      // the pointer's breeze: one spring integration + uniform writes, no
      // per-instance CPU work, no allocation. The smoothed drag vector drives
      // the spring; the uniforms just read its state — bend with the stroke,
      // swing back past rest on release, settle exactly.
      const b = breezeState();
      pokeSpringStep(poke, b.strength * b.dirX, b.strength * b.dirZ, dt);
      const amt = Math.hypot(poke.px, poke.pz);
      uniforms.uPokePos.value.set(b.x, b.z);
      uniforms.uPokeAmt.value = amt;
      if (amt > 1e-6) uniforms.uPokeDir.value.set(poke.px / amt, poke.pz / amt);
    },
  };
}
