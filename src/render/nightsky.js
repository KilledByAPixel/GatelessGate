import { PAPER, INK, mixHex } from '../palette.js';

// THE PAGE AFTER DARK.
//
// The reading-light switch used to be the page's business and nothing else —
// the diorama stayed paper-light in both skins, on the argument that a sumi-e
// painting does not have a night mode. This is that argument overruled for one
// specific thing: the SKY. Turn the reading light down and the paper the scene
// is painted on goes dark with it, and nothing else moves. The key and the fill
// are untouched, so every lit surface keeps exactly the value it had — what
// changes is what they are lit against.
//
// FOG FOLLOWS THE SKY, all the way. It is not a separate choice: fog is what
// the land dissolves INTO before it can reach a horizon, so a dark sky over
// paper-coloured fog draws the horizon line the whole book exists to avoid —
// the mountains would fade up into a pale band with night above it. (Case 19
// splits the two deliberately, and that is the exception that shows why: its
// split is what keeps a red sky from turning the whole valley red, and it only
// works because it is transient.)
//
// A case's own page colour is the base, not a replacement, so the two pages
// that tint their own sky keep their identity after dark: case 27's red goes to
// a dark red and case 28's dusk goes deeper into night rather than both landing
// on one flat colour.
const NIGHT_PAGE = mixHex(INK, PAPER, 0.10);   // ink, barely lifted — not black
const NIGHT_DEPTH = 0.88;                      // how far a page travels toward it

// The pure half: what a page colour becomes. Palette hex strings in and out,
// the same vocabulary mixHex speaks, so the mixing is testable without a scene.
export function skyFor(base, night) {
  return night ? mixHex(base, NIGHT_PAGE, NIGHT_DEPTH) : base;
}

// The THREE half. The case's OWN colours are captured once and kept, because
// this runs again on every theme toggle and re-darkening an already-dark page
// would walk it to black one press at a time.
export function applyNightSky(scene, night) {
  if (!scene || !scene.background) return;
  const u = scene.userData;
  if (u.dayBg === undefined) {
    u.dayBg = '#' + scene.background.getHexString();
    u.dayFog = scene.fog ? '#' + scene.fog.color.getHexString() : u.dayBg;
  }
  scene.background.set(skyFor(u.dayBg, night));
  if (scene.fog) scene.fog.color.set(skyFor(u.dayFog, night));
  // What a case that animates its own sky must lerp FROM — cases 19 and 28
  // both do, and reading the constant they were written against would undo
  // this on their next frame.
  u.pageBg = skyFor(u.dayBg, night);
  u.night = !!night;   // for a case that has a SECOND page colour to darken too
}

// For those two cases: the page colour as it actually stands, which is the
// case's own until the reading light goes down.
export function pageBase(scene, fallback = PAPER) {
  const hex = scene && scene.userData ? scene.userData.pageBg : undefined;
  return hex === undefined ? fallback : hex;
}
