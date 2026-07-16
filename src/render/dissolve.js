import * as THREE from '../../lib/three.module.js';
import { PAPER, INK } from '../palette.js';

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
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    n += a;
    a *= 0.5;
    p *= 2.07;
  }
  return s / n;
}
void main() {
  if (uProgress <= 0.0) {
    gl_FragColor = vec4(uPaper, 1.0);
    #include <colorspace_fragment>
    return;
  }
  vec2 p = vUv * vec2(uAspect, 1.0) * 4.0;
  float n = fbm(p);
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
      return new Promise((res) => { anim = { from: api.t, to, dur, el: 0, res }; });
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
