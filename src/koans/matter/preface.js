import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';

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
    return buildHub({ gate: false, ...SEEDS });
  },
};
