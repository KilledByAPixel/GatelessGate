// The key and fill rig. It lived in toon.js only because that file was once
// "everything about how a surface looks"; it has nothing to do with a shading
// model and outlived the one it shared a file with.
import * as THREE from '../../lib/three.module.js';
import { PAPER, WASH } from '../palette.js';
import { eyePosition } from '../camera.js';

// WHERE THE KEY STANDS, in the same vocabulary a case's `camera:` block speaks:
// heading in degrees around the focus (0 is square in front, on +z), pitch in
// degrees above it. A case names its own with `sun: { heading, pitch }`, and
// these are the numbers the workbench's "Sun heading"/"Sun height" sliders
// read, so an angle found by dragging is the angle typed into the file.
//
// Relative to the case's own camera heading, the aim is what kind of light it
// is: a small difference is frontal and flat, a quarter turn rakes across the
// staging, and a half turn is contre-jour with the shadows running toward the
// reader. The default sits a little to the camera's right of most cases'
// framing — a mild three-quarter key, which is what the whole book was lit by
// before any case could name its own.
export const SUN_DEFAULT = { heading: 51, pitch: 52 };

// How high the key may stand: the workbench sliders' range, the staging net's
// rail, and the same numbers, so anything that can be dialled can be shipped.
// A rail against nonsense, not against taste — the composition inside it is the
// case's call. Only the low end has a cost worth knowing: shadows lengthen as
// 1/tan(pitch), and down near the floor a tall caster's shadow runs past the
// edge of the shadow camera and is cut off mid-ground.
export const SUN_PITCH_RANGE = [12, 84];

// The key's height above the focus is FIXED and the pitch moves it out rather
// than down, so a low sun does not sink below the canopy it is meant to be
// casting from — the shadow camera's near plane clips anything standing above
// the light, and a tree that loses its shadow that way fails silently.
const SUN_HEIGHT = 9;

// Aim an existing key. Split out because the workbench drives the same light
// live: one path from the case's numbers to the light's position, so a dragged
// angle and an authored one cannot land in different places.
export function aimSun(sun, { heading, pitch } = SUN_DEFAULT) {
  const t = sun.target.position;
  const [x, y, z] = eyePosition(
    { heading, pitch, distance: SUN_HEIGHT / Math.sin(pitch * Math.PI / 180) },
    [t.x, t.y, t.z],
  );
  sun.position.set(x, y, z);
  sun.userData.aim = { heading, pitch };
}

// Key + fill. Two things matter here:
//
// 1. The shadow camera is fitted TIGHT to the staging footprint, and the map
//    is sized to hold ~100 texels/unit — the density that reads as contact
//    shadow (a 2k map over a 56-unit frustum is ~36 texels/unit and looks
//    like stair-stepped garbage; that derivation set the original ±10/2048
//    pair). The frustum went ±10 → ±15 to bring in the trees that were falling
//    outside the shadowed range, and the map went 2048 → 3072 with it, so the
//    coverage grew without the texel density moving: 3072 over 30 units ≈
//    102/unit, same as before. THE TWO MOVE TOGETHER — a scene that needs a
//    wider frustum than a diorama's staging (the showcase's forty-unit room)
//    has to raise `mapSize` with it or it silently gets half the density and
//    its shadows read chunky next to every real page's.
// 2. The fill is a hemisphere, not a flat ambient. A uniform ambient lifts every
//    surface equally, which erases form — the single biggest reason the scene
//    read flat. A hemisphere is brighter from the sky and darker underneath, so
//    a robe or a stone still has a shaded side.
export function makeLights({ shadow = true, focus = [1.2, 0, 0.3], radius = 15, sun: aim = SUN_DEFAULT, mapSize = 3072 } = {}) {
  const g = new THREE.Group();
  g.name = 'lights';

  // The key sat at 9.5 for one commit, and the verdict split it: the RED was
  // right at that light, but the ground blew out to nearly white with no
  // shading left and the distance washed out. Keep the red, bring everything
  // else back down — and those two cannot share one number, so they don't. The
  // red's extra brightness moved into the materials themselves as SEAL_GLOW
  // (material.js), where the sun can't take it away, and the key came back to
  // the level the scene was right at.
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
  sun.target.position.set(focus[0], 0, focus[2]);
  aimSun(sun, aim);
  g.add(sun, sun.target);

  if (shadow) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const c = sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 0.5; c.far = 48;   // the wider frustum's far corners need the extra depth
    c.updateProjectionMatrix();
    // These two are the acne/halo trade, and this pair is where it settled
    // AFTER a retuning attempt (2026-08) that tried to shrink the white gap
    // where a caster meets the ground. What that round established: positive
    // bias does close the gap (it tips borderline pixels into shadow) but
    // broke scenes outright; smaller magnitudes here still showed artifacts by
    // eye. The theory said small bias was safe because the ground and grass
    // never cast (debug.js) — but everything else does, mountains and roofs
    // included, and those broad soft-sloped casters still self-shadow through
    // the map. So the contact halo is the price of clean surfaces at this
    // texel density (~100/unit); the road to a tighter contact is MORE density
    // (a smaller per-case `radius`, which this function already takes), not
    // smaller bias.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
  }

  const fill = new THREE.HemisphereLight(new THREE.Color(PAPER), new THREE.Color(WASH.stone), 0.62);
  fill.name = 'fill';
  g.add(fill);
  return g;
}
