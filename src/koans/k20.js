import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK, WASH, mixHex, wash } from '../palette.js';
import {
  composeWorld, faceMonk, groundHeight, makeFoam, makeLights,
  makeMonk, makePath, makeSand, makeWater, mergeSimple, washMaterial, makeLantern
} from '../kit/index.js';

const ID = 20;

// "Why does the enlightened man not stand on his feet and explain himself?"
// And: "If the feet of enlightenment moved, the great ocean would overflow."
//
// So he does not move — and the world does. He stands on a coast road; behind
// him the grass runs out into sand, the sand into slow shoreward swells, the
// swells into paper. TOUCH THE SEA and a hard wind comes through: the meadow
// lays over, the swell picks up and runs, the sound rises — and he stands
// there. The verse, staged.
//
// The tap used to be on HIM, which put the one thing in the picture that never
// reacts in charge of the only thing that does, and left the ocean — the
// biggest object on the page, and this case's own seal — inert. You touch the
// ocean here, not the man.
//
// IT USED TO BE A SHOVE, and the shove is why this note exists. Everything the
// world grammar built went into one group called `moving`, and a tap translated
// that group a third of a metre and let it oscillate back — "the world gives
// along the line you pushed from". Two things were wrong with that. The reader
// could not tell what had happened at all; and sliding the group DRAGS THE
// GRASS THROUGH ITS OWN NOISE FIELD, because the blades' wind is computed from
// world position in the vertex shader, so translating the field re-samples
// every blade against a gust pattern that did not move with it and the whole
// meadow boils. It looks like wind, and it is not wind.
//
// So the wind is REAL now — driven through the field's own uWind rather than by
// moving the field — and `moving` is gone. Nothing in this case translates
// anything. (Dissolving it also handed composeWorld the actual scene, which is
// where scene.userData.layout has to land for the workbench's layout guides to
// find it; they had been silently dead on this case the whole time.)
//
// HE IS AN ORDINARY MAN. He was a colossus for a while, taken straight from the
// verse, and it did not survive being looked at — at that size you could not
// tell what you were seeing. Ordinary is also the better reading: a giant who
// cannot be shoved is physics; an ordinary man the weather cannot touch is the
// case.

// The gust: straight up, then a long lay-over and a slow release. GUST_MULT is
// a multiplier on whatever wind the case (or the workbench slider) is already
// set to, so this rides the scene's own weather instead of replacing it.
const GUST_MULT = 6;
// ...and how much faster the sea runs while it blows. The wind is on the water
// as well as the meadow now, so the wind visibly drives the waves — nearly
// tripling the swell's travel at the peak, which is a squall rather than a
// change of tide.
const SEA_RUSH = 1.6;
// ...and how much HIGHER it runs while it blows. Pace alone read as the film
// being sped up rather than as weather: the waves have to get BIGGER, not just
// arrive sooner. +0.9 at the peak takes the drift's three crossing swells from
// a combined 0.084 to 0.16 — a squall's chop rather than a change of tide — and
// the foam rides water.heightAt, so the wave-ends climb the beach with it for
// nothing. It is a scale on the amplitude, not on the clock, which is why this
// one is allowed to be a plain multiplier (see setSwellGain in kit/water.js).
const SEA_LIFT = 1.5;
const GUST_IN = 0.35;    // it arrives all at once — that is what a squall is
const GUST_HOLD = 3;
const GUST_OUT = 4.5;    // and takes its time leaving
const GUST_SPAN = GUST_IN + GUST_HOLD + GUST_OUT;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function gustShape(u) {
  if (!(u >= 0) || u >= GUST_SPAN) return 0;
  if (u < GUST_IN) return smooth(u / GUST_IN);
  if (u < GUST_IN + GUST_HOLD) return 1;
  return 1 - smooth((u - GUST_IN - GUST_HOLD) / GUST_OUT);
}

