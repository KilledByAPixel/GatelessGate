import MATTER from '../text/matter.js';

// Mumon's own preface, which is where the four lines the book is named after
// actually come from. Shaped like a koan module so it travels the same rails —
// the nav queue, the ink transitions, the scroll — and differs only in having
// no number, which is what turns off the seal and the narration.
//
// The scene is the hub: a path running through a freestanding red gate. That is
// not a placeholder standing in for art yet to come; it is the picture this text
// describes. A bespoke diorama may replace it, and does not have to.
const page = MATTER.preface;

export default {
  id: null,
  slug: page.slug,
  title: page.title,
  sections: page.sections,
  labels: page.labels,
  text: page.text,
  accent: undefined,          // the hub carries its own accent — the gate
  ambience: ['wind:0.30', 'music'],
  mood: 'in',
  camera: { distance: 14, azimuth: 0.5, polar: 1.3 },
  build(ctx) {
    return ctx.hub;
  },
};
