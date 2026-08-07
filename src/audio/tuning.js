// The entire tuning. One root and one scale FAMILY for all 49 cases, the way
// there is one ink and one accent — so a case can never contain two pitched
// things that disagree, and two cases can differ in mood without ever
// sounding like different apps.
//
// The family is the Japanese pair that answers "major or minor?" without
// being either:
//   in  — hirajoshi, the koto tuning. The half-step at degree 1 is the whole
//         reason to pick it: unmistakable without being a costume. Dark; the
//         book's default.
//   yo  — the folk scale: no half-steps, open, festival-bright. The "major"
//         that isn't major.
// Same root, three shared tones. A case declares its mood; the engine carries
// it. Semitone offsets from the root.
export const SCALES = {
  in: [0, 1, 5, 7, 8],
  yo: [0, 2, 5, 7, 9],
};
export const SCALE = SCALES.in;       // the default, and the drift-range basis
export const ROOT_HZ = 146.83;        // D3
export const DRIFT_OCTAVES = 2;       // how far the drift layer's walk may roam

// `degree` indexes the scale repeated across octaves: 0..4 is the first
// octave, 5 is the root an octave up, -1 is the top of the octave below.
// Both scales are five notes, so degree maths is mood-blind and a mood swap
// retunes without renumbering anything.
//
// Deliberately unbounded. DRIFT_OCTAVES constrains the drift layer's WALK, not
// this function — the furin calls it four octaves up and must not be clamped.
export function hz(degree, mood = 'in') {
  const sc = SCALES[mood] || SCALE;
  const n = sc.length;
  const oct = Math.floor(degree / n);
  const step = degree - oct * n;      // 0..n-1 even when degree is negative
  return ROOT_HZ * Math.pow(2, oct + sc[step] / 12);
}
