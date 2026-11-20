import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { hash1 } from '../util/noise.js';
import { INK_LIT } from '../palette.js';
import { makeFigure } from './figure.js';

// A seated crowd as one InstancedMesh (one draw call): a simplified seated
// monk repeated in a shallow arc, each facing a focal point. Hero figures
// (Buddha, Kasyapa) are placed separately by the scene.
//
// The arc is the caller's: `arcSpan` is the angle it subtends and `arcCenter`
// the bearing its middle sits at from `center` (same convention as the facing
// maths — 0 is +z, positive swings toward +x), so two crowds can ring one
// spot from opposite sides. The defaults are the original fixed fan every
// older case was staged against.
//
// THE PER-INSTANCE GEOMETRY IS A SEATED FIGURE, WHOLE — makeFigure's own
// output flattened to one geometry, not parts borrowed from it. A hand-kept
// copy of the figure's profiles drifts from the figure it copies; built this
// way there is nothing to keep in step: whatever a seated monk is, the crowd
// is. Trimming parts for economy buys nothing here — an instanced mesh is one
// geometry and one draw however many triangles it carries.
const FIG_H = 1.5;    // the height each crowd figure is authored at (world units)
const SLIM = 0.8;     // radial squeeze — figure.js's `stout`, run below 1: a
                      //   full-width seated figure is ~1.0 wide at this height
                      //   and the arc packs figures ~0.6 apart, so un-slimmed
                      //   robes merge into one black bank; hem point 0 stays
                      //   put, same as stout, so the figure thins around its
                      //   axis — but the KNEES keep their size (see figure.js:
                      //   the crowd spends its width on the one event fog
                      //   can't erase)
// exported for the test that holds the crowd to the figure it is built from
export const CROWD_FIGURE = { height: FIG_H, stout: SLIM };
// One seated monk as a single geometry in the figure's own frame (on the
// ground, fronting +z). The figure is built only to be read: its meshes are
// flattened through their own transforms — a forearm rides an upper arm — and
// its material is thrown away, so the crowd's material stays the crowd's.
function seatedFigureGeometry() {
  const figure = makeFigure({ height: FIG_H, stout: SLIM, stance: 'sit', arms: 'fold', hat: true });
  figure.updateMatrixWorld(true);
  const parts = [];
  const mats = new Set();
  figure.traverse((o) => {
    if (!o.isMesh) return;
    parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    mats.add(o.material);
  });
  const geo = mergeSimple(parts);
  for (const p of parts) p.dispose();
  for (const m of mats) m.dispose();
  return geo;
}

// HOW EACH ONE SITS. The instances share a geometry, so a crowd cannot vary
// the way standing figures do (by how their arms hang); what an instance owns
// is its transform. Scale and tint already differ. This is the lean: nobody in
// a hall sits plumb, and a ring of identical hats all dead level is the stamp
// showing. Each figure tips a few degrees off vertical in its own direction,
// and is set down by as much as its cushion's rim would otherwise lift, so
// the lean never opens a gap under the low edge. Small enough that no one
// reads as falling asleep — it is how a man sits, not a pose.
const LEAN = [0.025, 0.045];   // radians: the least, and the range above it

// How far the figure's footing reaches from its axis — the rim a lean pivots
// on. Read off the geometry, since the cushion is figure.js's to resize.
function footingRadius(geo) {
  const p = geo.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 1e-4) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  }
  return r;
}

export function makeAssembly({ count = 8, radius = 3.0, center = [0, 0], facing = [0, 0], spread = 1.4, color = INK_LIT, seed = 6, arcSpan = Math.PI * 0.7, arcCenter = 0 } = {}) {
  const geo = seatedFigureGeometry();
  const seatR = footingRadius(geo);

  const mesh = new THREE.InstancedMesh(geo, washMaterial({ color, flat: true }), count);
  mesh.name = 'assembly';

  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const turn = new THREE.Quaternion(), tip = new THREE.Quaternion();
  const axis = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const plan = [];   // plan-view [x, z] per instance, for the footprint below
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const ang = arcCenter - arcSpan / 2 + t * arcSpan;
    const rr = radius + (hash1(i * 2 + 1, seed) - 0.5) * spread;
    const x = center[0] + Math.sin(ang) * rr;
    const z = center[1] + Math.cos(ang) * rr;
    plan.push([x, z]);
    const yaw = Math.atan2(facing[0] - x, facing[1] - z);
    const sc = 0.9 + 0.2 * hash1(i * 2 + 7, seed);
    const lean = LEAN[0] + LEAN[1] * hash1(i * 2 + 11, seed);
    const toward = hash1(i * 2 + 13, seed) * Math.PI * 2;
    axis.set(Math.cos(toward), 0, Math.sin(toward));
    turn.setFromAxisAngle(UP, yaw).multiply(tip.setFromAxisAngle(axis, lean));
    m.compose(
      new THREE.Vector3(x, -Math.sin(lean) * seatR * sc, z),
      turn,
      new THREE.Vector3(sc, sc, sc),
    );
    mesh.setMatrixAt(i, m);
    // A MULTIPLIER, NOT A COLOUR. setColorAt feeds instanceColor, which the
    // shader MULTIPLIES into the material's diffuse — so writing the crowd's
    // own colour here painted every figure at that colour SQUARED. At the old
    // INK that was (30/255)² ≈ level 3: pure black, which is why the seated
    // crowds stayed flat cut-outs after every other figure in the book had been
    // lifted off ink — the seated crowds stayed noticeably darker than every
    // other figure. Around 1.0 it does what it was always meant to: a tenth of
    // a stop of variation between neighbours, so a row of them is not one
    // stamped-out silhouette repeated.
    const k = 1 + (hash1(i * 2 + 3, seed) - 0.5) * 0.2;
    col.setScalar(k);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  // THE FOOTPRINT, published for keepouts. The kit's rule is keepouts by live
  // reference, but an instanced crowd cannot be an `{ at: object }` target:
  // the mesh sits at the origin and the placement lives in world-space
  // instance matrices, so a keepout aimed at the mesh guards empty grass at
  // (0,0). This is the honest equivalent — the smallest circle around where
  // the figures actually sit (plus a seated figure's own reach), recomputed
  // from the same numbers that placed them, so a retuned arc moves its
  // keepout with it. Callers add their own breathing room.
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length;
  const cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const reach = Math.max(...plan.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  mesh.userData.footprint = { x: cx, z: cz, r: reach + 0.4 };
  return mesh;
}
