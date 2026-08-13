import * as THREE from '../../lib/three.module.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../palette.js';

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
// every angle, so it swamps Lambert's own angle-dependent shading and flattens
// the surface to one tone. Case 30's pond is where that showed — red water
// came out as a flat luminous disc and its ripples became invisible (Frank: "I
// barely see it do anything... for the red one the specular should still be
// white").
// Put the seal's glow on (or take it off) an EXISTING material, so a scene can
// move its red from one object to another without swapping material objects
// around. Swapping is a trap: the debug workbench caches a plain-Lambert clone
// per mesh and, on the shipped default, that clone is what actually renders —
// so a case that assigns a fresh washMaterial at runtime puts a differently-lit
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

export function washMaterial({ color = '#ffffff', flat = false, side = THREE.FrontSide, glow = true } = {}) {
  const m = new THREE.MeshLambertMaterial({ color, side });
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
  // ...and any SHADER AUGMENTATION hung on the authored material. onBeforeCompile
  // is how the kit adds vertex motion to a merged mesh without paying a draw call
  // per moving part (kit/foliage.js does it for the trees and pines; the grass
  // fields have always done it for blades and tufts). Dropping it here meant such
  // a material animated in the workbench's toon mode and stood dead still in the
  // shipped look — the exact shape of the moon's week of secret lighting, one row
  // down this same list. customProgramCacheKey travels with it or three.js
  // reuses one compiled program for materials whose injected source differs.
  // (Fifth property this clone has been caught dropping.)
  //
  // Object.hasOwn, NOT truthiness: THREE.Material's PROTOTYPE defines both of
  // these (a no-op and a "" key), so `if (src.onBeforeCompile)` is true for
  // every material ever made and would stamp the prototype's own no-ops onto
  // each clone as own properties. Harmless by luck, meaningless as a guard, and
  // it hid the fact that the check was never actually testing anything.
  if (Object.hasOwn(src, 'onBeforeCompile')) m.onBeforeCompile = src.onBeforeCompile;
  if (Object.hasOwn(src, 'customProgramCacheKey')) m.customProgramCacheKey = src.customProgramCacheKey;
  return m;
}
