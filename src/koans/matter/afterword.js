import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';

// Mumon's afterword, the Zen Warnings, and the letter that produced case 49 —
// in that order, so the book ends on "Say it quick. Say it quick."
//
// Amban's letter is really the preface to case 49, so a reader meets it after
// the case it introduces. That inversion is accepted: it reads as the machinery
// shown afterwards, and the alternative is editing a case.
//
// The scene is the world with everything taken out of it — no gate, no path, no
// lanterns, no one walking. Ground, mountains, forest, and the fog. The stage
// clears as the book closes.
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
  camera: { distance: 16, azimuth: 0.5, polar: 1.3 },
  build() {
    return buildHub({ gate: false, path: false, monk: false, lanterns: false });
  },
};
