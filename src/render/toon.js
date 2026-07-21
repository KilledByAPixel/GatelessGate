import * as THREE from '../../lib/three.module.js';
import { PAPER, WASH } from '../palette.js';

// One shared 3-step ramp: shadow, mid, light. NearestFilter keeps the bands hard.
let ramp = null;
export function toonRamp() {
  if (!ramp) {
    const data = new Uint8Array([80, 160, 255]);
    ramp = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
    ramp.userData = { shared: true };
  }
  return ramp;
}

export function toonMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side });
  m.flatShading = flat;
  return m;
}

// Key + fill. Two things matter here:
//
// 1. The shadow camera is fitted TIGHT to the staging footprint. A 2k map spread
//    over a 56-unit frustum is ~36 texels/unit and looks like stair-stepped
//    garbage; over 20 units it is ~100 texels/unit and reads as contact shadow.
// 2. The fill is a hemisphere, not a flat ambient. A uniform ambient lifts every
//    surface equally, which erases form — the single biggest reason the scene
//    read flat. A hemisphere is brighter from the sky and darker underneath, so
//    a robe or a stone still has a shaded side.
export function makeLights({ shadow = true, focus = [1.2, 0, 0.3], radius = 10 } = {}) {
  const g = new THREE.Group();
  g.name = 'lights';

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(focus[0] + 5.5, 9, focus[2] + 4.5);
  sun.target.position.set(focus[0], 0, focus[2]);
  g.add(sun, sun.target);

  if (shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 0.5; c.far = 42;
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
  }

  const fill = new THREE.HemisphereLight(new THREE.Color(PAPER), new THREE.Color(WASH.stone), 0.62);
  fill.name = 'fill';
  g.add(fill);
  return g;
}
