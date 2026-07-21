import * as THREE from '../../lib/three.module.js';
import { PAPER, INK, WASH } from '../palette.js';
import { grainPixels } from './grain.js';

// A minimal post chain, hand-rolled. Our vendored Three is core-only — no
// examples/jsm — so rather than vendor the whole postprocessing folder for
// three passes, this is the ~120 lines we actually need: render the scene to a
// target (with depth), run enabled fullscreen passes ping-pong, blit the last
// one to screen.
//
// Colour note: the scene target is tagged sRGB so the scene arrives already
// encoded. The passes then operate on display values, which is what we want for
// stylising (quantising in linear space posterises the darks unevenly), and the
// final pass writes straight to the screen with no second conversion.

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// ---- ink: Sobel over linear depth ------------------------------------------
// Depth edges give silhouettes and depth discontinuities without a second scene
// render. The gradient is divided by distance, or far geometry (where a pixel
// spans metres) would produce enormous gradients and ink the whole horizon.
const INK_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec3 uInk;
uniform float uStrength;
uniform float uThreshold;
uniform float uFade;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;

float vz(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, uNear, uFar);   // positive metres from camera
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  vec2 t = uTexel;
  float tl = vz(vUv + t * vec2(-1.0,  1.0));
  float tm = vz(vUv + t * vec2( 0.0,  1.0));
  float tr = vz(vUv + t * vec2( 1.0,  1.0));
  float ml = vz(vUv + t * vec2(-1.0,  0.0));
  float mr = vz(vUv + t * vec2( 1.0,  0.0));
  float bl = vz(vUv + t * vec2(-1.0, -1.0));
  float bm = vz(vUv + t * vec2( 0.0, -1.0));
  float br = vz(vUv + t * vec2( 1.0, -1.0));
  float gx = (tl + 2.0 * ml + bl) - (tr + 2.0 * mr + br);
  float gy = (tl + 2.0 * tm + tr) - (bl + 2.0 * bm + br);

  float here = vz(vUv);
  float edge = length(vec2(gx, gy)) / max(0.35, here);   // scale-invariant with distance
  float ink = smoothstep(uThreshold, uThreshold * 2.6, edge) * uStrength;
  ink *= 1.0 - smoothstep(uFade * uFar, uFar, here);      // distant edges fade into the wash

  // Sub-pixel geometry opts OUT of ink. A grass blade is thinner than a pixel at
  // distance, so each frame a pixel's depth flips between blade and the ground
  // metres behind it — the Sobel sees a huge edge blink in and out and the ink
  // crawls. No resolution fixes that, so the grass marks itself in alpha and we
  // skip it here.
  ink *= step(0.5, base.a);

  gl_FragColor = vec4(mix(base.rgb, uInk, clamp(ink, 0.0, 1.0)), 1.0);
}`;

// ---- quantise: flatten gradients into tonal masses --------------------------
// Quantise TONE, not channels. Posterising r/g/b independently splits a
// near-neutral palette into hues — paper #F3EDDF is (0.95,0.93,0.87), and at ten
// steps each channel snaps on its own to (1.0,0.89,0.89), a pink. Since almost
// everything here sits on a grey ramp, that invents colour the book doesn't own.
// Quantising luminance and rescaling preserves hue exactly.
const QUANT_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uSteps;
uniform float uAmount;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float ql = floor(l * (uSteps - 1.0) + 0.5) / (uSteps - 1.0);
  vec3 q = c.rgb * (ql / max(l, 1e-4));
  gl_FragColor = vec4(mix(c.rgb, clamp(q, 0.0, 1.0), uAmount), c.a);
}`;

