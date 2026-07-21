import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { groundHeight } from './ground.js';
import { hash1, fbm2 } from '../util/noise.js';

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
export function grassPlacements({
  count, radius = 20, inner = 0, seed = 5, groundSeed = 21,
  patchiness = defaultPatchiness, keepout = [],
} = {}) {
  const out = [];
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const a = hash1(i * 4 + 1, seed) * Math.PI * 2;
    const rr = inner + Math.sqrt(hash1(i * 4 + 2, seed)) * (radius - inner); // even area density
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;

    // thin toward the outer rim so the field dissolves into fog instead of
    // ending on a visible circle
    const rimT = (rr - radius * 0.62) / (radius * 0.38);
    if (rimT > 0 && hash1(i * 4 + 13, seed) < rimT) continue;

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
      y: groundHeight(x, z, { seed: groundSeed }),
      yaw: hash1(i * 4 + 7, seed) * Math.PI * 2,
      wide: 0.8 + 0.5 * hash1(i * 4 + 9, seed),
      tall: 0.65 + 0.8 * hash1(i * 4 + 5, seed),
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

export function makeGrassField({
  count = 52000, radius = 20, inner = 0, seed = 5, groundSeed = 21,
  // an ash-olive, not a green: the rest of the palette (bushes #4E4F49, forest
  // #66655A, ground #CDC6B5) is desaturated, and a saturated field fights it
  color = WASH.dry, height = 0.34, width = 0.05, wind = 1,
  windDir = [1, 0.35], gustScale = 0.055, gustSpeed = 2.4,
  patchiness = defaultPatchiness,   // 0 = wall-to-wall turf; higher opens bare ground
  keepout = [],
} = {}) {
  // one blade: a tapered strip, origin at the base, segmented so it can curve
  const SEG = 5;
  const geo = new THREE.PlaneGeometry(width, height, 1, SEG);
  geo.translate(0, height / 2, 0);              // base at the origin
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;             // 0 at base, 1 at tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.85));  // taper to a point
  }
  geo.computeVertexNormals();

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: wind },
    uWindDir: { value: new THREE.Vector2(windDir[0], windDir[1]).normalize() },
    uGustScale: { value: gustScale },   // world units per noise cell — gust patch size
    uGustSpeed: { value: gustSpeed },   // how fast the field drifts downwind
  };

  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float uTime;
      uniform float uWind;
      uniform vec2 uWindDir;
      uniform float uGustScale;
      uniform float uGustSpeed;

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

        // wind (shared world direction) plus the blade's own resting lean (local
        // +z, so calm grass leans every which way instead of all one way)
        vec2 bendVec = vec2(dot(ix, uWindDir), dot(iz, uWindDir)) * thetaWind
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
  mat.customProgramCacheKey = () => 'grassfield-arc';

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
  const spots = grassPlacements({ count, radius, inner, seed, groundSeed, patchiness, keepout });
  let n = 0;
  for (const p of spots) {
    v.set(p.x, p.y, p.z);
    q.setFromAxisAngle(UP, p.yaw);
    sc3.set(p.wide, p.tall, 1);
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
    update(dt, simTime) { uniforms.uTime.value = simTime; },
  };
}
