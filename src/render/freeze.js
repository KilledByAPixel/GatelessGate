import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';
import { INK_NOISE_GLSL, INK_DOMAIN_GLSL } from './inknoise.js';

// Hold the last frame of the outgoing scene on screen, swap the world behind it,
// then fade the still away to reveal the new one.
//
// The old transition went out to paper and back in — a second and a half where
// the screen showed nothing at all. This never leaves the picture: the held
// frame IS what was just on screen, so the cut has no empty middle.
//
// It also hides a stall that used to be merely covered. Building a koan
// allocates the meadow, the mountains, the forest and every prop in one
// synchronous call; that hitch happened behind a blank paper screen. Now it
// happens behind a still of the scene you were already looking at, which is the
// difference between a pause and a freeze nobody notices.
//
// WHY A RENDER TARGET rather than copying the framebuffer: the obvious approach
// is renderer.copyFramebufferToTexture, but it runs copyTexSubImage2D, which
// needs storage already allocated (so the texture has to be a DataTexture with a
// full-screen typed array behind it), and the default framebuffer's contents are
// undefined once the frame has been presented — so the copy would also have to
// be synchronised into the render loop. Re-rendering the outgoing scene into a
// target we own costs one extra frame at transition time, which is nothing
// beside the scene build that follows, and has neither problem.

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The held frame does not fade — it DISSOLVES, the same wet-ink spread the intro
// curtain uses, straight through to the scene underneath. A crossfade shows both
// dioramas at once as a ghosted double image; discarding per-pixel means every
// pixel is only ever one scene or the other, with an ink-stained edge crawling
// between them.
//
// The sampling itself is deliberately the same shape as the post chain's passes
// — plain sample, plain write, no colorspace conversion — because the target is
// configured the same way theirs are. Matching a chain already correct on screen
// beats reasoning about sRGB round-trips from first principles; the failure mode
// is a held frame sitting a shade off the live scene, which shows as a step the
// instant the dissolve begins.
const FRAG = /* glsl */`
uniform sampler2D tFrozen;
uniform float uProgress;   // 0 held whole, 1 fully torn away
uniform float uAspect;
uniform vec3 uInk;
varying vec2 vUv;
${INK_NOISE_GLSL}
${INK_DOMAIN_GLSL}
void main() {
  float n = inkFbm(inkDomain(vUv, uAspect));
  // the threshold runs past 1 so the last stubborn blotches clear completely
  float th = uProgress * 1.25 - 0.1;
  if (n < th) discard;                       // torn away — the new scene is behind
  vec3 old = texture2D(tFrozen, vUv).rgb;
  // ink pools along the tearing edge, the way it does when it wets paper
  float rim = 1.0 - smoothstep(th, th + INK_EDGE, n);
  gl_FragColor = vec4(mix(old, uInk, rim * 0.72), 1.0);
}`;

export function makeFreeze(renderer, post, width, height) {
  const opts = post ? post.targetOptions()
    : { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), opts);
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tFrozen: { value: target.texture },
      uProgress: { value: 0 },
      uAspect: { value: 1 },
      uInk: { value: new THREE.Color(INK) },
    },
    // no blending: the shader discards rather than fading, so a pixel is only
    // ever one scene or the other
    transparent: false,
    depthTest: false,
    depthWrite: false,
  });

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let held = false;
  let anim = null;   // { dur, el, res }

  const api = {
    get active() { return held; },
    // 0 = the held frame covers everything, 1 = fully dissolved away
    get progress() { return material.uniforms.uProgress.value; },
    setAspect(a) { material.uniforms.uAspect.value = a; },

    // Take the outgoing frame. Safe to call at any point in the turn — it
    // renders fresh rather than reading back what happened to be on screen.
    capture(scene, camera) {
      if (!scene) return false;
      // A capture taken while a previous dissolve is still running would leave
      // that tween driving the NEW frame — and when it finished it would drop
      // the new frame instantly, mid-transition. Settle it first.
      if (anim) { anim.res(); anim = null; }
      if (post && post.active) {
        post.render(scene, camera, target);
      } else {
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
      material.uniforms.uProgress.value = 0;
      held = true;
      return true;
    },

    // Composite the held frame over whatever was just drawn.
    draw() {
      if (!held) return;
      const prev = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      try { renderer.render(quadScene, quadCam); }
      finally { renderer.autoClear = prev; }
    },

    release(dur = 0.7) {
      if (!held) return Promise.resolve();
      return new Promise((res) => {
        if (anim) anim.res();          // superseded tween settles immediately
        anim = { dur, el: 0, res };
      });
    },

    // drop the held frame at once, no fade
    clear() {
      const pending = anim;
      held = false;
      anim = null;
      material.uniforms.uProgress.value = 0;
      if (pending) pending.res();
    },

    setSize(w, h) { target.setSize(Math.max(1, w), Math.max(1, h)); },

    update(dt) {
      if (!anim) return;
      anim.el += dt;
      const k = Math.min(1, anim.el / anim.dur);
      // linear, not eased: the threshold already advances non-uniformly through
      // the noise, and easing on top of that makes the tear stall mid-screen
      material.uniforms.uProgress.value = k;
      if (k >= 1) {
        held = false;
        anim.res();
        anim = null;
      }
    },

    dispose() {
      target.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
  return api;
}
