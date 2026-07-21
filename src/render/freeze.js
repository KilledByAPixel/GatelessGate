import * as THREE from '../../lib/three.module.js';

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

// Deliberately the same shape as the post chain's passes — plain sample, plain
// write, no colorspace conversion — because the target is configured the same
// way they are. Matching a chain that is already correct on screen beats
// reasoning about sRGB round-trips from first principles; the failure mode is a
// held frame sitting a shade off the live scene, which shows up as a visible
// step the instant the fade begins.
const FRAG = /* glsl */`
uniform sampler2D tFrozen;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tFrozen, vUv).rgb, uOpacity);
}`;

export function makeFreeze(renderer, post, width, height) {
  const opts = post ? post.targetOptions()
    : { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), opts);
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { tFrozen: { value: target.texture }, uOpacity: { value: 1 } },
    transparent: true,
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
    get opacity() { return material.uniforms.uOpacity.value; },

    // Take the outgoing frame. Safe to call at any point in the turn — it
    // renders fresh rather than reading back what happened to be on screen.
    capture(scene, camera) {
      if (!scene) return false;
      if (post && post.active) {
        post.render(scene, camera, target);
      } else {
        renderer.setRenderTarget(target);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
      material.uniforms.uOpacity.value = 1;
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
      material.uniforms.uOpacity.value = 1;
      if (pending) pending.res();
    },

    setSize(w, h) { target.setSize(Math.max(1, w), Math.max(1, h)); },

    update(dt) {
      if (!anim) return;
      anim.el += dt;
      const k = Math.min(1, anim.el / anim.dur);
      material.uniforms.uOpacity.value = 1 - k * k * (3 - 2 * k);
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