// The coast: sea to the -z, waterline 8 out, a 4-metre beach, the bed
// settling 1.4 under the surface. ONE object, shared by the ground, the sand
// ribbon and the water's resting height — the beach lives here and nowhere
// else.
const SHORE = { dx: 0, dz: -1, dist: 8, width: 4, sea: -0.35, depth: 1.4 };
// keep scatter, grass and trees out of the sea and off the beach — three rows
// of circles laid along the coast, feathered by the fields themselves. Rows
// two and three sit well out in the water and leave gaps between circles at
// their spacing (14/16 m radius, 12 m spacing dips to z ≈ -7.35 at the worst
// seam) — nowhere near enough to cover the beach taper itself (z = -4..-8,
// see SHORE above). Row one hugs that taper directly (z = -10, r = 6, 8 m
// spacing) so nothing plants on the shored, lowered sand.
const SEA_KEEP = [
  ...[-24, -16, -8, 0, 8, 16, 24].map((x) => ({ x, z: -10, r: 6 })),
  ...[-24, -12, 0, 12, 24].map((x) => ({ x, z: -20, r: 14 })),
  ...[-18, -6, 6, 18].map((x) => ({ x, z: -34, r: 16 })),
];

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 12.0, target: [0.9, 1.15, 0.2], heading: 20.1, pitch: 10.9 };
  export default {
  id: ID,
  slug: 'the-enlightened-person',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the surf bed, at last: makeWaterBed was kept for "a scene with genuinely
  // MOVING water — an ocean". This is that scene.
  ambience: ['wind:0.22:pine', 'water:0.55', 'music'],
  // A low lens: the camera sits near the grass and looks out past the two of
  // them to open water, so the upper frame is ocean dissolving into paper.
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  // Low, and from over the sea rather than over the land behind it
  // (the shore runs out to -z). The swell carries the light back
  // toward the reader; a key on the land side left the biggest
  // object on the page — this case's own seal — flat.
  scene.add(makeLights({ sun: { heading: 160, pitch: 35 } }));
  
  // a coast road, running parallel with the shoreline — the reader looks across
  // it to the sea, and it dead-ends into nothing — a road aimed at the water is
  // a dead end into the ocean
  const path = makePath({ from: [-25, -.9], to: [15, 3.8], width: 1.8, seed: ID, groundSeed: 21, wander: 2.7 });
  scene.add(path);
  
  // THE IMMOVABLE MAN — mid-stride, one sleeve forward, and not going
  // anywhere. A tall, heavy-set elder and nothing more; the book's own
  // figure ink, like everyone else.
  const H = 1.78;
  const colossus = makeMonk({ height: H, stout: 1.12, elder: true });
  colossus.name = 'immovable-man';
  colossus.position.set(0.4, 0, -0.8);
  faceMonk(colossus, { x: 5.0, z: 5.0 });
  // The staff stays ink: the seal moved to the sea (see the water below).
  // One warm note per page, and this page's is the great ocean itself.
  // Restore `staff.material = washMaterial({ color: ACCENT, flat: true })`
  // if the seal ever comes back to his hand.
  // caught mid-stride: leaned into the step, one sleeve swung forward
  colossus.rotation.z = -0.05;
  const arms = [];
  colossus.traverse((o) => { if (o.name === 'arm') arms.push(o); });
  if (arms[0]) arms[0].rotation.x = -0.55;
  if (arms[1]) arms[1].rotation.x = 0.42;
  scene.add(colossus);
  
  // a traveller who stopped in front of him — the one who asked
  const monk = makeMonk({ height: 1.58 });
  monk.position.set(3.6, 0, 3.4);
  faceMonk(monk, colossus.position);
  scene.add(monk);

  // a lantern is the marker
  const MARKER = { x: -0.95, z: 1.0 };
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(MARKER.x, 0, MARKER.z);
  scene.add(lantern);
  
  // ---- the coast itself ------------------------------------------------
  // The great ocean: a big sheet whose near edge hides under the sand and
  // whose far edges die in the fog, with one slow swell rolling shoreward.
  // The squall reaches it: the sea keeps its own three crossing swells and the
  // wind drives THOSE harder and faster (SEA_RUSH, SEA_LIFT) rather than laying
  // a second set of waves over them — one sea getting rough, not two seas.
  // THE RED SEA IS THE SEAL. The verse turns on the great ocean — "if the
  // feet of enlightenment moved, the great ocean would overflow" — so the
  // ocean takes the case's accent, not the staff. Full ACCENT, which is what
  // read right on sight; if it ever reads as pigment rather than water at this
  // size, the
  // case-30 lesson says ACCENT_PALE is the step to take. The white Phong
  // glints stay — they are what says water. (For the record: this sheet was
  // WASH.stone once and the fog ate it whole at grazing distance, then
  // monk-dark INK_LIT for a day; the red began as a where-is-it marker and
  // got promoted.)
  //
  // Segments 64: the default cap (30) gave 3-unit cells across 90 units, and a
  // single shoreward sine on that grid rendered as parallel bars running one
  // way rather than as a sea. A finer grid plus three crossing swells — one
  // main set rolling in, two gentler obliques at ±~20° with their own
  // wavelengths and periods — is what breaks the crests into a sea. The red
  // deepens seaward: nearly clear over the sand so the shallows show it, full
  // red by ~12 out (it was ~20 at first, which held the colour off too long),
  // and the fog still owns the far fade to paper beyond that. In the sheet's
  // local coords the seaward distance past the waterline is s = 43 - z (the
  // group sits at world z = -51, the waterline at world z = -8).
  const water = makeWater({
  shape: 'square', size: 150, color: ACCENT, seed: ID,
  opacity: 1, segments: 64,
  // half the default idle swell: holds the amplitude this shoreline was
  // tuned around when the ponds' breathing was turned up (see IA in water.js)
  swell: 0.5,
  alphaRamp: (x, z) => {
  const s = 43 - z;
  const t = Math.max(0, Math.min(1, s / 12));   // full red by ~12 out; further and the colour arrives too late
  return 0.15 + 0.8 * t * t * (3 - 2 * t);
  },
  drift: [
  { dx: 0, dz: 1, amp: 0.045, wavelength: 8, period: 6 },
  { dx: 0.2764, dz: 0.9611, amp: 0.022, wavelength: 5.2, period: 4.6 },
  { dx: -0.3429, dz: 0.9394, amp: 0.017, wavelength: 3.4, period: 3.5 },
  ],
  });
  water.group.position.set(0, SHORE.sea, -(SHORE.dist + 43));
  scene.add(water.group);
  
  // Wet sand, a step darker than the earth: the default pale ribbon was
  // nearly the foam's own white, and the wave-ends vanished against it —
  // the foam only reads if the sand it lands on is darker than it is.
  const sand = makeSand({ shore: SHORE, seed: ID, groundSeed: 21, color: wash(0.30) });
  scene.add(sand);
  
  // THE WAVE-ENDS — the foam that was the point of the ocean from the first
  // sketch. Same period as the water's main swell, staggered per strip, so the
  // arrivals overlap and no two land together. It rides the sheet's OWN surface
  // via surfaceAt (the koi idiom), because the sheet writes depth and its
  // crests would swallow tails pinned to flat sea level. renderOrder puts the
  // foam after the sheet among transparents. (It wore a pink blush for an hour.
  // Pink does not work here.)
  const foam = makeFoam({
  shore: SHORE, seed: ID, groundSeed: 21,
  // white again — the pink blush did not work; against the now-transparent
  // shallows, plain snow foam is the contrast
  surfaceAt: (x, z, t) => SHORE.sea + water.heightAt(x, z + (SHORE.dist + 43), t),
  });
  foam.mesh.renderOrder = 1;
  scene.add(foam.mesh);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  shore: SHORE,
  // grass plants at plain groundHeight(groundSeed) by default; without
  // this the shore's own dip never reaches it, so any tuft that survives
  // near the keepout's feathered edge would still stand on the unshored
  // surface. Pass the TRUE shored surface so it plants where the sand
  // actually is.
  groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
  trees: 4,
  // the coast at the reader's back: both mountain bands re-aimed behind
  // and beside the staging — nothing stands in the sea
  mountains: [
  { count: 7, distance: 52, arcCenter: Math.PI, arcSpan: 3.6, color: wash(0.16) },
  { count: 4, distance: 33, arcCenter: -2.2, arcSpan: 1.3, color: wash(0.28), hScale: 0.65 },
  ],
  forests: [
  { center: [-22, 0, 8], spread: 12, count: 45 },
  { center: [19, 0, 12], spread: 12, count: 35, color: wash(0.55) },
  ],
  keepout: [
  ...path.keepout(24, 1.4),
  { at: colossus, r: 1.4 },
  { at: monk, r: 1.2 },
  { x: MARKER.x, z: MARKER.z, r: 0.9 },
  ...SEA_KEEP,
  ],
  grassKeepout: [
  ...path.keepout(26, 1.0),
  { x: MARKER.x, z: MARKER.z, r: 0.45 },
  ...SEA_KEEP,
  ],
  });

  // (The man's own hit cylinder is gone with the tap that used it. He is the
  // one thing on this page that answers to nothing at all, and giving him an
  // invisible pick volume anyway was a draw call spent on a lie.)

  // ---- the moment: the weather comes through, and he stands -------------
  // The base is read ONCE, here, straight off the field the world grammar just
  // built — which is the wind the case pinned, or the workbench slider, and by
  // this point either has already been applied. The gust multiplies it and
  // hands it back exactly on the way out, so the sliders are only ever taken
  // over for the few seconds a squall is actually blowing.
  const surface = water.group.children.find((c) => c.name === 'surface');
  const grass = world.grass;
  const BASE_WIND = grass && grass.wind ? grass.wind() : 1;
  let camera = null;
  let clock = 0;
  let gusts = 0;
  let gustAt = -99;
  let blowing = false;

  // THE SEA IS WHAT YOU TOUCH. It was the man — which put the one thing in the
  // picture that never reacts in charge of the only thing that does, and left
  // the ocean, the biggest object on the page and the case's own seal, inert —
  // so the ocean is what answers, not the man. Touch the water and the weather
  // comes; he still does not move, which is the case.
  input.onTap(() => {
  if (!camera) return;
  if (!surface || !input.raycastFirst(camera, [surface])) return;
  if (clock - gustAt < GUST_IN + GUST_HOLD) return;   // let a squall land before the next
  gustAt = clock;
  gusts++;
  // the sound of it arriving. Not an impact — nothing here is struck, and a
  // knock said something had hit him, which is the one thing that never
  // happens in this case.
  audio && audio.breath({ force: 0.95, dur: GUST_SPAN * 0.7, at: colossus.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  water.update(dt, simTime);
  foam.update(dt, simTime);
  // The surf breathes with the sea it belongs to: read the TRUE surface
  // at the waterline (local z: world -8 minus the sheet's own -51) and
  // hand it to the bed as 0..1. Synced by construction — there is no
  // second clock to drift against the picture.
  if (audio && audio.setWaterSwell) {
  const h = water.heightAt(0, 43, clock);   // the guarded clock, never raw simTime
  audio.setWaterSwell(Math.max(0, Math.min(1, 0.5 + h / 0.17)));
  }
  // THE WIND, and only while there is one. Off the clock the field is left
  // alone entirely — one release write when the squall ends and then hands
  // off — so the workbench's wind slider is free except during a gust.
  const g = gustShape(clock - gustAt);
  if (g > 0) {
  blowing = true;
  grass && grass.setWind(BASE_WIND * (1 + GUST_MULT * g));
  water.setRush(SEA_RUSH * g);
  water.setSwellGain(1 + SEA_LIFT * g);
  audio && audio.setWindLevel(0.22 * (1 + 2.4 * g));
  } else if (blowing) {
  blowing = false;
  grass && grass.setWind(BASE_WIND);
  water.setRush(0);
  water.setSwellGain(1);
  audio && audio.setWindLevel(0.22);
  }
  },
  fragment() {
  return {
  gusts,
  gust: +gustShape(clock - gustAt).toFixed(4),
  wind: +(BASE_WIND * (1 + GUST_MULT * gustShape(clock - gustAt))).toFixed(3),
  seaRush: +water.rush().toFixed(3),
  seaLift: +water.swellGain().toFixed(3),
  // he has not moved, and never will
  manX: +colossus.position.x.toFixed(4),
  manZ: +colossus.position.z.toFixed(4),
};
      },
      dispose() { water.dispose(); foam.dispose(); },
    };
  },
};
