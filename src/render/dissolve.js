import * as THREE from '../../lib/three.module.js';
import { PAPER, INK } from '../palette.js';
import { INK_NOISE_GLSL, INK_DOMAIN_GLSL, nextInkSeed } from './inknoise.js';

// The one transition: wet ink spreading through paper.
// t=0 covered (paper), t=1 revealed (quad hidden).

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uProgress;
uniform float uAspect;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec2 uSeed;
${INK_NOISE_GLSL}
${INK_DOMAIN_GLSL}
void main() {
  if (uProgress <= 0.0) {
    gl_FragColor = vec4(uPaper, 1.0);
    #include <colorspace_fragment>
    return;
  }
  float n = inkFbm(inkDomain(vUv, uAspect, uSeed));
  float th = uProgress * 1.25 - 0.1;
  if (n < th) discard;
  vec3 col = mix(uInk, uPaper, smoothstep(th + 0.03, th + 0.22, n));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function makeDissolve() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uProgress: { value: 0 },
      uAspect: { value: 1 },
      uPaper: { value: new THREE.Color(PAPER) },
      uInk: { value: new THREE.Color(INK) },
      uSeed: { value: new THREE.Vector2(...nextInkSeed()) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.name = 'dissolve';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.userData.noOutline = true;

  let anim = null; // { from, to, dur, el, res }
  const api = {
    mesh,
    get t() { return mat.uniforms.uProgress.value; },
    set(t) {
      mat.uniforms.uProgress.value = t;
      mesh.visible = t < 1;
    },
    setAspect(a) { mat.uniforms.uAspect.value = a; },
    animateTo(to, dur = 0.8) {
      return new Promise((res) => {
        // A NEW STAIN, but only when nobody can see the old one change. At t = 0
        // the shader returns solid paper for the whole quad and at t = 1 the
        // quad is hidden, so at either end the field is invisible and swapping
        // it is free. Mid-tween it is on screen, and re-seeding there would pop
        // one set of blotches into another — so an interrupted dissolve keeps
        // the stain it started with and the next one from rest gets a fresh one.
        const t = api.t;
        if (t <= 0 || t >= 1) mat.uniforms.uSeed.value.set(...nextInkSeed());
        if (anim) anim.res(); // superseded tween settles immediately
        anim = { from: t, to, dur, el: 0, res };
      });
    },
    dissolveIn(dur = 0.8) { return api.animateTo(1, dur); },
    dissolveOut(dur = 0.8) { return api.animateTo(0, dur); },
    update(dt) {
      if (!anim) return;
      anim.el += dt;
      const k = Math.min(1, anim.el / anim.dur);
      const e = k * k * (3 - 2 * k);
      api.set(anim.from + (anim.to - anim.from) * e);
      if (k >= 1) {
        anim.res();
        anim = null;
      }
    },
  };
  api.set(0);
  return api;
}