// ---- paper: the grain we already bake, multiplied in, plus a soft vignette ---
const PAPER_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tPaper;
uniform vec2 uRepeat;
uniform float uAmount;
uniform float uVignette;
uniform vec3 uInk;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float p = texture2D(tPaper, vUv * uRepeat).r;
  vec3 papered = c.rgb * mix(1.0, p * 1.12, uAmount);
  float d = distance(vUv, vec2(0.5));
  float vig = smoothstep(0.34, 0.78, d) * uVignette;
  gl_FragColor = vec4(mix(papered, uInk, vig * 0.22), c.a);
}`;

function paperTexture(size = 256) {
  const data = grainPixels(size, 42);              // the same wash the DOM overlay used
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function makePost(renderer, width, height) {
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  // MSAA on the SCENE target. `antialias: true` on the renderer only applies to
  // the default framebuffer — the moment the scene renders into a target it is
  // gone, and thin geometry like grass shimmers. The pass targets don't need it
  // (they're fullscreen blits, nothing to alias).
  const scene = new THREE.WebGLRenderTarget(width, height, { ...opts, samples: 4 });
  scene.texture.colorSpace = THREE.SRGBColorSpace;
  scene.depthTexture = new THREE.DepthTexture(width, height);
  scene.depthTexture.type = THREE.UnsignedIntType;
  const a = new THREE.WebGLRenderTarget(width, height, opts);
  const b = new THREE.WebGLRenderTarget(width, height, opts);
  a.texture.colorSpace = THREE.SRGBColorSpace;
  b.texture.colorSpace = THREE.SRGBColorSpace;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const mk = (frag, uniforms) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
  });

  const inkMat = mk(INK_FRAG, {
    tDiffuse: { value: null }, tDepth: { value: scene.depthTexture },
    uTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
    uInk: { value: new THREE.Color(INK) },
    uStrength: { value: 0.85 }, uThreshold: { value: 0.06 }, uFade: { value: 0.45 },
    uNear: { value: 0.1 }, uFar: { value: 100 },
  });
  const quantMat = mk(QUANT_FRAG, {
    tDiffuse: { value: null }, uSteps: { value: 10 }, uAmount: { value: 0.7 },
  });
  const paperMat = mk(PAPER_FRAG, {
    tDiffuse: { value: null }, tPaper: { value: paperTexture() },
    uRepeat: { value: new THREE.Vector2(width / 256, height / 256) },
    uAmount: { value: 0.55 }, uVignette: { value: 0.7 },
    uInk: { value: new THREE.Color(INK) },
  });

  const stats = { calls: 0, triangles: 0 };

  // order matters: flatten tone, ink the forms, then lay paper over everything
  const passes = [
    { key: 'quantize', mat: quantMat, on: false },
    { key: 'ink', mat: inkMat, on: false },
    { key: 'paper', mat: paperMat, on: false },
  ];

  function setSize(w, h) {
    for (const rt of [scene, a, b]) rt.setSize(w, h);
    scene.depthTexture.image.width = w;
    scene.depthTexture.image.height = h;
    scene.depthTexture.needsUpdate = true;
    inkMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    paperMat.uniforms.uRepeat.value.set(w / 256, h / 256);
  }

  function blit(mat, input, target) {
    mat.uniforms.tDiffuse.value = input;
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  return {
    passes,
    stats,
    setSize,
    get active() { return passes.some((p) => p.on); },
    set(key, on) { const p = passes.find((x) => x.key === key); if (p) p.on = !!on; },
    param(key, name, value) {
      const p = passes.find((x) => x.key === key);
      if (p && p.mat.uniforms[name]) p.mat.uniforms[name].value = value;
    },
    // renders the scene through the enabled passes, leaving the result on screen
    render(sceneToRender, camera) {
      inkMat.uniforms.uNear.value = camera.near;
      inkMat.uniforms.uFar.value = camera.far;
      renderer.setRenderTarget(scene);
      renderer.clear();
      renderer.render(sceneToRender, camera);
      // snapshot before the fullscreen passes overwrite the counters, or the
      // debug readout reports "1 draw" for the whole frame
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;

      const on = passes.filter((p) => p.on);
      let src = scene.texture;
      let ping = a, pong = b;
      for (let i = 0; i < on.length; i++) {
        const last = i === on.length - 1;
        blit(on[i].mat, src, last ? null : ping);
        if (!last) { src = ping.texture; const t = ping; ping = pong; pong = t; }
      }
      renderer.setRenderTarget(null);
    },
    dispose() {
      for (const rt of [scene, a, b]) rt.dispose();
      for (const p of passes) p.mat.dispose();
      paperMat.uniforms.tPaper.value.dispose();
    },
  };
}
