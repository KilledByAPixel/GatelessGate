import * as THREE from '../../lib/three.module.js';
import { PAPER, WASH, ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../palette.js';

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

// THE SEAL GLOWS. Frank wants the red held at the brightness it reached under a
// blown-out key (sun 9.5) while the rest of the scene comes back down — which
// means the accent's brightness cannot ride on the sun at all. So every material
// in the accent family gets an emissive term of its own colour: light the lights
// never touch. This is also what the real pigment does — vermillion seal paste
// sits OPAQUE on top of a sumi wash, brighter than any ink around it, and does
// not dim with the wash.
//
// Detection is by colour, deliberately: cases already mark their one red thing
// by passing an accent constant, so this is one rule in one place instead of an
// option threaded through eleven koan files. The glow value is measured, not
// guessed — tuned in-browser until peak red chroma under the calmer sun matched
// what Frank approved under the hard one.
const SEAL = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
  .map((c) => new THREE.Color(c).getHexString()));
const SEAL_GLOW = 0.5;

export function toonMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side });
  m.flatShading = flat;
  if (SEAL.has(m.color.getHexString())) {
    m.emissive.copy(m.color);
    m.emissiveIntensity = SEAL_GLOW;
  }
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

  // The key sat at 9.5 for one commit, and Frank's verdict split it: the RED was
  // right at that light, the GROUND was "basically white — you don't need any
  // shading," and the distance washed out. He wanted the red kept and everything
  // else back down. Those two can't share one number — so they don't. The red's
  // extra brightness moved into the materials themselves as SEAL_GLOW above,
  // where the sun can't take it away, and the key came back to the scene light
  // he approved, nudged up as asked.
  //
  // Measured on case 29 (blown-white % of frame / peak red chroma):
  //   sun 6.5 no glow: 3.5% / 140     <- "before", scene right, red weak
  //   sun 9.5 no glow: ~26% / ~190    <- red right, ground white
  //   sun 6.7 + glow:  ~6% / ~184     <- both, which one number never gave
  //
  // The fill stays put. The contrast is meant to come from the key alone;
  // pulling the fill down as well would crush the shadow side of every form and
  // lose the wash.
  const sun = new THREE.DirectionalLight(0xffffff, 6.7);
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
