import { PAPER, INK, mixHex } from '../palette.js';

// THE PAGE AFTER DARK.
//
// The reading-light switch used to be the page's business and nothing else —
// the diorama stayed paper-light in both skins, on the argument that a sumi-e
// painting does not have a night mode. This is that argument overruled for one
// specific thing: the SKY. Turn the reading light down and the paper behind the
// scene goes dark, and nothing else moves. The key and the fill are untouched,
// so every lit surface keeps exactly the value it had.
//
// THE SKY AND THE FOG ARE TWO KNOBS, and the fog goes much the shorter way.
// Fog does not light anything — it is what the land dissolves INTO before it
// can reach a horizon — but it reaches everything far away, so taking it down
// with the sky takes the whole receding ground and the hills with it, and the
// picture reads as having been re-lit when nothing was. Tying the two together
// was the first cut and it was too much.
//
// What the fog's share buys is the SEAM. Left alone entirely, the land fades up
// toward paper under a dark sky and the horizon draws a pale band the book
// normally has nothing to draw with; a little fog kills the band without
// darkening the ground. Case 19 splits the same two on purpose (a red sky over
// land that keeps its own colour), so the split is house precedent rather than
// a rule broken. Both depths are a judgement rather than a derivation — the
// pair below was found by dragging the sliders.
//
// A case's own page colour is the base, not a replacement, so the two pages
// that tint their own sky keep their identity after dark: case 27's red goes to
// a dark red and case 28's dusk goes deeper into night rather than both landing
// on one flat colour.
const NIGHT_PAGE = mixHex(INK, PAPER, 0.10);   // ink, barely lifted — not black

// How far the sky and the fog each travel toward it. Module state rather than
// constants so the workbench can drag them (the setGrassReach idiom): these are
// the two numbers the "Night sky" / "Night fog" sliders read, and what is found
// by dragging is what gets typed back in here.
let skyDepth = 0.6;
let fogDepth = 0.15;
export function setNightDepth(sky, fog) {
  if (Number.isFinite(sky)) skyDepth = sky;
  if (Number.isFinite(fog)) fogDepth = fog;
}
export function nightDepth() { return { sky: skyDepth, fog: fogDepth }; }

// The pure halves: what a page colour becomes. Palette hex strings in and out,
// the same vocabulary mixHex speaks, so the mixing is testable without a scene.
export function skyFor(base, night) {
  return night ? mixHex(base, NIGHT_PAGE, skyDepth) : base;
}
export function fogFor(base, night) {
  return night ? mixHex(base, NIGHT_PAGE, fogDepth) : base;
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
  if (scene.fog) scene.fog.color.set(fogFor(u.dayFog, night));
  // What a case that animates its own sky must lerp FROM — cases 19 and 28
  // both do, and reading the constants they were written against would undo
  // this on their next frame. Kept as a PAIR, because the two no longer agree:
  // a case that lerped its fog from the sky's base would darken the fog this
  // module had deliberately left alone.
  u.pageBg = skyFor(u.dayBg, night);
  u.pageFog = fogFor(u.dayFog, night);
  u.night = !!night;   // for a case that has a SECOND page colour to darken too
}

// For those two cases: the page as it actually stands, which is the case's own
// until the reading light goes down.
export function pageBase(scene, fallback = PAPER) {
  const hex = scene && scene.userData ? scene.userData.pageBg : undefined;
  return hex === undefined ? fallback : hex;
}
export function fogBase(scene, fallback = PAPER) {
  const hex = scene && scene.userData ? scene.userData.pageFog : undefined;
  return hex === undefined ? fallback : hex;
}
