import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK, INK_LIT, ACCENT, ACCENT_DEEP, ACCENT_LIGHT, ACCENT_PALE } from '../palette.js';
import { makeFigure, HEAD_OBLONG } from './figure.js';

// The Buddha is NOT special (Frank, overnight pass 2: "Buddha is not supposed
// to have a whole special different look — use the same biped kit everyone
// else is using. He shouldn't be bigger than anyone else.").
//
// Two bespoke models died to learn this — round 1 "a fire hydrant / chess
// bishop", round 2 a fine statue that still read as a different species from
// every monk sitting near it. This is now a thin naming layer over the same
// figure kit the whole book speaks: the seated stance (whose lap shelf the
// old statue's rebuild pioneered — that work lives on in figure.js's
// SIT_PROFILE and whose knees it pioneered), sleeves folded into the lap,
// bare-headed. A buddha wears no sedge hat; featureless is the house style
// for every face in the book. What makes him HIM is two marks on the same
// shared skull — the topknot and the urna — and nothing below the neck.
//
// THE ONE MARK: the urna — a small dot centred on the forehead. A tiny sphere
// sunk into the skull (buried join: its centre stays inside the head so only
// the crest shows), parented to the head mesh so it derives from the skull it
// sits on and travels with it.
//
// IT CONTRASTS WITH THE HEAD, which is the whole job of a mark. It used to be
// ACCENT unconditionally — right for an ink statue and useless on a red one,
// where a red dot on a red skull leaves nothing but a bump (Frank: "we still
// need to add the black dot to the head of the red figures"). The comment on
// URNA_SINK below is the record of trying to solve that with GEOMETRY instead:
// the dot was buried deeper so its silhouette would carry what its colour no
// longer could. A mark that has to be read as a lump is not a mark. So a red
// head takes an ink dot and everything else keeps the vermillion.
// THE SECOND MARK: the topknot ("we can make Buddha special with, like, a
// topknot"). A single bun sunk into the crown — the ushnisha's read at the
// detail floor: one sphere, its centre buried so the crest sits proud of the
// skull line. It is a silhouette event (the one thing allowed to break the
// crown), and it wears the figure's own material — hair on an ink man,
// stone on k9's colossus. Monks keep their hats and bare heads; buddha =
// bare head + topknot + urna.
const KNOT_R = 0.44;        // fraction of the head's radius — a bun, not a second head
const KNOT_SINK = 1.1;     // centre at 0.82·r: crest proud by ~0.26·r, enough
                            //   to break the crown line at case distance
                            //   without reading as a hat

const URNA_ELEV = 0.8;      // radians above the head's equator — mid-forehead
const URNA_R = 0.20;        // fraction of the head's own radius — a dot, not a lamp
const URNA_SINK = 0.90;     // centre at 0.90·r: buried join, only the crest shows.
                            // Deeper than the usual 0.94–0.98, and it STAYS
                            // there now for the reason it was originally
                            // reached for by accident: at 0.96 the bump broke
                            // the skull line like a wart. It was also carrying
                            // k9's all-red colossus, where the dot vanished
                            // into the hue and only its silhouette was left —
                            // that half of the job belongs to the contrast
                            // rule above, which does it properly.

// A red mark on a red head is a bump; an ink one on an ink head is a smudge.
// The heads in this book are either ink or one of the accents, so the rule is
// one line and needs no colour maths.
const ACCENTS = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT, ACCENT_PALE].map((c) => c.toLowerCase()));
export const markFor = (headColor) =>
  (ACCENTS.has(String(headColor).toLowerCase()) ? INK : ACCENT);

export function makeBuddha({
  height = 1.6, color = INK_LIT, cushion = true,
  // Override the contrast rule. Nothing in the book does; it is here so a case
  // carving a statue out of something that is neither ink nor accent can say
  // what its mark should be rather than getting vermillion by default.
  markColor = null,
} = {}) {
  // the same seated figure every monk is; seated figures face local +z
  const g = makeFigure({ height, color, stance: 'sit', arms: 'fold', hat: false, cushion });
  g.name = 'buddha';

  const head = g.children.find((c) => c.name === 'head');
  // parameters.radius is the sphere BEFORE the oblong bake (figure.js scales
  // the geometry, not the mesh) — stretch the marks' placements by the same
  // factors so sink depths keep meaning "fraction of the actual shell"
  const r = head.geometry.parameters.radius;

  const knot = new THREE.Mesh(new THREE.SphereGeometry(KNOT_R * r, 8, 6), head.material);
  knot.name = 'topknot';
  knot.position.y = KNOT_SINK * r * HEAD_OBLONG[1];   // on the crown, centred — the seal of the silhouette
  head.add(knot);

  const urna = new THREE.Mesh(
    new THREE.SphereGeometry(URNA_R * r, 8, 6),
    washMaterial({ color: markColor || markFor(color), flat: true }));
  urna.name = 'urna';
  urna.position.set(
    0,
    Math.sin(URNA_ELEV) * r * URNA_SINK * HEAD_OBLONG[1],
    Math.cos(URNA_ELEV) * r * URNA_SINK * HEAD_OBLONG[2]);
  head.add(urna);

  return g;
}
