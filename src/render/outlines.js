import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';
import { FOLIAGE, FOLIAGE_PARS } from '../kit/foliage.js';

// Inverted-hull outlines: a back-face shell displaced along normals.
// Static positional noise makes the stroke width irregular (hand-brushed)
// without any per-frame shimmer.

// One shared uniform object for the global stroke-width multiplier. Every
// outline material holds a reference to this SAME object (not a clone), so
// setInkScale retroactively rescales every outline already in any scene —
// a single live dial over the whole book's ink weight.
//
// Default 0: the hull is OFF by default (Frank) — the depth-ink pass in
// post.js carries the edges, and the hull is now the experiment knob you
// turn UP (⚙ "Ink width", or ?ink=N in the kit preview) to try it back on.
const INK_SCALE = { value: 0 };

// Every outline mesh ever created, so setInkScale can toggle visibility as
// well as width: at scale 0 the shell would be coplanar with its source's own
// back faces and z-fight on open/DoubleSide geometry (leaves, fins, flags),
// so width alone is not enough — the meshes are hidden outright. Entries
// leave the set when their material is disposed (disposeRoot disposes every
// material of a torn-down scene, and Material.dispose dispatches 'dispose'),
// so swapped-out koans don't accumulate here.
const OUTLINE_MESHES = new Set();

export function setInkScale(v) {
  INK_SCALE.value = Math.max(0, +v || 0);
  const show = INK_SCALE.value > 0;
  for (const mesh of OUTLINE_MESHES) mesh.visible = show;
}

export function getInkScale() {
  return INK_SCALE.value;
}

const VERT = /* glsl */ `
uniform float uWidth;
uniform float uScale;
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
  float w = uWidth * uScale * (1.0 + uWobble * (vnoise(position * 3.0) - 0.5) * 2.0);
  vec3 p = position + normal * w;
#ifdef GG_FOLIAGE
  // The shell shares the SAME BufferGeometry object as the mesh it wraps
  // (addOutlines below), so the wind attributes are already bound here — this
  // only has to apply the identical displacement. It is not optional: a hull
  // that stays put while the foliage under it moves peels the ink off the
  // leaves, and the hull ships on at inkWidth 0.1.
  p += ggFoliageOffset(p, (modelMatrix * vec4(position, 1.0)).xz);
#endif
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

export function makeOutlineMaterial({ width = 0.02, wobble = 0.6, color = INK, foliage = false } = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uWidth: { value: width },
      uWobble: { value: wobble },
      uColor: { value: new THREE.Color(color) },
    },
  ]);
  // AFTER the merge, which deep-clones: every material must reference the one
  // shared INK_SCALE object or the live global dial couldn't reach it. The
  // foliage uniforms go on for the same reason and by the same rule — the
  // shared objects, never copies, so one clock write reaches every hull.
  uniforms.uScale = INK_SCALE;
  if (foliage) Object.assign(uniforms, FOLIAGE);
  return new THREE.ShaderMaterial({
    // Opt-in, keyed off the mesh's own userData rather than switched on for
    // everything: the wind chunk declares three attributes, and a shell over
    // ordinary geometry that lacks them would be reading whatever the driver
    // leaves bound. Trees and pines ask for it; nothing else has to care.
    defines: foliage ? { GG_FOLIAGE: '' } : {},
    vertexShader: foliage ? FOLIAGE_PARS + VERT : VERT,
    fragmentShader: FRAG,
    uniforms,
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
    const outline = new THREE.Mesh(m.geometry,
      makeOutlineMaterial({ ...opts, foliage: !!m.userData.foliageWind }));
    outline.name = `${m.name || 'mesh'}-outline`;
    outline.userData.isOutline = true;
    outline.visible = INK_SCALE.value > 0;
    OUTLINE_MESHES.add(outline);
    outline.material.addEventListener('dispose', () => OUTLINE_MESHES.delete(outline));
    m.userData.hasOutline = true;
    m.add(outline);
    created.push(outline);
  }
  return created;
}
