import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_LIGHT, wash } from '../palette.js';
import {
  composeWorld, faceMonk, frontShadow, makeDog, makeMonk, makeMoon, makePath,
  makeWildflowers, makeSnow,
} from '../kit/index.js';
import { makeLights } from '../render/lights.js';
import { pageBase, fogBase } from '../render/nightsky.js';

const ID = 19;
const BASE_WIND = 0.20;
// THE MOON IS THE LIGHT, AND THE TAP SWELLS IT.
//
// Two earlier cuts of this are worth keeping on the record. The first was
// makeMoon's setGlow — a few percent toward the paper and a few percent of
// swell, deliberately tiny so a moon never blinks — which on the one page whose
// subject IS the light was a change nobody could name. The second faded the
// disc out by making its material transparent and running the opacity down, and
// that one BROKE THE MOON: makeMoon's fragment shader forces `gl_FragColor.a =
// 0.0` as its ink-mask marker (point 4 of that file's header — it is how the
// disc opts out of the depth-edge Sobel), which is free while the material is
// opaque and alpha is ignored, and catastrophic the moment `transparent = true`
// makes the blender read it. The moon went pale instead of red, visibly and at
// once. NEVER set transparent on a material whose shader writes alpha for a
// non-alpha purpose.
//
// So nothing here fades. The sun is placed on the moon's own bearing, so every
// shadow in the meadow points away from it and the moon is visibly the thing
// lighting the scene. A tap does not move it — a climb to the zenith was built
// and worked, and was rejected in favour of the other direction — it SWELLS:
// the disc grows until it is most of the sky, the SKY alone goes red behind it
// (never the whole page), and then it settles back to being a moon on a ridge.
//
// ONLY THE SKY. scene.background is taken all the way; the fog — which is what
// the land dissolves INTO — comes less than half as far, so the far meadow and
// the mountains stay their own colour and merely warm at the horizon. Tinting
// the fog fully would turn every distant thing red, which is the page rather
// than the sky; leaving it alone entirely puts a hard paper seam along the
// ridge with a red sky above it. The split is the whole trick.
const RISE_UP = 1.5;      // seconds for the moon to come on
const RISE_HELD = 1.6;    // filling the sky
const RISE_DOWN = 2.8;    // and settling back, slower than it came
const RISE_SPAN = RISE_UP + RISE_HELD + RISE_DOWN;
// How much bigger. The moon is 2.7 across at 60 out and the frame's half-height
// at that distance is 60·tan(19°) ≈ 20.7, so ten times its radius overflows the
// frame completely — which reads as a red wash rather than as a moon, because
// no edge of the disc is left on screen. 7.5 puts the radius at 0.98 of half the
// frame: it fills the sky above the ridge and the curve still runs out through
// the corners, so the thing filling the sky is legibly a moon.
const MOON_SWELL = 7.5;
const SKY_TINT = 0.90;    // how far the background goes toward the moon's own red
const FOG_TINT = 0.38;    // ...and how far the land's fog follows it. See above.

