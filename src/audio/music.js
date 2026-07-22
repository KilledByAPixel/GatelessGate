import { SCALE, DRIFT_OCTAVES } from './tuning.js';

// The drift layer: the sparse, sourceless tones that carry the scenes with
// nothing in them to make a noise. Everything here is pure and takes an injected
// rng — production is unseeded on purpose (music that replayed the same sequence
// every time you opened a case would become recognizable, and recognizable is
// the one thing an ambient bed must never be), but the LOGIC is still testable.

export const BASE_MIN = 6;         // seconds between notes, in an empty scene
export const BASE_MAX = 20;
export const REST_CHANCE = 0.2;
export const DRIFT_LO = 0;
export const DRIFT_HI = SCALE.length * DRIFT_OCTAVES;   // 10 — two octaves

// Weighted walk, not a uniform pick. Mostly neighbours, sometimes a small leap,
// never zero: uniform random over a scale sounds shuffled, and a repeated note
// sounds like a stutter. Weights sum to 1.
const STEPS = [
  [1, 0.30], [-1, 0.30],
  [2, 0.125], [-2, 0.125],
  [3, 0.05], [-3, 0.05],
  [4, 0.025], [-4, 0.025],
];

export function nextDegree(prev, rng, lo = DRIFT_LO, hi = DRIFT_HI) {
  let r = rng();
  let step = STEPS[0][0];
  for (const [s, w] of STEPS) { if (r < w) { step = s; break; } r -= w; }

  let next = prev + step;
  // Reflect rather than clamp, so the register turns around at the ends instead
  // of piling up against them.
  if (next < lo) next = lo + (lo - next);
  if (next > hi) next = hi - (next - hi);
  // A reflection can land back exactly where it started; nudge off it.
  if (next === prev) next = prev + (step > 0 ? -1 : 1);
  return Math.max(lo, Math.min(hi, next));
}

// The density rule: the more a scene already sounds, the less the drift plays.
// A scene with a chime has a pulse and needs no music; a bare hillside gets the
// full drift. Capped, so it thins toward silence without ever stopping.
export function nextInterval(emitters, rng) {
  const density = Math.min(3, 1 + 0.7 * emitters);
  return (BASE_MIN + (BASE_MAX - BASE_MIN) * rng()) * density;
}

// Skipping a scheduled note outright is what breaks the steady-drip quality that
// kills most generative ambient — regular spacing reads as a machine no matter
// how unpredictable the pitches are.
export const shouldRest = (rng) => rng() < REST_CHANCE;
