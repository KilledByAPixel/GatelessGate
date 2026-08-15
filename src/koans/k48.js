import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, faceMonk, groundHeight, makeBoat, makeFan, makeFoam,
  makeLights, makeMonk, makePath, makeRain, makeSand, makeWater, washMaterial, plantRock,
  tapMeshes, setFoliageWeather, foliageWind,
} from '../kit/index.js';

const ID = 48;

// THE EASTERN SEA — the text names it, and the scene already had the room.
// Ummon's half of the case strikes the carp of the eastern sea one blow — so
// the sea is IN the koan, and it lies where the scene always had its open side:
// past the far end of the one road. The road tapers out across the sand and
// ends at the water, which is the whole geography of the case in one line — the
// one road of Nirvana runs into the eastern sea. Kit and constants are case
// 20's coast, but the sheet is INK, not red: one accent per koan, and k48's
// belongs to the fan.
const SHORE = { dx: 0, dz: -1, dist: 16, width: 4, sea: -0.35, depth: 1.4 };
// keep scatter, grass and trees off the beach and out of the water — case
// 20's three-row idiom, moved out to this coast's waterline
const SEA_KEEP = [
  ...[-24, -16, -8, 0, 8, 16, 24].map((x) => ({ x, z: -18, r: 6 })),
  ...[-24, -12, 0, 12, 24].map((x) => ({ x, z: -28, r: 14 })),
  ...[-18, -6, 6, 18].map((x) => ({ x, z: -42, r: 16 })),
];

