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

// `glow: false` opts a surface OUT of the seal glow even when it is painted in
// an accent colour. The glow exists for a small held thing — a bowl, a dot, a
// bloom — that has to keep its brightness against the wash. Spread over a big
// lit SURFACE it does the opposite of its job: emissive light is the same from
// every angle, so it flattens the toon ramp to one tone and the form stops
// reading. Case 30's pond is where that showed — red water came out as a flat
// luminous disc and its ripples became invisible (Frank: "I barely see it do
// anything... for the red one the specular should still be white").
// Put the seal's glow on (or take it off) an EXISTING material, so a scene can
// move its red from one object to another without swapping material objects
// around. Swapping is a trap: the debug workbench caches a plain-Lambert clone
// per mesh and, on the shipped default, that clone is what actually renders —
// so a case that assigns a fresh toonMaterial at runtime puts a differently-lit
// material into a scene full of clones, and every object it touches visibly
// changes tone (Frank, on case 39's stones: "the other rocks change their
// colour a little bit... they suddenly turn a more bright colour").
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

export function toonMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide, glow = true } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), side });
  m.flatShading = flat;
  if (glow && SEAL.has(m.color.getHexString())) {
    m.emissive.copy(m.color);
    m.emissiveIntensity = SEAL_GLOW;
  }
  return m;
}

// THE SHIPPED SHADING, and the reason it lives here rather than in the
// workbench that used to own it.
//
// The book renders with the toon shader OFF (debug.js: `toon`, def false) —
// every lit material is rebuilt as a plain Lambert before it reaches the
// screen. The 3-step ramp above is an experiment knob, not the reader's view.
// So "what a model actually looks like" is THIS material, and anything that
// wants to show a model honestly — the workbench, the model viewer, a shot —
// has to build the same clone.
//
// It was built in one place and needed in two, which is the moment to move it:
// the comments below are a four-item list of properties this clone has been
// caught dropping, and a second hand-written copy elsewhere would start that
// list again from the top.
//
// `src` is the authored material; the result carries everything of it that
// affects rendering.
export function plainMaterial(src) {
  const m = new THREE.MeshLambertMaterial({
    color: src.color,
    side: src.side,
    flatShading: !!src.flatShading,
    transparent: !!src.transparent,
    opacity: src.opacity ?? 1,
  });
  m.fog = src.fog;
  // Carry the seal's glow across — this clone runs on the SHIPPED default
  // ("toon off"), so any property it drops never renders at all. That is
  // exactly how the moon spent a week secretly lit; see keepMaterial, which
  // is the caller's half of this and is documented at debug.js's traverse.
  if (src.emissive) {
    m.emissive.copy(src.emissive);
    m.emissiveIntensity = src.emissiveIntensity ?? 1;
  }
  // ...and visibility. Invisible tap proxies (bell-hit, screen-hit) hide at
  // the MATERIAL level so the raycaster still sees their meshes; dropping
  // this flag resurrected them as big white shells around the things they
  // wrap. Third property this clone has been caught losing (flatShading was
  // designed in, emissive and visible were not): the clone must copy
  // EVERYTHING that affects rendering, not the properties someone thought of.
  m.visible = src.visible;
  // ...and the texture. A material with a map cloned WITHOUT it renders as
  // a bare tinted quad — the cliff's mist sprites shipped that way and
  // nobody could tell what the pale rectangles were. (Fourth property this
  // clone has been caught dropping.)
  if (src.map !== undefined) m.map = src.map;
  if (src.alphaTest) m.alphaTest = src.alphaTest;
  return m;
}

// Key + fill. Two things matter here:
//
// 1. The shadow camera is fitted TIGHT to the staging footprint, and the map
//    is sized to hold ~100 texels/unit — the density that reads as contact
//    shadow (a 2k map over a 56-unit frustum is ~36 texels/unit and looks
//    like stair-stepped garbage; that derivation set the original ±10/2048
//    pair). The frustum went ±10 → ±15 on Frank's ask ("a lot of trees and
//    stuff are outside the range of the shadows — fifty percent bigger"),
//    and the map went 2048 → 3072 with it, so the coverage grew without the
//    texel density moving: 3072 over 30 units ≈ 102/unit, same as before.
// 2. The fill is a hemisphere, not a flat ambient. A uniform ambient lifts every
//    surface equally, which erases form — the single biggest reason the scene
//    read flat. A hemisphere is brighter from the sky and darker underneath, so
//    a robe or a stone still has a shaded side.
export function makeLights({ shadow = true, focus = [1.2, 0, 0.3], radius = 15 } = {}) {
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
    sun.shadow.mapSize.set(3072, 3072);
    const c = sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 0.5; c.far = 48;   // the wider frustum's far corners need the extra depth
    c.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
  }

  const fill = new THREE.HemisphereLight(new THREE.Color(PAPER), new THREE.Color(WASH.stone), 0.62);
  fill.name = 'fill';
  g.add(fill);
  return g;
}
