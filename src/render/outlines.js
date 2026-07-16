import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';

// Inverted-hull outlines: a back-face shell displaced along normals.
// Static positional noise makes the stroke width irregular (hand-brushed)
// without any per-frame shimmer.

const VERT = /* glsl */ `
uniform float uWidth;
uniform float uWobble;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
#include <fog_pars_vertex>
void main() {
  float w = uWidth * (1.0 + uWobble * (vnoise(position * 3.0) - 0.5) * 2.0);
  vec3 p = position + normal * w;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function makeOutlineMaterial({ width = 0.02, wobble = 0.6, color = INK } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uWidth: { value: width },
        uWobble: { value: wobble },
        uColor: { value: new THREE.Color(color) },
      },
    ]),
    side: THREE.BackSide,
    fog: true,
  });
}

export function addOutlines(root, opts = {}) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline && !o.userData.hasOutline) {
      meshes.push(o);
    }
  });
  const created = [];
  for (const m of meshes) {
    const outline = new THREE.Mesh(m.geometry, makeOutlineMaterial(opts));
    outline.name = `${m.name || 'mesh'}-outline`;
    outline.userData.isOutline = true;
    m.userData.hasOutline = true;
    m.add(outline);
    created.push(outline);
  }
  return created;
}
