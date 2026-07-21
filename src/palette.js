// The entire palette. Ink on paper, one accent.
export const PAPER = '#F3EDDF';
export const INK = '#1E1E24';
export const GRAY_DARK = '#55555E';
export const GRAY_LIGHT = '#9A9AA3';
export const ACCENT = '#C73E3A'; // the one warm note — used sparingly, never decoratively

// THE WASH RAMP.
//
// Every tone in the world is a step between PAPER and INK, so nothing can
// introduce a hue the book does not already own. Reach for these instead of
// authoring a hex: an invented colour is how a scene drifts off-palette one
// prop at a time (this ramp replaced a dozen ad-hoc greens, tans and teals).
// ACCENT is the sole exception.
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return '#' + A
    .map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0'))
    .join('');
}

export const wash = (t) => mixHex(PAPER, INK, t);

// The red seal, one per koan, always on the thing the case turns on: Joshu's
// dog, Buddha's flower, the washed bowl, the flag, the buffalo.
//
// Area matters more than hue here. Full ACCENT is right for something small and
// held — a bowl, a lotus. Spread across a big mass (a flag in the wind, a whole
// animal) the same red stops reading as a seal and starts reading as glare, so
// large accents take a deeper mix: same hue, less light, still unmistakably the
// one warm note on the page.
export const ACCENT_DEEP = mixHex(ACCENT, INK, 0.30);

// And the other direction, for anything that EMITS rather than reflects.
// ACCENT is a mid-dark brick red, and the sky is nearly the lightest tone the
// book owns. A lit object gets away with it because shading gives it highlights;
// a flat unlit fill — a moon — has none, so at full ACCENT it reads as a dark
// disc punched in a bright sky rather than as a light in it. Lifting toward the
// paper keeps the hue and buys back the luminance.
export const ACCENT_LIGHT = mixHex(ACCENT, PAPER, 0.22);

export const WASH = {
  mist: wash(0.10),     // farthest peaks, barely there
  ground: wash(0.22),   // the earth underfoot
  stone: wash(0.34),    // paths, lanterns, rock
  dry: wash(0.48),      // grass — dry, not green
  mid: wash(0.62),      // middle foliage, bowls
  dark: wash(0.76),     // near foliage, timber
  deep: wash(0.88),     // canopy mass, just off ink
};

export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
