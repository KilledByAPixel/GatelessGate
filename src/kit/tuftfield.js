import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { grassPlacements, GRASS_TONE, RIM_SHRINK, GRASS_BASE_TAPER } from './grassfield.js';
import { breezeState, makePokeSpring, pokeSpringStep, GRASS_POKE_RADIUS } from './breeze.js';

// Tuft grass: instead of one chunky geometric spear per grass plant, each
// instance is a single camera-facing QUAD carrying a baked texture of a whole
// tuft — a dozen fine blades. Two triangles where a blade was ten, so the same
// budget buys several times the apparent grass, and it grows the way grass
// actually grows: in clumps, not in isolated spikes. Still ONE draw call.
//
// Wind is a SHEAR, not a bend: the quad's base stays pinned to the ground and
// its top slides sideways, driven by a scrolling noise field (a plane wave
// read as a bar sweeping the field; the drifting noise map was the fix for
// gusts pumping every plant in place instead of arriving and passing).
//
// grassfield.js is the placement layer this field stands on — grassPlacements,
// the patchiness, the reach/taper knobs — not a second renderer: its own
// header says it builds no mesh any more. This is the only grass renderer
// (see scenery.js's "THERE IS ONE GRASS RENDERER").

// ---- the tuft texture, rasterised in pure JS ------------------------------
// No canvas: tests run under node, and a DataTexture from a pure function is
// deterministic, seedable, and assertable. Four tuft variants side by side in
// one atlas; the shader picks a quarter per instance and mirrors half of them,
// so one texture reads as eight different clumps.
export const TUFT_W = 1024;      // atlas width — four 128px variants
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

// THE LIFT. Every tuft takes the world-up normal (see the beginnormal_vertex
// override below), so the whole field is a single fixed N·L against the key.
// Under the old 3-step toon ramp that value landed on the ramp's TOP step and
// rendered at 1.0, with an emissive floor on top of it to stop the ramp's
// bottom step taking a shadowed field to near-black. Lambert takes N·L directly
// and needs no floor — so the colour is lifted to land the unshadowed field at
// the luminance the ramp gave it.
//
// THE PI TRAP, which is why this is DERIVED rather than eyeballed. Three.js's
// BRDF_Lambert (RECIPROCAL_PI * diffuseColor) divides BOTH the direct and
// indirect diffuse terms by pi, and the old toon path routed through the same
// factor. Emissive does not: `totalEmissiveRadiance = emissive` is added to
// outgoingLight raw, with no BRDF and no pi, whatever the material. A lift
// derived by comparing "diffuse + floor" against "lifted diffuse" without
// re-introducing that pi on the FLOOR term understates the true old brightness
// by a factor of pi — this constant shipped ~4% low the first time for exactly
// that reason. Matching per-channel luminance needs pi on the emissive term
// only:
//
//   old  = RECIPROCAL_PI*(S + H)*color + floor*color = color * [(S+H)/pi + floor]
//   new  = RECIPROCAL_PI*(N·L*S + H) * (lift*color)
//   lift = (S + H + pi*floor) / (N·L*S + H)
//
// evaluated against values read out of the running code — S from makeLights(),
// N·L from the world-up normal, H the hemisphere's own contribution to an
// up-facing normal — rather than restated here, where they would go stale.
//
// KNOWN GAP, recorded rather than chased: the old emissive was never modulated
// by the tuft atlas (map_fragment multiplies diffuseColor, not emissive) or by
// instanceColor, while this lift multiplies mat.color and so IS carried through
// both. The atlas is near-white but not pure white, so a map-weighted match
// would want a slightly different number — NOT applied, since that rests on an
// estimate rather than a derivation, and the acceptance gate for how the meadow
// reads is the eye. This is the exact per-channel match for the UNTEXTURED
// diffuse term; it is not claimed to be the map-weighted one.
//
// Exported so setTone() below and the tests share this exact number rather
// than each carrying their own copy that could drift out of sync.
export const LAMBERT_LIFT = 1.3361;

