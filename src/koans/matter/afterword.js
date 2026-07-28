import MATTER from '../text/matter.js';

// Mumon's afterword, the Zen Warnings, and the letter that produced case 49 —
// in that order, so the book ends on "Say it quick. Say it quick."
//
// Amban's letter is really the preface to case 49, so a reader meets it after
// the case it introduces. That inversion is accepted: it reads as the machinery
// shown afterwards, and the alternative is editing a case.
//
// Same shape as preface.js, and the same reasoning: no number, so no seal and no
// narration; the hub for a scene until a bespoke one exists.
const page = MATTER.afterword;

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
  build(ctx) {
    return ctx.hub;
  },
};
