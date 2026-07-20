import * as THREE from '../lib/three.module.js';
import { toonMaterial } from '../src/render/toon.js';
import { groundHeight } from '../src/kit/ground.js';
import { hash1 } from '../src/util/noise.js';

// Dense wind-blown grass. Thousands of tapered blades in ONE InstancedMesh,
// bent entirely in the vertex shader from a single uTime uniform — so the wind
// costs no per-frame CPU work and no extra draw calls. The base stays planted
// (bend scales with t^2 up the blade) so it reads as grass, not as sliding cards.
const UP = new THREE.Vector3(0, 1, 0);

export function makeGrassField({
  count = 7000, radius = 26, inner = 0, seed = 5, groundSeed = 21,
  color = '#8C8B6A', height = 0.42, width = 0.055, wind = 1, keepout = [],
} = {}) {
  // one blade: a tapered strip, origin at the base, segmented so it can curve
  const SEG = 4;
  const geo = new THREE.PlaneGeometry(width, height, 1, SEG);
  geo.translate(0, height / 2, 0);              // base at the origin
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height;             // 0 at base, 1 at tip
    pos.setX(i, pos.getX(i) * (1 - t * 0.85));  // taper to a point
  }
  geo.computeVertexNormals();

  const uniforms = { uTime: { value: 0 }, uWind: { value: wind } };

  const mat = toonMaterial({ color, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iOrigin = instanceMatrix[3].xyz;              // where this blade is planted
        float t = clamp(transformed.y / ${height.toFixed(4)}, 0.0, 1.0);
        // two offset waves so the field ripples instead of pulsing in unison
        float sway = sin(uTime * 1.5 + iOrigin.x * 0.65 + iOrigin.z * 0.5)
                   + 0.45 * sin(uTime * 3.3 + iOrigin.x * 1.9 - iOrigin.z * 1.3);
        float bend = uWind * sway * t * t;                 // planted base, mobile tip
        transformed.x += bend * 0.30;
        transformed.z += bend * 0.18;
        transformed.y -= abs(bend) * 0.06;                 // shortens slightly as it leans
      #endif
      `);
  };
  // onBeforeCompile-patched materials need a distinct cache key
  mat.customProgramCacheKey = () => 'grassfield';

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'grassfield';
  mesh.userData.noOutline = true;   // an inverted hull on a blade is noise
  mesh.castShadow = false;          // blades casting is costly and reads as dirt
  mesh.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let n = 0;
  for (let i = 0; n < count && i < count * 4; i++) {
    const a = hash1(i * 4 + 1, seed) * Math.PI * 2;
    const rr = inner + Math.sqrt(hash1(i * 4 + 2, seed)) * (radius - inner); // even area density
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    let blocked = false;
    for (const k of keepout) {
      if (Math.hypot(x - k.x, z - k.z) < k.r) { blocked = true; break; }
    }
    if (blocked) continue;
    const sc = 0.65 + 0.8 * hash1(i * 4 + 5, seed);
    v.set(x, groundHeight(x, z, { seed: groundSeed }), z);
    q.setFromAxisAngle(UP, hash1(i * 4 + 7, seed) * Math.PI * 2);
    s.set(0.8 + 0.5 * hash1(i * 4 + 9, seed), sc, 1);
    m.compose(v, q, s);
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    blades: n,
    setWind(w) { uniforms.uWind.value = w; },
    update(dt, simTime) { uniforms.uTime.value = simTime; },
  };
}
