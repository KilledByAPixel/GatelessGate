// The key and fill rig. It lived in toon.js only because that file was once
// "everything about how a surface looks"; it has nothing to do with a shading
// model and outlived the one it shared a file with.
import * as THREE from '../../lib/three.module.js';
import { PAPER, WASH } from '../palette.js';

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
  // extra brightness moved into the materials themselves as SEAL_GLOW
  // (material.js), where the sun can't take it away, and the key came back to the scene light
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
