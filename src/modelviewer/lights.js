// THE VIEWER'S LIGHT RIG — the book's own, plus two lights the book never has.
//
// WHY THIS EXISTS AT ALL. The book lights a scene the way a painting is lit:
// one key from over the reader's shoulder and a hemisphere fill, aimed at a
// camera that never moves. That is right for a diorama seen from one fixed
// spot forever. It is wrong for a tool you ORBIT: turn past the key and the
// far side of the model is lit by the hemisphere alone, which has no
// direction in it, so there is nothing left to read a shape by.
//
// These lights are the SMALL half of the answer to a viewer that was hard to
// read in 3D, lit as though by a single lamp. The large half, historical now,
// was that the viewer used to render the toon ramp's 3-step banding long
// after the book itself had moved off it — the fix (and the material rebuild
// that carried it, since retired along with the ramp — see render/material.js)
// lived in a file this one has outlived. Measured over four views of the
// hanging monk, tones carrying ≥3% of the model, and the 5th–95th percentile
// spread of its greys:
//
//   toon (what the viewer showed):   2 tones, spread 21    <- a cut-out
//   toon + two extra fill lights:    5 tones, spread 21    <- brighter cut-out
//   Lambert (what the book ships):  10 tones, spread 82
//   Lambert + the two fills:        12 tones, spread 67
//
// Lights could not have fixed that on their own: two extra lights moved a
// 2-tone render to a 5-tone one, while the shading fix alone moved it to 10.
//
// So the viewer keeps the book's key exactly as it is — what you judge is
// still lit by the light that will actually light it — and adds two dim
// directionals filling the azimuths the key leaves dark. They are SPACED, not
// opposed: with the key near 51°, these sit near 171° and 291°, so no matter
// where you orbit to, some light is raking across the form rather than facing
// it flat on.
//
// THEY ARE SLIGHTLY DIFFERENT COLOURS, and that is the point rather than a
// decoration. Two greys of the same hue landing on adjacent facets read as one
// surface with a seam; a cool grey beside a warm one reads as two planes
// turning away from each other. It is the cheapest depth cue there is, and it
// costs the palette nothing because the tints are weak enough that a lit
// surface still sits on the book's paper-to-ink ramp.
//
// WHAT THIS IS NOT: a claim about how the model will look in its case. The
// book's rig is still in here and still doing most of the work, but these two
// flatter a model from angles the case camera will never see. Press L to drop
// them and check a model under the book's light alone before calling it done.
import * as THREE from '../../lib/three.module.js';

// Tuned by measurement, and the measurement said KEEP THEM DIM. Over four
// views of the hanging monk under the book's shipped Lambert shading, the
// 5th–95th percentile spread of the model's greys, and the count of tones
// carrying ≥3% of it:
//
//   no fills:      p05 22   spread 82   10 tones   <- but 22 is nearly black
//   cool 1.5/1.0:  p05 38   spread 67   12 tones
//   cool 2.2/1.5:  p05 44   spread 62   10 tones
//   cool 3.5/2.4:  p05 53   spread 53   10 tones
//
// Every step up trades range for a brighter shadow side. 1.5/1.0 is the knee:
// the darks come off the floor — at 22 the far side of a turntable is a hole
// you cannot judge a shape in — while the spread stays within a sixth of what
// the key alone gives, and it is the setting with the MOST distinct tones,
// which is the thing that actually reads as form.
//
// Positions are directions, not places: a directional light only cares where
// it sits relative to its target, and the target is the origin every model is
// built around. Low elevations on purpose (the key is already 52° up) — a
// light near the horizon is what carves a vertical fold.
export const VIEWER_FILLS = [
  // Cool, from behind and left: the rim that separates a dark model from the
  // paper behind it, and the only light on the far side during a turntable.
  { name: 'viewer-cool', color: 0x9fb7dd, intensity: 1.5, pos: [0.9, 2.6, -5.7] },
  // Warm, from the front-left and lower still: fills the cheek of the form
  // the key can't reach without brightening the side the key already owns.
  { name: 'viewer-warm', color: 0xe8c79c, intensity: 1.0, pos: [-5.6, 1.8, 2.2] },
];

// `extra: false` returns the book's rig alone — the honest comparison, and
// what the L key toggles back to.
export function makeViewerLights(kit, { extra = true } = {}) {
  const g = kit.makeLights();
  g.name = 'viewer-lights';
  if (!extra) return g;
  for (const f of VIEWER_FILLS) {
    const l = new THREE.DirectionalLight(f.color, f.intensity);
    l.name = f.name;
    l.position.set(f.pos[0], f.pos[1], f.pos[2]);
    // No target added: an unparented DirectionalLight targets the origin,
    // which is where every model in the roster is built. The book's rig has
    // to add its target only because it MOVES it, to the scene's focus.
    g.add(l);
  }
  return g;
}
