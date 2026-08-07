import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';
import { wash } from '../../palette.js';

// Mumon's own preface, which is where the four lines the book is named after
// actually come from. Shaped like a koan module so it travels the same rails —
// the nav queue, the ink transitions, the scroll — and differs only in having
// no number, which is what turns off the seal.
//
// The scene is the hub with its gate removed. That is not a scene waiting for
// art: it is the picture this text describes. "No gate as the gate of the
// teaching" — the path still runs through, the monk still walks it, the camera
// still centres where the gate stood, and there is nothing there. It is also
// the one scene in the book with no accent object in it, because the gate was
// the red thing — the text panel beside it still carries the usual accent red,
// since makeScroll defaults to it (src/ui/scroll.js).
//
// Its own three seeds, because taking the gate out was not enough to tell this
// page apart from the Contents it opens from — same hills, same trees, same
// bend in the road, so it read as the Contents with a prop missing rather than
// as a page (Frank: "right now it looks exactly the same"). Different land,
// different scatter, a road that bends the other way. Still the same valley,
// the way two drawings of one place are.
const page = MATTER.preface;
const SEEDS = { seed: 23, groundSeed: 41, pathSeed: 61 };

// AND A THINNER HORIZON. With the gate gone the eye has nothing to stop on and
// runs straight down the road — which ended in a mountain (Frank: "there's a
// mountain directly in front of the road"). No seed fixes that: sweeping eighty
// values of `seed` and a hundred and twenty of `pathSeed` found nothing that
// clears the road's vanishing bearing by more than a few degrees, because the
// title screen's fourteen peaks over that arc are a WALL — every bearing ends in
// one. So the band itself thins and moves back here: fewer peaks, further off,
// paler, and the near band cut to three low ones. The road runs out into haze
// instead of into rock, which is the right picture for "no gate as the gate".
const MOUNTAINS = [
  { count: 7, distance: 70, arcCenter:.2, arcSpan: 4.4, color: wash(0.12) },
  { count: 3, distance: 48, arcCenter:-.2, arcSpan: 3.6, color: wash(0.21), hScale: 0.55 },
];

export default {
  id: null,
  slug: page.slug,
  title: page.title,
  sections: page.sections,
  labels: page.labels,
  text: page.text,
  accent: undefined,
  ambience: ['wind:0.30', 'music'],
  mood: 'in',
  camera: { distance: 14, azimuth: 0.5, polar: 1.3 },
  build() {
    return buildHub({ gate: false, ...SEEDS, mountains: MOUNTAINS });
  },
};