// AND IT SNOWS. The verse is the whole of this page — "in spring, hundreds of
// flowers; in autumn, a harvest moon; in summer, a refreshing breeze; in
// winter, snow will accompany you" — and the diorama had three of those four.
// The flowers are the verge, the moon is the ridge, the breeze is in the wind
// and the sound. Winter was the missing line, and touching the moon is where it
// goes: the sky reddens, the disc comes on, and it begins to snow — the verse
// names winter too.
//
// It runs LONGER than the moon does. The swell is over in six seconds; the
// snow comes on with it and is still tailing off well after, which is how
// weather actually leaves — the flakes already in the air have to land.
const SNOW_IN = 1.2;
const SNOW_HELD = 5.0;
const SNOW_OUT = 4.5;
const SNOW_SPAN = SNOW_IN + SNOW_HELD + SNOW_OUT;
function snowShape(u) {
  if (!(u >= 0) || u >= SNOW_SPAN) return 0;
  if (u < SNOW_IN) return smooth(u / SNOW_IN);
  if (u < SNOW_IN + SNOW_HELD) return 1;
  return 1 - smooth((u - SNOW_IN - SNOW_HELD) / SNOW_OUT);
}
// How high the sun sits when the moon is at rest. The moon itself is 6.4 up at
// 60 out — about six degrees, a harvest moon on the ridge — and a key light at
// six degrees throws shadows the length of the meadow, straight off the ±15
// shadow frustum. The BEARING is the moon's, exactly; the elevation is a shot,
// not a measurement, which is the honest way round for a diorama.
const SUN_ELEV = 0.62;    // radians, ~36 degrees
const SUN_DIST = 13;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 0 = a moon on a ridge, 1 = most of the sky
function riseShape(u) {
  if (!(u >= 0) || u >= RISE_SPAN) return 0;
  if (u < RISE_UP) return smooth(u / RISE_UP);
  if (u < RISE_UP + RISE_HELD) return 1;
  return 1 - smooth((u - RISE_UP - RISE_HELD) / RISE_DOWN);
}
const BREEZE_TAU = 1.7;   // how long a crossing breath stays in the sound

