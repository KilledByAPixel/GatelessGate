import * as THREE from '../../lib/three.module.js';
import { toonRamp } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { grassPlacements, GRASS_TONE } from './grassfield.js';
import { breezeState, makePokeSpring, pokeSpringStep, GRASS_POKE_RADIUS } from './breeze.js';

// Frank's tuft grass: instead of one chunky geometric spear per grass plant,
// each instance is a single camera-facing QUAD carrying a baked texture of a
// whole tuft — a dozen fine blades. Two triangles where a blade was ten, so the
// same budget buys several times the apparent grass, and it grows the way grass
// actually grows: in clumps, not in isolated spikes. Still ONE draw call.
//
// Wind is a SHEAR, not a bend: the quad's base stays pinned to the ground and
// its top slides sideways, driven by the same scrolling noise field the blade
// grass uses (a plane wave read as a bar sweeping the field; the drifting noise
// map was the fix, and both fields share its exact grammar).
//
// The blade field (grassfield.js) stays as the fallback — same placements, same
// wind uniforms, swappable from the debug panel.

// ---- the tuft texture, rasterised in pure JS ------------------------------
// No canvas: tests run under node, and a DataTexture from a pure function is
// deterministic, seedable, and assertable. Four tuft variants side by side in
// one atlas; the shader picks a quarter per instance and mirrors half of them,
// so one texture reads as eight different clumps.
export const TUFT_W = 512;      // atlas width — four 128px variants
export const TUFT_H = 128;
export const TUFT_VARIANTS = 4;

export function tuftPixels(seed = 9) {
  const data = new Uint8Array(TUFT_W * TUFT_H * 4);
  const vw = TUFT_W / TUFT_VARIANTS;

  for (let vi = 0; vi < TUFT_VARIANTS; vi++) {
    const x0v = vi * vw;
    const cx = x0v + vw / 2;
    const blades = 10 + Math.floor(hash1(vi * 97 + 1, seed) * 5);

    for (let b = 0; b < blades; b++) {
      const s = vi * 131 + b * 7;
      const h = TUFT_H * (0.52 + 0.42 * hash1(s + 2, seed));
      const rootX = cx + (hash1(s + 3, seed) - 0.5) * vw * 0.30;  // roots cluster
      const lean = (hash1(s + 4, seed) - 0.5) * vw * 0.62;        // tips spread
      const bow = (hash1(s + 5, seed) - 0.5) * vw * 0.22;
      // NEAR-white, and the ceiling matters: the map MULTIPLIES the material
      // colour, so every unit below 255 darkens the whole field relative to the
      // blade grass (which had no map at all). At 205 the meadow came out ~20%
      // darker than the blades before density even entered. Strokes stay in a
      // narrow bright band; the wash tone is the material's job.
      const tone = 235 + Math.floor(20 * hash1(s + 6, seed));
      const baseR = 1.5 + 1.3 * hash1(s + 7, seed);

      const steps = Math.ceil(h * 2);
      for (let st = 0; st <= steps; st++) {
        const t = st / steps;
        const px = rootX + lean * t * t + bow * 4 * t * (1 - t) * 0.35;
        const py = t * h;
        // taper to a point, with a ragged dry-brush edge
        const r = Math.max(0.5, baseR * (1 - 0.82 * t) + (hash1(s * 517 + st, seed) - 0.5) * 0.5);
        const shade = Math.round(tone * (0.90 + 0.10 * t));       // gently darker toward the root mass

        const xi0 = Math.max(x0v, Math.floor(px - r));
        const xi1 = Math.min(x0v + vw - 1, Math.ceil(px + r));
        const yi0 = Math.max(0, Math.floor(py - r));
        const yi1 = Math.min(TUFT_H - 1, Math.ceil(py + r));
        for (let yi = yi0; yi <= yi1; yi++) {
          for (let xi = xi0; xi <= xi1; xi++) {
            const dx = xi - px, dy = yi - py;
            if (dx * dx + dy * dy > r * r) continue;
            const at = (yi * TUFT_W + xi) * 4;                    // row 0 = v0 = the ground
            // darker blade wins where they overlap — ink layering
            if (data[at + 3] === 0 || shade < data[at]) {
              data[at] = shade; data[at + 1] = shade; data[at + 2] = shade;
            }
            data[at + 3] = 255;
          }
        }
      }
    }
  }
  return data;
}

const IDENTITY_Q = new THREE.Quaternion();   // tufts carry no rotation — the shader billboards

let sharedTexture = null;
function tuftTexture() {
  if (!sharedTexture) {
    sharedTexture = new THREE.DataTexture(tuftPixels(), TUFT_W, TUFT_H, THREE.RGBAFormat);
    sharedTexture.colorSpace = THREE.SRGBColorSpace;    // authored as display greys
    sharedTexture.generateMipmaps = true;
    sharedTexture.minFilter = THREE.LinearMipmapLinearFilter;
    sharedTexture.magFilter = THREE.LinearFilter;
    sharedTexture.needsUpdate = true;
  }
  return sharedTexture;
}

