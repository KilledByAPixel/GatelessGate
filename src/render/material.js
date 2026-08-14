import * as THREE from '../../lib/three.module.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../palette.js';

// THE SEAL GLOWS. The red is held at the brightness it reached under a
// blown-out key (sun 9.5) while the rest of the scene comes back down — which
// means the accent's brightness cannot ride on the sun at all. So every
// material in the accent family gets an emissive term of its own colour: light
// the lights never touch. This is also what the real pigment does — vermillion
// seal paste sits OPAQUE on top of a sumi wash, brighter than any ink around
// it, and does not dim with the wash.
//
// Detection is by colour, deliberately: cases already mark their one red thing
// by passing an accent constant, so this is one rule in one place instead of an
// option threaded through eleven koan files. The glow value is measured, not
// guessed — tuned in-browser until peak red chroma under the calmer sun matched
// what it looked like under the hard one.
const SEAL = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
  .map((c) => new THREE.Color(c).getHexString()));
export const SEAL_GLOW = 0.5;

// `glow: false` opts a surface OUT of the seal glow even when it is painted in
// an accent colour. The glow exists for a small held thing — a bowl, a dot, a
// bloom — that has to keep its brightness against the wash. Spread over a big
// lit SURFACE it does the opposite of its job: emissive light is the same from
// every angle, so it swamps Lambert's own angle-dependent shading and flattens
// the surface to one tone. Case 30's pond is where that showed — red water came
// out as a flat luminous disc and its ripples became invisible. Even on a red
// surface the specular has to stay white. Put the seal's glow on (or take it
// off) an EXISTING material, so a scene can move its red from one object to
// another without swapping material objects around. Mutating in place is simply
// cheaper — no new material object, no fresh shader link — and it cannot drop
// whatever else the case authored on that material (flatShading, side,
// opacity...) the way a hand-built replacement can if it forgets to repeat one.
//
// The old reason was sharper: the debug workbench cached a plain-Lambert clone
// per mesh, and on the shipped default that clone was what actually rendered,
// so a case that assigned a fresh washMaterial at runtime dodged the cache
// entirely and every clone-rendered neighbour it touched changed tone at once —
// case 39's other stones would visibly brighten together. That clone system is
// gone — what the swap breaks now is just the properties it forgets, which is
// quieter but the same advice: don't swap, mutate.
export function setSeal(material, on, color = ACCENT) {
  if (!material || !material.emissive) return material;
  if (on) {
    material.emissive.set(color);
    material.emissiveIntensity = SEAL_GLOW;
  } else {
    material.emissive.set(0x000000);
    material.emissiveIntensity = 1;
  }
  return material;
}

// FRONT faces into the shadow map — the contact-gap fix, opt-in per prop.
//
// The renderer's default records a mesh's BACK surface into the shadow map
// (the anti-acne default), so a prop's shadow is cast by its far side —
// shifted toward the sun by the prop's own thickness — and where the prop
// meets the ground that shift shows as a white line between the base and the
// shadow it stands in. Peter-panning. Near-face depth closes the gap; the
// acne it risks is on the prop's own lit side, which the sun's normalBias
// (lights.js) absorbs. Shadow pass only — the visible render is untouched.
//
// Opt-in, not the default, because the back-face default is what keeps the
// big receivers (ground, mountains, roofs) acne-free — apply this to the
// props whose ground contact the reader actually looks at. And an open mesh
// becomes a LIGHT PIPE under front-face depth: a lathe or tube with an open
// end lets the sun straight through the hollow and lights a hole in its own
// shadow (the figure's neck opening did exactly this — see the CAP points in
// kit/figure.js). Close the geometry before opting it in.
export function frontShadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.material.shadowSide = THREE.FrontSide; });
  return obj;
}

export function washMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide, glow = true } = {}) {
  const m = new THREE.MeshLambertMaterial({ color, side });
  m.flatShading = flat;
  if (glow && SEAL.has(m.color.getHexString())) {
    m.emissive.copy(m.color);
    m.emissiveIntensity = SEAL_GLOW;
  }
  return m;
}