// Every other case in this book has a thing at its centre — a dog, a flower, a
// bowl, a flag, a buffalo — and the red seal goes on that thing. Case 19 has
// nothing. It is two monks on a road talking about roads, and there is no object
// to make red.
//
// So this diorama illustrates the VERSE instead of the exchange:
//
//     In spring, hundreds of flowers; in autumn, a harvest moon;
//     In summer, a refreshing breeze; in winter, snow will accompany you.
//
// which gives the case two seals rather than one, and both of them are weather:
// the wildflowers along the verge (ACCENT — each bloom is a few pixels) and the
// moon over the hills (ACCENT_LIGHT — see the note at the moon itself). The
// meadow itself stays on the grey wash, as always.
//
// The blooms went out for a while and butterflies took the line instead; they
// are back and the butterflies have gone to case 12. Spring is the FIRST line
// of the verse and autumn the second, so having them in the same picture is the
// point — flowers on the ground, the moon over the ridge. The framing, named so
// composeWorld can have it too: `view` lets the scatter refuse spots no
// reachable heading can see (kit/scenery.js).
const CAM = { distance: 12, target: [1.25, 1.3, -1.3], heading: 22.5, pitch: 8.6 };
  export default {
  id: ID,
  slug: 'everyday-life-is-the-path',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.20', 'music'],
  mood: 'yo',      // chores in the sun; ordinary mind is the way
  
  // Wider, and lower, than the standard diorama shot. This is a landscape, not
  // a tableau: the road has to have room to run away into the hills, and the
  // camera has to sit near enough to horizontal that there is sky above the
  // ridge for the moon to stand in. pitch 8.6 puts the horizon at roughly
  // three-fifths of the frame height, leaving a band of paper along the top.
  // The target sits off to the right of the two figures on purpose. Everything
  // near shifts left in frame with it while the moon, seventy units out, barely
  // moves at all — so the walkers end up low and left and the moon high and
  // right, instead of the two of them stacked up the centre line.
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights());
  
  // The road. It enters at the bottom right of frame and leaves on a diagonal
  // toward the far left, so it reads as going somewhere rather than pointing
  // at the lens — and so the moon can sit off its vanishing point instead of
  // being skewered by it.
  const path = makePath({
  from: [4.2, 8.5], to: [-12.8, -27.7],
  width: 1.5, seed: 19, groundSeed: 21, wander: 3,
  });
  scene.add(path);
  
  // Two men walking, mid-sentence. Nansen leads with his staff, still facing
  // up the road — he is answering without stopping, which is the whole of what
  // he says. Joshu is half a step behind and turned toward him.
  const np = path.sample(0.235);
  const jp = path.sample(0.205);
  const nansen = makeMonk({ height: 1.68, elder: true });
  nansen.position.set(np.x + np.perp.x * 0.40, 0, np.z + np.perp.z * 0.40);
  const upRoad = path.sample(0.42);
  faceMonk(nansen, { x: upRoad.x, z: upRoad.z });
  
  const joshu = makeMonk({ height: 1.56 });
  joshu.position.set(jp.x - jp.perp.x * 0.46, 0, jp.z - jp.perp.z * 0.46);
  faceMonk(joshu, nansen.position);
  scene.add(nansen, joshu);
  
  // An ordinary dog, trotting a few steps behind the two of them — k1's
  // koan animal on its day off. In its home case it carries the accent
  // and the whole question; here it is INK, unremarkable, walking the
  // same road everyone walks. That is the case: ordinary mind is the way.
  const dog = makeDog({ height: 0.5, seed: 19 });
  const dp = path.sample(0.155);
  dog.position.set(dp.x + dp.perp.x * 0.18, 0, dp.z + dp.perp.z * 0.18);
  faceMonk(dog, joshu.position);
  // under this case's own low moon the grazing light drew the peter-pan gap
  // at the dog's feet wider than any sun does; the quadruped is closed
  // geometry throughout, so the contact fix is safe on it
  frontShadow(dog);
  scene.add(dog);
  
  // The harvest moon: beyond the mountains and low, just clear of the ridge.
  // Its bearing sits a few degrees right of where the road runs out, so the
  // eye travels up the road and arrives at it.
  // 60 out rather than 70: the camera's far plane is 100, and the debug lens
  // slider pulls the rig back as far as ~36 units when it is wound all the way
  // to a long lens. Any further and the disc starts clipping at that setting.
  const MOON_BEARING = -0.28;
  // ACCENT_LIGHT, and it took two goes to get here. ACCENT_DEEP read as a hole
  // punched in the sky; full ACCENT was still a dark brick disc. The moon is
  // the one thing in the book that EMITS, and an unlit flat fill has no
  // highlights to carry it — so it needs a tone lifted toward the paper rather
  // than the large-mass rule that governs everything reflective. Sunk toward
  // the ridgeline too: a harvest moon is low.
  const moon = makeMoon({ radius: 2.7, color: ACCENT_LIGHT, distance: 60, height: 6.4, azimuth: MOON_BEARING });
  scene.add(moon);
  
  // Wildflower drifts along the verge, plus a few out in the meadow so the
  // blooms are not one tidy corridor either side of the track. `color` puts
  // the accent on the HEADS only — the kit gives every stem the meadow's own
  // dry wash, which is what stops a red drift reading as red grass.
  const verge = [];
  for (let i = 0; i <= 15; i++) {
  const p = path.sample(0.04 + (i / 15) * 0.46);
  verge.push({ x: p.x, z: p.z });
  }
  verge.push({ x: -5.6, z: 2.4 }, { x: 6.0, z: -3.4 }, { x: -2.4, z: -7.6 }, { x: 7.2, z: 3.2 });
  
  const flowers = makeWildflowers({
  count: 250, radius: 12, seed: 19, groundSeed: 21, color: ACCENT,
  along: verge, spread: 2.3, scale:1.2,
  // the only thing blooms are kept out of is the worn track itself and the
  // two pairs of feet — they grow right up to both. The circle chain has to
  // be dense enough to actually OVERLAP along a 40-unit road: at r = 0.8 the
  // spacing must stay under 1.6, or blooms sprout through the gaps between
  // the circles and stand in the middle of the track.
  keepout: [
  ...path.keepout(40, 0.80),
  { x: nansen.position.x, z: nansen.position.z, r: 0.42 },
  { x: joshu.position.x, z: joshu.position.z, r: 0.42 },
  { x: dog.position.x, z: dog.position.z, r: 0.38 },
  ],
  });
  scene.add(flowers.mesh);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 33,
  groundSeed: 21,
  trees: 7,
  keepout: [
  ...path.keepout(26, 1.5),                                       // the whole run of the road
  { x: nansen.position.x, z: nansen.position.z, r: 1.7 },
  { x: joshu.position.x, z: joshu.position.z, r: 1.7 },
  ],
  // stingy, on purpose: only the trodden track clears the grass. The monks
  // walk in it and the grass grows right up to its rim.
  grassKeepout: path.keepout(30, 0.95),
  
  // THE RIDGELINE IS SHAPED AROUND THE MOON, and it has to be.
  //
  // The stock bands are cones up to 22 tall and 35 wide sitting 30-50 out.
  // Fog washes them almost to paper, so they read as ghosts — but a ghost
  // still writes depth, and with the default arc there is no gap anywhere in
  // the -z hemisphere wide enough for the disc to stand in. The moon simply
  // vanished behind an invisible pale slope.
  //
  // So: a LOW far ridge across the middle, where the road runs out and the
  // moon stands, and the tall country pushed to either side where it frames
  // the shot instead of filling it. Hills, in the evening haze, which is
  // what the verse asks for anyway.
  mountains: [
  { count: 7, distance: 58, arcCenter: MOON_BEARING, arcSpan: 1.5, color: wash(0.13), hScale: 0.30 },
  { count: 5, distance: 47, arcCenter: -1.55, arcSpan: 1.5, color: wash(0.17), hScale: 0.80 },
  { count: 4, distance: 45, arcCenter: 0.95, arcSpan: 1.5, color: wash(0.20), hScale: 0.75 },
  ],
  // AND SO IS THE FOG LINE. The stands used to sit at a flat y and duck
  // under the sightline by accident; once forests started standing on
  // the real terrain (the sunk-trees fix), the left stand's trees rode
  // an upslope into the moon at the left end of the drag — this case's
  // own occlusion net caught it. The left stand steps back and away
  // from the corridor; the right one was never near it.
  forests: [
  { center: [-26, 0, -24], spread: 10, count: 55 },
  { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  });

  // ---- the moment: the weather ------------------------------------------
  // Touch the meadow and a breath crosses it — in the sound, and in the wind
  // the blooms and the grass are already leaning to. Touch the moon and the
  // light shifts, and the same breath crosses from up there.
  //
  // Neither is a puzzle and neither is a goal. It is an evening walk; the only
  // thing to find is that the place answers when you touch it.
  //
  // NO GUST FRONT. Both taps used to call flowers.gustAt(), which sends a ring
  // travelling outward and adds its envelope straight onto each bloom's lean.
  // Stacked on the wind and the nod already in that sum, it drove the bend past
  // anything a stem does — the blooms folded flat and read as being pulled
  // under, as though sucked into the ground. The breath is now carried by the
  // wind level alone, which the blooms and the grass answer together through
  // the weather they already share.
  let camera = null;
  let clock = 0;
  let riseAt = -99;
  let breeze = 0;
  let touches = 0;
  const ground = scene.getObjectByName('ground');
  const meadow = ground ? [flowers.mesh, ground] : [flowers.mesh];

  // THE SUN IS AIMED FROM THE MOON. makeLights puts its key over the staging's
  // right shoulder — the book's default, and on this page it meant the shadows
  // lay across the meadow from a direction with nothing in it while a moon
  // stood plainly in the sky doing no work at all — the light visibly did not
  // come from it. The bearing below is the moon's own; only the elevation is
  // chosen, for the reason at SUN_ELEV. Every other case names a fixed `sun:`
  // aim instead; this one's moves with the swell, so it clears the aim record
  // to claim the light outright and the workbench's sun sliders leave it alone.
  const sun = scene.getObjectByProperty('isDirectionalLight', true);
  if (sun) sun.userData.aim = null;
  const sunTargetAt = sun ? sun.target.position.clone() : new THREE.Vector3();

  // the moon's resting spot and size, kept so the swell has somewhere to return
  const moonHome = moon.position.clone();
  // The winter line of the verse, waiting. Built once and left invisible —
  // makeSnow's flakes are a closed form over simTime, so a hidden snowfall
  // costs one skipped draw call and nothing else, and it is already falling
  // properly the moment it is shown rather than starting from a flat sheet.
  const snow = makeSnow({ count: 260, seed: ID, width: 30, depth: 30, height: 15 });
  snow.points.position.set(1.0, 0, -3.0);
  snow.points.visible = false;
  snow.points.material.transparent = true;
  const snowAlpha = snow.points.material.opacity;
  scene.add(snow.points);

  const skyBase = new THREE.Color(PAPER);
  const fogFrom = new THREE.Color(PAPER);
  const skyLit = new THREE.Color(ACCENT_LIGHT);
  const homeDir = new THREE.Vector3(
    Math.sin(MOON_BEARING) * Math.cos(SUN_ELEV),
    Math.sin(SUN_ELEV),
    -Math.cos(MOON_BEARING) * Math.cos(SUN_ELEV),
  );
  // the key stands on the moon's bearing and stays there — the swell is the
  // moon coming on, not the sky turning over
  if (sun) sun.position.copy(sunTargetAt).addScaledVector(homeDir, SUN_DIST);

  input.onTap(() => {
  if (!camera) return;
  if (input.raycastFirst(camera, [moon])) {
  // the snow outlasts the swell, so THAT is what gates a second touch
  if (clock - riseAt >= SNOW_SPAN) riseAt = clock;
  breeze = 1;
  touches++;
  // UNPOSITIONED on purpose: the moon stands 60 out, and a strike placed
  // there arrives through the far end of the spatial bus as a whisper —
  // the one ack in the book that must not be spatialised at its object
  audio && audio.chimeStrike({ tube: 1, force: 0.5 });
  return;
  }
  const hit = input.raycastFirst(camera, meadow);
  if (hit) {
  breeze = 1;
  touches++;
  }
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);           // drives the meadow's wind
  flowers.update(dt, simTime);

  // THE MOON COMES ON. The disc swells where it stands — it does not
  // approach, which would put it in front of the mountains; it grows, so
  // the ridge stays silhouetted against it the whole way. The sky goes with
  // it, and the land does not: background all the way to the moon's own
  // red, fog barely more than a third of it (see SKY_TINT / FOG_TINT).
  // the snow, on its own longer clock — see SNOW_SPAN
  snow.update(dt, simTime);
  const fall = snowShape(clock - riseAt);
  snow.points.visible = fall > 0.01;
  snow.points.material.opacity = snowAlpha * fall;

  const rise = riseShape(clock - riseAt);
  const s = 1 + (MOON_SWELL - 1) * rise;
  moon.scale.set(s, s, 1);
  // What this swell starts FROM, read live rather than from the palette: the
  // reading light can take the page dark under us (render/nightsky.js), and
  // lerping from the constant would put it back on the next frame. TWO bases,
  // because that module splits the sky from the fog exactly as this case does
  // — taking the fog from the sky's base would darken a fog it had left alone.
  skyBase.set(pageBase(scene, PAPER));
  fogFrom.set(fogBase(scene, PAPER));
  scene.background.copy(skyBase).lerp(skyLit, SKY_TINT * rise);
  scene.fog.color.copy(fogFrom).lerp(skyLit, FOG_TINT * rise);

  // snap to rest rather than decaying asymptotically forever, so the wind
  // level settles on an exact value instead of creeping
  breeze *= Math.exp(-dt / BREEZE_TAU);
  if (breeze < 1e-3) breeze = 0;
  audio && audio.setWindLevel(BASE_WIND * (1 + 0.8 * breeze));
  },
  fragment() {
  return {
  rise: +riseShape(clock - riseAt).toFixed(4),
  snow: +snowShape(clock - riseAt).toFixed(4),
  moonScale: +moon.scale.x.toFixed(3),
  // finite scalars and booleans only — a debug fragment is not a place
  // for a hex string (tests/staging.test.js)
  sky: +(SKY_TINT * riseShape(clock - riseAt)).toFixed(4),
  lean: +flowers.lean().toFixed(4),
  gusts: flowers.gustCount(),
  blooms: flowers.blooms,
  breeze: +breeze.toFixed(4),
  touches,
};
      },
      dispose() {},
    };
  },
};