// ---- the field ------------------------------------------------------------
export function makeTuftField({
  count = 12000, radius = 20, inner = 0, seed = 5, groundSeed = 21,
  // width came down 0.52 -> 0.46 with the density doubling: Frank read the wide
  // cards as "a bit thick", and narrower cards at twice the count give more
  // plants AND more ground showing between them
  color = GRASS_TONE, width = 0.46, height = 0.44, wind = 1,
  windDir = [1, 0.35], gustScale = 0.055, gustSpeed = 2.4,
  keepout = [],
  groundFn = null,   // see grassPlacements — the surface the tufts stand on
} = {}) {
  // one quad: two triangles, base at the origin so the shear pivots the ground
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, 0.5, 0);

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: wind },
    uWindDir: { value: new THREE.Vector2(windDir[0], windDir[1]).normalize() },
    uGustScale: { value: gustScale },
    uGustSpeed: { value: gustSpeed },
    // the pointer's breeze — same quartet as grassfield.js, kept in lockstep.
    // uPokeAmt defaults to 0: an unpoked scene renders exactly as before.
    uPokePos: { value: new THREE.Vector2(0, 0) },
    uPokeDir: { value: new THREE.Vector2(0, 0) },
    uPokeAmt: { value: 0 },
    uPokeR: { value: GRASS_POKE_RADIUS },
  };
  // The response spring: one per field, integrated once per tick in update().
  const poke = makePokeSpring();

  // Toon material built by hand rather than via toonMaterial(): it needs the
  // atlas as an alpha-tested map, and cutout (not blending) is the point — no
  // sorting, depth-writes on, MSAA still smooths the quad edges.
  const mat = new THREE.MeshToonMaterial({
    color, gradientMap: toonRamp(), map: tuftTexture(), alphaTest: 0.35,
  });
  // Same dark-mass symptom grassfield.js carries, same fix: a small emissive
  // floor tied to the tuft's own colour, so the toon ramp's shadow band can no
  // longer take a whole dense field down to near-black. See grassfield.js for
  // the full reasoning — kept in lockstep so the two renderers still look like
  // the same grass when the debug panel swaps between them.
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

      // The SAME gust grammar as grassfield.js, kept in lockstep on purpose:
      // a value-noise field that drifts downwind, so gusts arrive and pass
      // instead of every plant metronoming in place. If one changes, change both.
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
      ` + shader.vertexShader
      // Atlas pick, per instance: which of the four tufts, mirrored or not —
      // eight silhouettes from one texture, chosen by ground position.
      .replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
      {
        vec2 iXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        float pick = ggHash(iXZ * 0.731 + 11.3);
        float variant = floor(min(0.999, pick) * ${TUFT_VARIANTS.toFixed(1)});
        float u = fract(pick * 17.0) < 0.5 ? vMapUv.x : 1.0 - vMapUv.x;
        vMapUv.x = (u + variant) / ${TUFT_VARIANTS.toFixed(1)};
      }
      #endif
      `)
      // A billboard lit like the ground it grows from: an upright card's own
      // normal would flip tone as the camera orbits, and grass is a mass, not
      // a wall — so every tuft takes the world-up normal, same as a lawn.
      .replace('#include <beginnormal_vertex>', `
      vec3 objectNormal = vec3(0.0, 1.0, 0.0);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(1.0, 0.0, 0.0);
      #endif
      `)
      // Cylindrical billboard + shear, built in view space. The quad ignores
      // its instance rotation entirely: it stands on its root, faces the
      // camera around the world-up axis, and the wind slides its TOP while the
      // base stays put — Frank's shear, quadratic in height so the pivot reads
      // at the ground and not halfway up.
      .replace('#include <project_vertex>', `
      vec4 mvPosition;
      {
        vec4 iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);  // root, world
        vec4 origin = viewMatrix * iw;                                       // root, view
        float sx = length(vec3(instanceMatrix[0]));
        float sy = length(vec3(instanceMatrix[1]));
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vec3 rightV = normalize(cross(vec3(0.0, 0.0, -1.0), upV));

        vec2 flow = iw.xz * uGustScale - uWindDir * (uTime * uGustSpeed * uGustScale);
        float gust = ggNoise(flow) * 0.70 + ggNoise(flow * 2.7 + 19.3) * 0.30;
        float stiff = 0.65 + 0.7 * ggHash(iw.xz * 1.618 + 4.2);
        float lean = (ggHash(iw.xz * 2.113 + 31.7) - 0.5) * 0.30;   // resting tilt

        // SIGNED sway, centred on upright — Frank's spec after watching the
        // first pass: "default should be center... stretch left and right also
        // ... we'll do a negative also." The one-sided version mapped the noise
        // to 0..max downwind, so every tuft pumped between vertical and its
        // extreme and the field never rocked back. The drifting noise patch now
        // swings the shear through zero; the wind slider scales its amplitude.
        float swing = gust * 2.0 - 1.0;
        vec2 swayW = uWindDir * (uWind * 0.26 * swing * stiff);

        // the pointer's brush: tufts near the stroke lean ALONG the drag
        // direction (uPokeDir flips when the fields' spring overshoots, so
        // the release reads as a swing-back), with a small radial share for
        // volume — larger than the wind's own amplitude, the grass gets the
        // MOST motion. A world vector like swayW, so the projection below
        // keeps it on the card's own axis; falloff mirrors breezeFalloff in
        // breeze.js.
        vec2 pokeD = iw.xz - uPokePos;
        float pokeDist = length(pokeD);
        float pokeT = clamp(1.0 - pokeDist / uPokeR, 0.0, 1.0);
        float pokeFall = pokeT * pokeT * (3.0 - 2.0 * pokeT);
        vec2 radialDir = pokeDist > 1e-4 ? pokeD / pokeDist : vec2(0.0);
        vec2 pokeW = (uPokeDir + radialDir * 0.18)
                   * (uPokeAmt * pokeFall * (0.50 + 0.15 * gust) * stiff);
        swayW += pokeW;

        // ...projected onto the CARD'S OWN axis. This was the "stretchy" glitch
        // Frank suspected was bad billboard math, and he was close: the sway was
        // applied as a world vector, so whenever the orbit swung across the wind
        // the card sheared in DEPTH — toward the camera — which a flat imposter
        // renders as smearing. A billboard may only ever shear along its own
        // right axis; that is what "left and right" means on a card.
        float sw = dot((viewMatrix * vec4(swayW.x, 0.0, swayW.y, 0.0)).xyz, rightV) + lean;

        // tip micro-flutter, in lockstep with grassfield.js: a second, faster,
        // smaller ripple with a seeded per-tuft phase and detuned frequency,
        // added to the shear — the t^2 weighting below keeps it at the tips —
        // so the field shimmers instead of swaying as one. Rides uWind and the
        // gust: a windless scene stays bit-identical to the pre-flutter render.
        float flPhase = ggHash(iw.xz * 3.71 + 7.13) * 6.2832;
        float flFreq = 5.7 + 2.6 * ggHash(iw.xz * 1.93 + 2.17);
        sw += sin(uTime * flFreq + flPhase) * uWind * 0.035 * (0.35 + 0.65 * gust);

        // Bend, don't stretch: plain shear lengthens the card's diagonal by
        // sqrt(1+s^2), which is exactly the rubbery look the blade field was
        // cured of once already. Normalising the sheared tip back to the card's
        // height turns the shear into a lean — same fix, imposter edition.
        float t = position.y;                    // 0 at the root, 1 at the top
        float sw2 = sw * t * t;                  // shear grows toward the top
        float inv = inversesqrt(1.0 + sw2 * sw2);
        vec3 p = origin.xyz
               + rightV * (position.x * sx + position.y * sy * sw2 * inv)
               + upV * (position.y * sy * inv);
        mvPosition = vec4(p, 1.0);
      }
      gl_Position = projectionMatrix * mvPosition;
      `);

    // same ink-mask marker as the blade field: sub-pixel grass detail opts out
    // of the depth-edge ink pass or the Sobel crawls on it
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = 0.0;   // ink-mask marker',
    );
  };
  mat.customProgramCacheKey = () => 'tuftfield-billboard-poke-v2';

  const spots = grassPlacements({ count, radius, inner, seed, groundSeed, keepout, groundFn });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  mesh.name = 'grassfield';          // the debug panel's toggles, wind sliders and
  mesh.userData.noOutline = true;    // material-swap exemption all key off this name
  mesh.userData.uniforms = uniforms;
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  const base = new THREE.Color(color);
  const col = new THREE.Color();
  let n = 0;
  for (const p of spots) {
    v.set(p.x, p.y, p.z);
    // no rotation — the shader billboards; wide/tall carry the aspect variation
    sc3.set(width * p.wide, height * p.tall, 1);
    m.compose(v, IDENTITY_Q, sc3);
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
    get tufts() { return mesh.count; },
    get blades() { return mesh.count; },   // API parity with the blade field
    setWind(w) { uniforms.uWind.value = w; },
    setWindDir(x, z) { uniforms.uWindDir.value.set(x, z).normalize(); },
    setGust(scale, speed) {
      if (scale !== undefined) uniforms.uGustScale.value = scale;
      if (speed !== undefined) uniforms.uGustSpeed.value = speed;
    },
    update(dt, simTime) {
      uniforms.uTime.value = simTime;
      // same spring + uniform writes as grassfield.js — see the note there
      const b = breezeState();
      pokeSpringStep(poke, b.strength * b.dirX, b.strength * b.dirZ, dt);
      const amt = Math.hypot(poke.px, poke.pz);
      uniforms.uPokePos.value.set(b.x, b.z);
      uniforms.uPokeAmt.value = amt;
      if (amt > 1e-6) uniforms.uPokeDir.value.set(poke.px / amt, poke.pz / amt);
    },
  };
}
