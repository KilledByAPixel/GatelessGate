import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK, ACCENT } from '../palette.js';
import { makeFigure } from './figure.js';

// The Buddha is NOT special (Frank, overnight pass 2: "Buddha is not supposed
// to have a whole special different look — use the same biped kit everyone
// else is using. He shouldn't be bigger than anyone else.").
//
// Two bespoke models died to learn this — round 1 "a fire hydrant / chess
// bishop", round 2 a fine statue that still read as a different species from
// every monk sitting near it. This is now a thin naming layer over the same
// figure kit the whole book speaks: the seated stance (whose lap shelf the
// old statue's rebuild pioneered — that work lives on in figure.js's
// SIT_PROFILE), sleeves folded into the lap, bare-headed. A buddha wears no
// sedge hat, and the sphere head needs nothing else: featureless is the
// house style for every face in the book.
//
// THE ONE MARK: the urna — a small vermillion dot centred on the forehead.
// A tiny sphere sunk into the skull (buried join: its centre stays inside
// the head so only the crest shows), parented to the head mesh so it derives
// from the skull it sits on and travels with it. It is always ACCENT, never
// the robe colour: the dot IS the mark, whatever the statue is carved from.
const URNA_ELEV = 0.5;      // radians above the head's equator — mid-forehead
const URNA_R = 0.20;        // fraction of the head's own radius — a dot, not a lamp
const URNA_SINK = 0.90;     // centre at 0.90·r: buried join, only the crest shows.
                            // Deeper than the usual 0.94–0.98 on purpose — on
                            // k9's all-red colossus the dot vanishes into the
                            // hue and only its SILHOUETTE is left, and at 0.96
                            // that bump broke the skull line like a wart. At
                            // 0.90 the face-on disc keeps ~90% of its width
                            // while the profile bump drops by a third.

export function makeBuddha({ height = 1.6, color = INK } = {}) {
  // the same seated figure every monk is; seated figures face local +z
  const g = makeFigure({ height, color, stance: 'sit', arms: 'fold', hat: false });
  g.name = 'buddha';

  const head = g.children.find((c) => c.name === 'head');
  const r = head.geometry.parameters.radius;
  const urna = new THREE.Mesh(
    new THREE.SphereGeometry(URNA_R * r, 8, 6),
    toonMaterial({ color: ACCENT, flat: true }));
  urna.name = 'urna';
  urna.userData.noOutline = true;   // a dot this small would drown in its own hull
  urna.position.set(
    0,
    Math.sin(URNA_ELEV) * r * URNA_SINK,
    Math.cos(URNA_ELEV) * r * URNA_SINK);
  head.add(urna);

  return g;
}
