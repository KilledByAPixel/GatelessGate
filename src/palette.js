// The entire palette. Ink on paper, one accent.
export const PAPER = '#F3EDDF';
export const INK = '#1E1E24';
export const GRAY_DARK = '#55555E';
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

// And further still, for an accent spread over a WHOLE SURFACE rather than an
// object. Case 30's pond went full ACCENT (read as blood), then ACCENT_DEEP
// (dried blood), then ACCENT_LIGHT, and all three still read as a dark red.
// What the water wanted was most of the way to white, and pinker with it. At
// nearly half paper the hue survives — it is unmistakably the book's red — but
// it reads as water with red in it rather than a pool of pigment.
export const ACCENT_PALE = mixHex(ACCENT, PAPER, 0.46);

// The one tone ABOVE the ramp, and the only thing in the book allowed up there.
//
// Everything else is a step between PAPER and INK because everything else
// REFLECTS the page. Falling snow doesn't — it is the brightest thing in a
// frame, brighter than the paper it falls past. Held at PAPER it disappeared:
// case 41's ground is wash(0.06), so flake and earth were the same tone and the
// snow read as tan flecks rather than weather. Same argument as ACCENT_LIGHT
// above — a flat unlit fill has no highlights to separate it, so the luminance
// has to be in the colour. A trace of the paper's warmth is kept so it reads as
// white-on-a-warm-page rather than a cold blue-white punched through it.
export const SNOW = mixHex(PAPER, '#FFFFFF', 0.85);

// THE DARKEST THING THE LIGHT IS ALLOWED TO TOUCH.
//
// Anything lit is painted in this, not in INK. This constant was tuned while
// the book still shaded through a 3-step toon ramp, and the reasoning that
// justified it then was quantitative: a fixed multiply by 0.31 / 0.63 / 1.0
// put an INK robe's three bands at levels 9, 19 and 30 out of 255 — a
// ten-level spread that no screen shows and no eye reads — and every monk
// came out as a flat black cut-out while the rest of the scene had visible
// form — far darker than anything around them, with no shading left to read —
// the same
// quietly true of every torii, pole and cord painted the same way. Lifted a
// fifth of the way back toward the paper, the same ramp landed on 22 / 46 /
// 73 — three times the separation, and enough that the crown of a hat, its
// brim and the shoulder under it read as three different tones.
//
// The book now shades through plain Lambert, which has no fixed bands to
// quote a level from — the surface takes a continuous value that depends on
// its normal against the key light, not one of three multipliers. That exact
// arithmetic is retired along with the ramp and has not been re-derived for
// Lambert. The eyeball verdict above (case 4 at 1.00, 0.86 and 0.78, 0.86
// reading as technically shaded and still too dark) was also made under that
// same retired ramp and has not been re-judged under Lambert either — what is
// actually unchanged, unre-derived and unre-judged both, is just the
// constant's value (still wash(0.80)) and the shape of the argument: raw INK
// reads as void once it is lit, so anything the light is meant to model gets
// this instead. It is still the darkest paint in the book; it is simply
// paint rather than a hole in the page.
//
// WHAT IS LEFT AT INK: voids. A cave throat, a doorway at night — surfaces that
// are unlit on purpose, where there is no shading to lose because there is no
// light. Those are painted with MeshBasicMaterial and mean it. If you are
// reaching for INK on something a lamp or the sun can see, you want this.
export const INK_LIT = mixHex(PAPER, INK, 0.80);

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