// ---- the field ------------------------------------------------------------
export function makeTuftField({
  count = 12000, radius = 20, taper = GRASS_BASE_TAPER, inner = 0, seed = 5, groundSeed = 21,
  // Width came DOWN when the density doubled — the wide cards read as thick,
  // and narrower cards at twice the count give more plants AND more ground
  // showing between them — then back UP again in a later retune. Judge it in a
  // case, not from this note.
  color = GRASS_TONE, width = 0.8, height = 0.44, wind = 1,
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
    // the pointer's breeze, from breeze.js's shared spring.
    // uPokeAmt defaults to 0: an unpoked scene renders exactly as before.
    uPokePos: { value: new THREE.Vector2(0, 0) },
    uPokeDir: { value: new THREE.Vector2(0, 0) },
    uPokeAmt: { value: 0 },
    uPokeR: { value: GRASS_POKE_RADIUS },
  };
  // The response spring: one per field, integrated once per tick in update().
  const poke = makePokeSpring();

  // Lambert, built by hand rather than via washMaterial(): it needs the atlas
  // as an alpha-tested map, and cutout (not blending) is the point — no
  // sorting, depth-writes on, MSAA still smooths the quad edges. Colour is
  // lifted by LAMBERT_LIFT (see its derivation above) to land the unshadowed
  // field at the luminance the old toon ramp gave it.
  const lit = new THREE.Color(color).multiplyScalar(LAMBERT_LIFT);
  const mat = new THREE.MeshLambertMaterial({
    color: lit, map: tuftTexture(), alphaTest: 0.35,
  });

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

      // A value-noise field that drifts downwind, so gusts arrive and pass
      // instead of every plant metronoming in place. NOT private to this
      // field: the trees' own wind (foliage.js's FOLIAGE_PARS) duplicates
      // ggHash/ggNoise verbatim so the trees gust together with the meadow
      // rather than merely both gusting, and the wildflowers (wildflowers.js)
      // read this same drifting-gust grammar on the CPU for their own sway.
      // Change the noise here and the trees and flowers silently fall out of
      // step with it unless foliage.js and wildflowers.js change too.
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
      // its instance rotation entirely: it stands on its root, faces the camera
      // around the world-up axis, and the wind slides its TOP while the base
      // stays put — a shear quadratic in height, so the pivot reads at the
      // ground and not halfway up.
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

        // SIGNED sway, centred on upright: the rest position is vertical and
        // the field leans BOTH ways from it. The one-sided version mapped the
        // noise to 0..max downwind, so every tuft pumped between vertical and
        // its extreme and the field never rocked back. The drifting noise patch
        // now swings the shear through zero; the wind slider scales its
        // amplitude.
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
        // that looked like bad billboard math, and nearly was: the sway was
        // applied as a world vector, so whenever the orbit swung across the
        // wind the card sheared in DEPTH — toward the camera — which a flat
        // imposter renders as smearing. A billboard may only ever shear along
        // its own right axis; that is what "left and right" means on a card.
        float sw = dot((viewMatrix * vec4(swayW.x, 0.0, swayW.y, 0.0)).xyz, rightV) + lean;

        // tip micro-flutter: a second, faster, smaller ripple with a seeded
        // per-tuft phase and detuned frequency, added to the shear — the t^2
        // weighting below keeps it at the tips — so the field shimmers instead
        // of swaying as one. Rides uWind and the gust: a windless scene stays
        // bit-identical to the pre-flutter render.
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

  const spots = grassPlacements({ count, radius, taper, inner, seed, groundSeed, keepout, groundFn });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  mesh.name = 'grassfield';          // the debug panel's visibility toggle and
                                      // tone/wind lookups all key off this name
  mesh.userData.uniforms = uniforms;
  // NO CAST, BUT STILL RECEIVE. `castShadow = false` alone did not hold: the
  // workbench's apply() re-asserts castShadow on every mesh on every page build,
  // so this line was overwritten before a frame was drawn and the meadow threw
  // shadow everywhere. noCastShadow is the flag that survives it. Receiving
  // stays on — a tree's shadow lying across the grass is right, and it is only
  // the grass's OWN cast that is meaningless here (the cards face the camera,
  // and the shadow pass does not run the billboard shader, so the map only ever
  // saw a grid of parallel quads).
  mesh.castShadow = false;
  mesh.userData.noCastShadow = true;
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  const base = new THREE.Color(color);
  const col = new THREE.Color();
  let n = 0;
  for (const p of spots) {
    v.set(p.x, p.y, p.z);
    // no rotation — the shader billboards; wide/tall carry the aspect variation.
    // The rim shrink goes on BOTH axes here, unlike the blade field: a card
    // carries a whole clump, so a small one is a small clump, and squashing only
    // its height would stretch the baked blades sideways instead.
    const s = 1 - RIM_SHRINK * p.rim;
    sc3.set(width * p.wide * s, height * p.tall * s, 1);
    m.compose(v, IDENTITY_Q, sc3);
    mesh.setMatrixAt(n, m);
    // THE TONE IS THE MATERIAL'S; THE INSTANCE CARRIES ONLY THE VARIATION.
    // This used to be `col.copy(base).offsetHSL(...)` — the full colour, base
    // and all — while mat.color ALSO held the base, and three.js multiplies the
    // two. So the meadow rendered at the tone SQUARED: GRASS_TONE said wash
    // (0.40) and the grass came out around wash(0.69), darker than INK_LIT,
    // which is the floor the style guide sets for anything lit. Nothing failed;
    // the constant simply did not mean what it said, and every attempt to
    // retune it moved the result about twice as far as expected.
    //
    // Dividing the varied colour BY the base leaves a multiplier hovering
    // around 1 — the same blade-to-blade drift as before, to the bit — and lets
    // mat.color be the tone on its own. Done this way rather than by offsetting
    // white, because offsetHSL's lightness clamps at 1: a tint of +0.08 on
    // white is silently dropped and the drift would come out one-sided and
    // dark.
    col.copy(base).offsetHSL(p.tint[0], p.tint[1], p.tint[2]);
    col.setRGB(
      base.r > 1e-4 ? col.r / base.r : 1,
      base.g > 1e-4 ? col.g / base.g : 1,
      base.b > 1e-4 ? col.b / base.b : 1,
    );
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    mesh,
    // The meadow's tone, live. mat.color IS the tone now (see the instance
    // colours above), so this lands on the next frame without rebuilding the
    // field — which is what makes it draggable in the workbench. Carries the
    // same LAMBERT_LIFT the constructor applies, or a live-dragged tone would
    // land darker than the one the field was built with.
    setTone(hex) {
      mesh.material.color.set(hex).multiplyScalar(LAMBERT_LIFT);
    },
    // The placements themselves. grassshade.js bakes the ground's occlusion
    // from these — the SAME array the instance matrices were written from, so
    // the dark can never end up somewhere the grass is not.
    spots,
    get tufts() { return mesh.count; },
    get blades() { return mesh.count; },   // API parity with the blade field
    setWind(w) { uniforms.uWind.value = w; },
    // The level this field is CURRENTLY blowing at. Case 20 reads it once at
    // build so a gust can multiply the weather already in force — pinned by the
    // case or dragged on the workbench slider — and hand exactly that back
    // afterwards, instead of guessing a base and overwriting whichever it was.
    wind() { return uniforms.uWind.value; },
    setWindDir(x, z) { uniforms.uWindDir.value.set(x, z).normalize(); },
    setGust(scale, speed) {
      if (scale !== undefined) uniforms.uGustScale.value = scale;
      if (speed !== undefined) uniforms.uGustSpeed.value = speed;
    },
    update(dt, simTime) {
      uniforms.uTime.value = simTime;
      // The pointer's breeze: one spring integration + uniform writes, no
      // per-instance CPU work and no allocation. The smoothed drag vector drives
      // the spring; the uniforms read its state — bend with the stroke, swing
      // back past rest on release, settle exactly. (This note used to point at
      // makeGrassField's copy of it; that field was cut, so it lives here now.)
      const b = breezeState();
      pokeSpringStep(poke, b.strength * b.dirX, b.strength * b.dirZ, dt);
      const amt = Math.hypot(poke.px, poke.pz);
      uniforms.uPokePos.value.set(b.x, b.z);
      uniforms.uPokeAmt.value = amt;
      if (amt > 1e-6) uniforms.uPokeDir.value.set(poke.px / amt, poke.pz / amt);
    },
  };
}
