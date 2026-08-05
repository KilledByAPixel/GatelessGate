// WHAT THE VIEWER RENDERS WITH — the book's shipped shading, which is not the
// shading the viewer used to show.
//
// The kit builds every lit surface as a MeshToonMaterial, and for a long time
// the viewer rendered exactly that. The book does not: it ships with the toon
// toggle OFF (debug.js: `toon`, def false) and rebuilds each material as a
// plain Lambert on the way to the screen. So the viewer was showing a mode no
// reader ever sees.
//
// It showed badly, too, which is what surfaced it. The 3-step ramp's top texel
// covers every normal within about 71° of a light — nearly the whole visible
// side of a rounded low-poly form — so every facet resolved to one tone and
// models read as flat grey cut-outs (Frank: "it's kinda hard to see in 3D").
// Measured over four views of the hanging monk, tones carrying ≥3% of the
// model, and the 5th–95th percentile spread of its greys:
//
//   toon (what the viewer showed):   2 tones, spread 21    <- a cut-out
//   toon + two extra fill lights:    5 tones, spread 21    <- brighter cut-out
//   Lambert (what the book ships):  10 tones, spread 82
//   Lambert + the two fills:        12 tones, spread 67
//
// That is the whole finding: no amount of extra light fixes a 2-tone render,
// because the ramp — not the rig — was quantising the form away. The fills in
// lights.js are worth having on top, but they are the small half.
import { plainMaterial } from '../render/toon.js';

// Swap in place, on a freshly built model. The two guards are copied from the
// workbench's traverse and are not optional:
//
//   keepMaterial — the moon, the koi's unlit skin, the cliff's mist sprites
//   and the water surface are deliberately NOT lit. Cloning them to Lambert
//   puts them under the sun, and the moon spent a week secretly lit that way.
//   grassfield — its wind bend lives in its own shader, and a clone freezes
//   the grass mid-stride.
//
// Outline hulls are left alone as well: they are flat ink by design and
// nothing about them is lit.
export function applyBookShading(obj) {
  obj.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    if (o.name === 'grassfield' || o.userData.keepMaterial) return;
    if (Array.isArray(o.material)) o.material = o.material.map(plainMaterial);
    else if (o.material) o.material = plainMaterial(o.material);
  });
  return obj;
}
