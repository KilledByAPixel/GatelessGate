import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// An open stone basin — the thing that actually holds water.
//
// Cases 7, 30 and 33 each built their vessel as a plain solid cylinder and then
// set the water surface a couple of centimetres BELOW its top face. A solid
// cylinder has a cap, so the cap covered the water completely: case 30's pond
// was a stone disc with the whole sheet, and all four koi, sealed inside it.
// That is the "the pond looks like a platform" note — it was a platform.
//
// This is the missing shape: a vessel with a hole in it. One lathe turns the
// whole profile — floor, inner wall, rim, outer wall — into a single mesh, so
// an open basin costs no more than the solid one it replaces.
//
// The ground plane is unbroken (see kit/ground.js), so a basin cannot be sunk
// into it; the floor sits just above ground level and the vessel stands proud,
// which is what a temple water basin does anyway.
export function makeBasin({
  inner = 1.0,           // radius of the water's room — the hole
  outer = 1.2,           // outer radius at the rim
  rim = 0.4,             // height of the rim above y = 0
  floor = 0.04,          // height of the inner floor, kept just clear of the ground
  color = WASH.stone,
  segments = 16,
} = {}) {
  const base = outer * 1.02;             // a slight outward flare at the foot
  const profile = [
    [0, floor],                          // the floor, closed at the centre
    [inner, floor],                      // out to the wall
    [inner, rim],                        // up the inside
    [outer, rim],                        // across the top of the rim
    [base, 0],                           // and down the outside to the ground
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(profile, segments),
    toonMaterial({ color, flat: true }));
  mesh.name = 'basin';
  return mesh;
}
