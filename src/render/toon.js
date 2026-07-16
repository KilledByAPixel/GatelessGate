import * as THREE from '../../lib/three.module.js';

// One shared 3-step ramp: shadow, mid, light. NearestFilter keeps the bands hard.
let ramp = null;
export function toonRamp() {
  if (!ramp) {
    const data = new Uint8Array([80, 160, 255]);
    ramp = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

export function toonMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side });
  m.flatShading = flat;
  return m;
}

export function makeLights() {
  const g = new THREE.Group();
  g.name = 'lights';
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(4, 7, 3);
  const amb = new THREE.AmbientLight(0xffffff, 0.38);
  g.add(sun, amb);
  return g;
}
