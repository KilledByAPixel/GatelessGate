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