// The last case. A pupil asks where the one road of Nirvana begins, and Kembo
// raises his walking stick, draws the figure ONE in the air, and says: "Here
// it is."
//
// An open field, the road running out of it in both directions, and Kembo with
// a great red ōgi raised. Ummon's fan is the other half of the case — Ummon
// answered the same question by raising a fan and saying it jumped to the
// thirty-third heaven and struck the carp of the eastern sea one blow — so the
// staging leads with the fan and the sea it strikes. ONE fan only — a second
// read as floating in front of the other figure; the pupil's hands are empty,
// which is the right state for the one who is still asking.
//
// TOUCH THE FAN AND HE WAVES IT, AND IT RAINS. Ummon's fan does not draw a
// diagram, it hits the weather at the far end of the world — so what a wave of
// it brings is a shower, out of a clear sky, which passes.
//
// THE STROKE IS GONE, and it is worth the record because it was the case's own
// text. Kembo "draws the figure one in the air", so a red bar hung there and a
// tap redrew it left to right at the speed of a brush. It never read as a mark
// being made: what came out read as a rectangle appearing. A horizontal slab in
// mid-air has no brush behind it and nothing in the picture explains where it
// came from, which is the difference between a stroke and a floating rectangle.
// The `stroke` token went out of the ambience recipe with it; nothing in the
// audio engine ever answered to it (it was only ever counted as an emitter for
// the drift-density rule), and `rain:0` takes its place — same emitter count,
// and a bed that is built and silent until the fan asks for it.
const WAVE = 0.55;        // seconds per stroke of the fan
const WAVES = 3;          // how many, so it reads as fanning and not as a twitch
const WAVE_ARC = 0.42;    // radians the raised arm swings through
const SHOWER_IN = 1.4;    // the sky closing over — it starts as the fan is moving
const SHOWER_HOLD = 5.0;  // real rain, long enough to stand in
const SHOWER_OUT = 4.5;   // and a long tail: showers do not switch off
const SHOWER_SPAN = SHOWER_IN + SHOWER_HOLD + SHOWER_OUT;
// The wind picks up just a LITTLE bit, and this is a multiplier ON TOP of the
// meadow's own wind, not a replacement for it — 0.5 is half again at the peak,
// where case 34's squall is 3.4 (four and a half times over) and case 20's is
// 6. Weather that arrives, not weather that hits. It was 1.3 for an hour, which
// is more than DOUBLE and exactly the mistake the "on top of" reading is there
// to prevent.
const GUST_MULT = 0.5;
const RAIN_LEAN = 0.34;   // the shower's own tangent at the peak, from 0.16
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 0 dry, 1 raining hardest, `u` seconds after the fan is waved
function showerShape(u) {
  if (!(u >= 0) || u >= SHOWER_SPAN) return 0;
  if (u < SHOWER_IN) return smooth(u / SHOWER_IN);
  if (u < SHOWER_IN + SHOWER_HOLD) return 1;
  return 1 - smooth((u - SHOWER_IN - SHOWER_HOLD) / SHOWER_OUT);
}
// the fan itself: WAVES strokes of a sine, damped so the last is the smallest,
// and exactly zero before and after so his arm returns to the pose it was built in
function waveShape(u) {
  const span = WAVE * WAVES;
  if (!(u >= 0) || u >= span) return 0;
  return Math.sin((u / WAVE) * Math.PI * 2) * (1 - u / span);
}
const scratchPos = new THREE.Vector3();

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.1, target: [1.05, 1.3, -0.1], heading: 23.5, pitch: 14.9 };
  export default {
  id: ID,
  slug: 'one-road-of-kembo',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'water:0.55' is the surf bed (case 20's), breathing with the swell via
  // setWaterSwell below; the wind goes pine like every coast in the book.
  // 'rain:0' builds the bed SILENT and leaves it running: the case drives its
  // level off the shower's own envelope (setRainLevel), so a shower that
  // arrives has a sound and a dry page has none. It takes the exact slot the
  // inert 'stroke' token held, so emitterCount and the drift-layer density are
  // unchanged (src/audio/music.js's density rule; k29's note on why the count
  // matters more than the name).
  ambience: ['wind:0.26:pine', 'water:0.55', 'rain:0', 'music'],
  mood: 'yo',      // it ends in the open, in daylight, with a line being drawn
  // Lowered a touch when the sea arrived (pitch 19.5 -> 14.9, target down):
  // the case is a field scene no longer — the upper frame belongs to the
  // eastern sea dissolving into paper, k20's own low-lens lesson.
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights({ sun: { heading: -70, pitch: 49 } }));
  
  // The one road — and now it has somewhere to go: down the field, across
  // the sand, ending AT the eastern sea. It drapes over the SHORED ground
  // (its own groundFn), or its last stretch would stand on the unshored
  // height and pitch up over the beach dip like a tent.
  const road = makePath({
  from: [7.0, 6.0], to: [-6.0, -16], width: 1.7, seed: ID, groundSeed: 21, wander: 2.45,
  groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
  });
  scene.add(road);
  
  // KEMBO, raising a great folding fan in the air — "Here it is." He held a
  // walking stick here for a while, traded for a big ōgi: an open paper wedge
  // held up in the raised hand, face turned to the reader, red like the stroke
  // it draws. (It also folds the case's two halves into one picture — Ummon's
  // answer to the same question WAS a fan.)
  const KH = 1.68;
  const kembo = makeMonk({ height: KH, pose: 'raise' });
  kembo.position.set(-1.8, 0, -1.6);
  faceMonk(kembo, { x: 4.0, z: 2.6 });
  const raisedArm = kembo.children
  .filter((c) => c.name === 'arm')
  .sort((a, b) => b.position.x - a.position.x)[0];
  if (raisedArm) {
  const SLEEVE_L = 0.34 * KH;
  const bigFan = makeFan({
  radius: 0.42 * KH, angle: Math.PI * 0.78, handleLen: 0.13 * KH,
  color: ACCENT, seed: ID,
  });
  // grip sunk into the cuff, the wedge continuing the raised sleeve's line
  bigFan.position.y = -SLEEVE_L + 0.03 * KH;
  bigFan.rotation.z = Math.PI;      // opening out along the sleeve, not back down it
  bigFan.rotation.y = -0.65;        // spun on the sleeve's axis to show its face
  raisedArm.add(bigFan);
  }
  scene.add(kembo);
  
  // (The stroke that used to hang here — a red slab in mid-air, redrawn on a
  // tap — is gone. See the header.)

  // the pupil, empty-handed — he asked the question; the fan is the answer,
  // and only the one who answers holds it
  const PH = 1.6;
  const pupil = makeMonk({ height: PH });
  pupil.position.set(3.2, 0, 2.4);
  faceMonk(pupil, kembo.position);
  scene.add(pupil);
  
  // ---- the eastern sea -------------------------------------------------
  // Case 20's coast, in this case's own dress: an ink sea, transparent in
  // the shallows so the sand shows through, deepening seaward, the far
  // fade owned by the fog. Three crossing swells break the crests up.
  const water = makeWater({
  // wash(0.68) — genuinely DARK ink (higher wash = darker; k39's pond
  // sits at 0.72). Two lighter tries read as mudflat: at this grazing
  // angle the fog eats a pale sheet whole (case 20 recorded the same
  // failure). Dark ink under white glints says water.
  shape: 'square', size: 150, color: wash(0.68), seed: ID,
  opacity: 1, segments: 64,
  // half the default idle swell: holds the amplitude this shoreline was
  // tuned around when the ponds' breathing was turned up (see IA in water.js)
  swell: 0.5,
  // A tighter ramp than case 20's: red survives 20% visibility through
  // the fog, grey doesn't — so the ink must arrive within the narrow
  // strip the grazing camera actually sees. Full depth by ~5 out.
  alphaRamp: (x, z) => {
  const s = 43 - z;                             // seaward distance past the waterline
  const t = Math.max(0, Math.min(1, s / 5));
  return 0.3 + 0.62 * t * t * (3 - 2 * t);
  },
  drift: [
  { dx: 0, dz: 1, amp: 0.045, wavelength: 8, period: 6 },
  { dx: 0.2764, dz: 0.9611, amp: 0.022, wavelength: 5.2, period: 4.6 },
  { dx: -0.3429, dz: 0.9394, amp: 0.017, wavelength: 3.4, period: 3.5 },
  ],
  });
  water.group.position.set(0, SHORE.sea, -(SHORE.dist + 43));
  scene.add(water.group);
  
  // wet sand a step darker than the earth, so the foam has contrast
  const sand = makeSand({ shore: SHORE, seed: ID, groundSeed: 21, color: wash(0.30) });
  scene.add(sand);
  
  // WORLD y of the sea surface at world (x, z) — case 11's one closure, so the
  // foam and the ship ride the same water instead of each inventing a sea
  const seaSurface = (x, z, t) => SHORE.sea + water.heightAt(x, z + (SHORE.dist + 43), t);

  // the wave-ends, riding the sheet's own surface (the koi idiom)
  const foam = makeFoam({
  shore: SHORE, seed: ID, groundSeed: 21,
  surfaceAt: seaSurface,
  });
  foam.mesh.renderOrder = 1;
  scene.add(foam.mesh);

  // A SHIP STANDING OUT. The last case's sea had nothing on it, and an empty
  // sheet of ink reads as distance rather than as sea; one silhouette on it
  // gives the water a scale and the horizon something to be far from. It also
  // finishes the geography the case is made of — the one road runs out across
  // the sand into the eastern sea, and something is out there going.
  //
  // Placed by the picture, not by taste. At 44 units the fog leaves about a
  // fifth of it, which is the same read case 11's ship has and is the number
  // that staging was tuned to. The yaw is the SAIL's doing: the lug sail is a
  // single flat quad in the hull's own x = 0 plane, so it vanishes edge-on and
  // a boat pointed at or away from the reader loses the one shape the model
  // exists to make. 1.98 is the broadest the sail projects from this camera,
  // and it happens to be a heading already turned for the open sea. Aft of the
  // fan and well above the figures, on the opposite side of the frame from the
  // one red thing in the picture.
  const boat = makeBoat({ seed: ID, surfaceAt: seaSurface });
  boat.group.position.set(-14, SHORE.sea, -30);
  boat.group.rotation.y = 1.98;
  scene.add(boat.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  shore: SHORE,
  // grass must plant on the TRUE shored surface, or tufts near the
  // feathered keepout edge stand on the unshored height (case 20's find)
  groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
  trees: 7,
  // the land at the reader's back and sides — nothing stands in the sea
  mountains: [
  { count: 7, distance: 52, arcCenter: Math.PI, arcSpan: 3.6, color: wash(0.16) },
  { count: 4, distance: 34, arcCenter: -2.1, arcSpan: 1.3, color: wash(0.28), hScale: 0.65 },
  ],
  forests: [
  { center: [-20, 0, 2], spread: 10, count: 40 },
  { center: [17, 0, 6], spread: 9, count: 30, color: wash(0.55) },
  ],
  keepout: [
  ...road.keepout(26, 1.4),
  { at: kembo, r: 1.3 },
  { at: pupil, r: 1.2 },
  ...SEA_KEEP,
  ],
  grassKeepout: [
  ...road.keepout(28, 1.0),
  ...SEA_KEEP,
  ],
  });

  const rock = plantRock(scene, { x: 2.9, z: -7.5, size: 2, sink: -.2 });
  rock.rotation.y = 3;
  const rock2 = plantRock(scene, { x: .9, z: 1.5, size: 1.5, sink: -.2 });
  rock2.rotation.y = 2;
  const rock3 = plantRock(scene, { x: -8.9, z: -9.5, size: 1.5, sink: -.2 });
  rock3.rotation.z = 3;

  // THE FAN IS THE TARGET, and it needs no proxy of its own: it is a
  // half-metre red wedge held up over everything else in the picture, which
  // makes it both the obvious thing to reach for and an easy one to hit. Kembo
  // goes in the list too — the fan is in his hand and the two are one offer.
  const fanMeshes = raisedArm
  ? tapMeshes(raisedArm).filter((m) => m.material.visible !== false)
  : [];
  const kemboMeshes = tapMeshes(kembo).filter((m) => m.material.visible !== false);

  // ---- the moment: he waves it, and it rains ----------------------------
  let camera = null;
  let clock = 0;
  let wavedAt = -99;
  let waves = 0;
  const ARM_REST = raisedArm ? raisedArm.rotation.x : 0;
  
  // THE SHOWER, built dry. The drops keep their seeded phases at level 0, so a
  // second shower is the same shower rather than a new one starting from
  // wherever the clock happened to be. The field is centred on the staging and
  // stops short of the sea — rain drawn out over open water at this distance is
  // a haze in the fog and costs vertices for nothing.
  const rain = makeRain({ count: 520, seed: ID, width: 24, depth: 24, height: 12 });
  rain.setLevel(0);
  rain.points.position.set(1.0, 0, 0);
  scene.add(rain.points);

  // The weather it borrows, and hands back. Sampled when it starts rather than
  // at build, so the workbench's sliders stay live between showers; released
  // exactly, and again on dispose, because the FOLIAGE wind is one module-level
  // uniform shared by every tree in the book.
  let raining = false;
  let grassBase = 1;
  let treeBase = 1;
  const stopRain = () => {
  raining = false;
  rain.setLevel(0);
  rain.setLean(0.16);
  world.grass && world.grass.setWind(grassBase);
  setFoliageWeather({ wind: treeBase });
  audio && audio.setWindLevel(0.26);
  audio && audio.setRainLevel && audio.setRainLevel(0);
  };

  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, kemboMeshes.length ? kemboMeshes : fanMeshes)) return;
  // let the shower he already called blow through
  if (clock - wavedAt < SHOWER_SPAN) return;
  touched && touched();
  wavedAt = clock;
  waves++;
  // the fan itself: cloth and air, not a struck thing
  audio && audio.cloth({ force: 0.9, at: kembo.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  water.update(dt, simTime);
  foam.update(dt, simTime);
  boat.update(dt, simTime);      // it seats itself on the swell; the case owns only x and z
  // the surf breathes with the sea it belongs to (case 20's idiom):
  // read the true surface at the waterline and hand the bed 0..1
  if (audio && audio.setWaterSwell) {
  const h = water.heightAt(0, 43, clock);   // the guarded clock, never raw simTime
  audio.setWaterSwell(Math.max(0, Math.min(1, 0.5 + h / 0.17)));
  }
  
  const u = clock - wavedAt;
  // the fan crosses the air three times and settles back into the pose it
  // was built in — waveShape is exactly zero outside its own span, so his
  // arm is never left a fraction off where it started
  if (raisedArm) raisedArm.rotation.x = ARM_REST + waveShape(u) * WAVE_ARC;

  // ...AND THE SKY ANSWERS. One envelope for the whole of it: the drops,
  // their lean, the meadow, the wood and the bed all read the same number,
  // so there is nothing here that can drift out of step.
  const g = showerShape(u);
  if (g > 0.001) {
  if (!raining) {
  raining = true;
  grassBase = world.grass && world.grass.wind ? world.grass.wind() : 1;
  treeBase = foliageWind();
  }
  rain.setLevel(g);
  rain.setLean(0.16 + (RAIN_LEAN - 0.16) * g);
  world.grass && world.grass.setWind(grassBase * (1 + GUST_MULT * g));
  setFoliageWeather({ wind: treeBase * (1 + GUST_MULT * g) });
  audio && audio.setWindLevel(0.26 * (1 + 0.7 * g));
  // guarded on the METHOD, not just the engine: setRainLevel is newer than
  // most of the book's cases and older stubs do not carry it (k20's
  // setWaterSwell keeps the same guard for the same reason)
  audio && audio.setRainLevel && audio.setRainLevel(g);
  } else if (raining) {
  stopRain();
  }
  rain.update(dt, simTime);
  },
  fragment() {
  return {
  waves,
  // 0 dry, 1 raining hardest
  shower: +showerShape(clock - wavedAt).toFixed(3),
  rainLevel: +rain.level().toFixed(3),
  grassWind: +(world.grass && world.grass.wind ? world.grass.wind() : 0).toFixed(3),
  shipY: +boat.group.position.y.toFixed(4),
  shipRock: +boat.group.rotation.z.toFixed(4),
};
      },
      // the trees' wind is one uniform shared by the whole book, so a reader
      // who turns the page mid-shower must not take the weather with them
      dispose() { if (raining) stopRain(); rain.dispose(); },
    };
  },
};
