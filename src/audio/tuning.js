// The entire tuning. One scale for all 48 cases, the way there is one ink and
// one accent — so a case can never contain two pitched things that disagree.
//
// Hirajoshi, the koto tuning. The half-step at degree 1 is the whole reason to
// pick it: it is the interval that reads as unmistakably Japanese without the
// scale becoming a costume. Semitone offsets from the root.
export const SCALE = [0, 1, 5, 7, 8];
export const ROOT_HZ = 146.83;        // D3
export const DRIFT_OCTAVES = 2;       // how far the drift layer's walk may roam

// `degree` indexes SCALE repeated across octaves: 0..4 is the first octave, 5 is
// the root an octave up, -1 is the top of the octave below.
//
// Deliberately unbounded. DRIFT_OCTAVES constrains the drift layer's WALK, not
// this function — the furin calls it four octaves up and must not be clamped.
export function hz(degree) {
  const n = SCALE.length;
  const oct = Math.floor(degree / n);
  const step = degree - oct * n;      // 0..n-1 even when degree is negative
  return ROOT_HZ * Math.pow(2, oct + SCALE[step] / 12);
}
