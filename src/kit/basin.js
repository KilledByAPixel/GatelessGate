import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
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
//
// LATHE WINDING. `LatheGeometry` derives its face winding from the order the
// profile is walked, and that order has to go the same direction bowl.js's
// does — up the OUTSIDE first, across the top, back down the INSIDE — or the
// whole shell's normals come out backwards: the interior read uniformly
// near-black (grazing angles) or vanished outright (steep-overhead, the
// culled backface showing whatever sits behind the mesh), confirmed with a
// LatheGeometry+computeVertexNormals probe against this exact profile before
// the fix (every band's face normal pointed down/inward instead of
// up/outward) and with real workbench screenshots after (see task-D5-report).
// The old order walked the INSIDE first (floor -> inner wall -> rim top ->
// outer wall), which is the reverse of a correctly-wound vessel. `DoubleSide`
// is added on top, matching bowl.js/vase.js's own lathe shells, as a second
// line of defence for any grazing angle a future camera might still catch
// wrong-side-on.
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
    [base, 0],                           // up the outside from the ground
    [outer, rim],                        // to the top of the rim
    [inner, rim],                        // across the rim lip — reads as a thin inset line
    [inner, floor],                      // down the inside wall
    [0, floor],                          // and in to the floor, closed at the centre
  ].map(([r, y]) => new THREE.Vector2(r, y));

  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(profile, segments),
    washMaterial({ color, flat: true, side: THREE.DoubleSide }));
  mesh.name = 'basin';
  return mesh;
}
