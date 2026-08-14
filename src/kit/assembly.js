import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { hash1 } from '../util/noise.js';
import { INK_LIT } from '../palette.js';
import { seatedBodyGeometry, HAT_PROFILE } from './figure.js';

// A seated crowd as one InstancedMesh (one draw call): a simplified seated
// monk repeated in a shallow arc, each facing a focal point. Hero figures
// (Buddha, Kasyapa) are placed separately by the scene.
//
// The per-instance geometry is built from figure.js's OWN seated-robe and
// sedge-hat profiles, not from a stand-in: a cone-and-ball pawn was tried first
// and read as exactly what it was: a triangle with a tiny circle head. The obi
// pinch, the collar step and the hat brim are all silhouette events, so they
// survive fog distance for free — a crowd member is the hero monk's shape with
// the sleeves dropped. It builds that geometry itself, and it is now the ONLY
// thing in the kit that drops them: figure.js used to take `arms: null` for the
// same economy, but bakeStatic made arms free on a still crowd and the option
// was retired unused.
const FIG_H = 1.5;    // the height each crowd figure is authored at (world units)
const SLIM = 0.8;     // radial squeeze — figure.js's `stout`, run below 1: a
                      //   full-width seated figure is ~1.0 wide at this height
                      //   and the arc packs figures ~0.6 apart, so un-slimmed
                      //   robes merge into one black bank; hem point 0 stays
                      //   put, same as stout, so the figure thins around its
                      //   axis — but the KNEES keep their size (see figure.js:
                      //   the crowd spends its width on the one event fog
                      //   can't erase)
export function makeAssembly({ count = 8, radius = 3.0, center = [0, 0], facing = [0, 0], spread = 1.4, color = INK_LIT, seed = 6, arcSpan = Math.PI * 0.7, arcCenter = 0 } = {}) {
  // the seated body comes from figure.js WITH its knees merged in — a crowd
  // member folds the same legs the hero monks do, at crowd polycount
  const bodyGeo = seatedBodyGeometry({ height: FIG_H, width: SLIM, segments: 8 });
  const headGeo = new THREE.SphereGeometry(0.095 * FIG_H, 10, 8);
  headGeo.translate(0, 0.515 * FIG_H, 0);
  const hatGeo = new THREE.LatheGeometry(
    HAT_PROFILE.map(([r, y]) => new THREE.Vector2(r * FIG_H, y * FIG_H)), 10);
  hatGeo.translate(0, 0.560 * FIG_H, 0);
  const geo = mergeSimple([bodyGeo, headGeo, hatGeo]);

  const mesh = new THREE.InstancedMesh(geo, washMaterial({ color, flat: true }), count);
  mesh.name = 'assembly';

  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const arc = arcSpan;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const ang = arcCenter-arc / 2 + t * arc;
    const rr = radius + (hash1(i * 2 + 1, seed) - 0.5) * spread;
    const x = center[0] + Math.sin(ang) * rr;
    const z = center[1] + Math.cos(ang) * rr;
    const yaw = Math.atan2(facing[0] - x, facing[1] - z);
    const sc = 0.9 + 0.2 * hash1(i * 2 + 7, seed);
    m.compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
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
  return mesh;
}
