import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeRain, makeMonk, faceMonk,
  makeLights, washMaterial, makeFurin, tapMeshes, makeDrum,
  setFoliageWeather, foliageWind,
} from '../kit/index.js';

const ID = 34;

// THE SQUALL. Touching the house does not just call more rain, it calls WEATHER
// — more rain AND more wind together: the meadow lies over, the wood works, the
// shower leans with them, and the sound comes up. Rain falling plumb while the
// grass flattens is two weathers on one page, which is why the lean is here at
// all.
//
// It all rides ONE envelope — the rain's own surge level, which already holds
// for 2.5s and then decays. A second envelope beside it would be a second thing
// to keep in step, and there is nothing this needs that the first cannot say.
const SURGE = 1.5;        // what a touch asks for; makeRain caps at exactly this
const GUST_MULT = 3.4;    // extra grass wind at the top of the surge
const RAIN_LEAN = 0.46;   // the shower's own tangent there, from 0.18 at rest
const WIND_HEARD = 0.16;  // the ambience's own level, from the recipe below

// "Mind is not Buddha. Learning is not the path." Two sentences, and Mumon
// says Nansen was getting old and forgot to be ashamed.
//
// The scene is the study the second sentence walks out of — the RED house the
// old man has turned his back on — a reading mat before its door with a monk
// still seated on it, and Nansen standing apart from all of it. Overhead, rain
// — the verse's own weather: "When the earth is parched rain will fall." The
// birds that used to cross this sky moved on; what's left overhead now is
// indifferent to the sentence that just walked out the door.
//
// Touch the house and the shower leans in for a moment. That is the whole of
// what the words do when they leave the paper — they ask, and the sky
// answers, briefly, then settles back to its own patter. (It used to be the
// reading MAT, which is a low pale rectangle mostly hidden under a seated monk;
// the house is the biggest thing on the page and the only red one, so it is
// where the composition already points.)
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.5, target: [1.75, 1.5, -0.8], heading: 31.5, pitch: 20.1 };
  export default {
  id: ID,
  slug: 'learning-is-not-the-path',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'furin' names the single small tube hung under the study's own eave —
  // the red house is somebody's home (the seal says so), so it earns the
  // one ordinary domestic sound a lived-in study would have, indifferent to
  // the sentence that just walked out its door. REVISED from a bronze
  // cylinder to a tubes:1 fūrin (code review: four of the five cylinder
  // cases hung the same object in the same beam-underside spot, sizes
  // 0.7-0.9 the only thing distinguishing them) — a lighter, higher voice,
  // the other half of the kit's own vocabulary, still one quiet tube.
  ambience: ['wind:0.16:broadleaf', 'rain', 'furin', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights({ sun: { heading: 159, pitch: 35 } }));
  
  // The road, back to ordinary dirt — it carried the case's red for a
  // while, but a ground-spanning ribbon never sat right as a seal.
  const path = makePath({ from: [4.6, 8.2], to: [5.1, -20], width: 1.3, seed: ID, groundSeed: 21, wander: 0.8 });
  scene.add(path);
  
  // THE STUDY is the seal now — the case names his home, and the one red thing
  // is the home the sentences walk out of. A building is a big mass, so it
  // takes the DEEP mix, per the palette's own rule: same hue, less glare.
  const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, color: ACCENT_DEEP });
  hut.position.set(-1.0, 0, -3.6);
  hut.rotation.y = 0.46;
  scene.add(hut);

    const drum = makeDrum({ radius: 0.5, seed: ID });
    drum.group.position.set(2.0, 0, -3.6);
    drum.group.rotation.y = -.7;
    scene.add(drum.group);
    
  // THE MAT. Lifted just clear of the ground and drawn in front of it
  // (polygonOffset) so it never z-fights the terrain or the path. The scrolls
  // that used to cover it — 22 loose cylinders, then a cord-wood pile with
  // part-unrolled ribbons — are GONE entirely: three rounds of being asked
  // three times over what the cylinders were is the answer to whether they ever
  // read as scrolls.
  const matMat = washMaterial({ color: WASH.dry, flat: true });
  matMat.polygonOffset = true;
  matMat.polygonOffsetFactor = -2;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 1.9), matMat);
  mat.name = 'mat';
  mat.position.set(.5, 0.02, -0.7);
  mat.rotation.y = 0.5;
  scene.add(mat);
  
  // ...and a student on it, just sitting there. He faces the shut study — the
  // one who stayed with the books while Nansen walked off. Seated on the mat's
  // top face; the sit pose brings its own zabuton.
  const student = makeMonk({ height: 1.6, pose: 'sit' });
  student.position.set(0.3, 0.05, -0.7);
  faceMonk(student, hut.position);
  scene.add(student);
  
  // NANSEN, apart from it, facing away — he said the sentence and walked off
  const nansen = makeMonk({ height: 1.66, elder: true });
  nansen.position.set(3.4, 0, 0.9);
  faceMonk(nansen, { x: 8.0, z: 4.0 });
  scene.add(nansen);
  
  // One small tube on a cord, hung under the study's own front eave, clear
  // of the doorway (|x| < ~0.69 at this width) and the corner post
  // (x ~ 1.5). Local to the hut so it stays square to the house's own
  // facing.
  const eaveChime = makeFurin({
  tubes: 1, seed: 34,
  onStrike: (_, force, pos) => audio && audio.chimeStrike({ tube: -1, force, at: pos }),
  });
  eaveChime.group.position.set(1.1, 2.3, 1.5);
  hut.add(eaveChime.group);
  
  // THE RAIN: the verse's own weather — "When the earth is parched rain will
  // fall" — already falling over the study, indifferent to the sentence that
  // walked out of it. 700 drops rather than 460 — this is the book's rain case
  // and it wants more of it. It costs nothing in draws (the whole shower is one
  // LineSegments) and nothing in the budget; only vertices.
  const rain = makeRain({ count: 700, seed: ID, width: 26, depth: 26, height: 13 });
  scene.add(rain.points);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 98,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.1),
  { x: hut.position.x, z: hut.position.z, r: 3.0 },
  { x: 0.7, z: -0.9, r: 2.2 },
  { at: nansen, r: 1.2 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { x: hut.position.x, z: hut.position.z, r: 2.0 },
  { x: 0.9, z: -0.7, r: 1.7 },
  ],
  });

  // THE HOUSE IS THE TARGET, and it needs no proxy: it is the biggest thing on
  // the page and it is the one thing painted red, so the reader already knows
  // where to aim: the house is the red thing, so the house is what you touch.
  // The tap was on the reading MAT, which is a low pale rectangle mostly hidden
  // under a seated monk, and asked the reader to find the one thing on the page
  // the composition does not point at.
  //
  // Its own meshes, via the kit's tapMeshes — minus the eave chime hung under
  // it, which is a child of the hut and has its own pick() probed first below.
  // Leaving the chime's meshes in this list would be harmless today (the chime
  // probe returns before this is reached) and a trap the day the order changes.
  const chimeMeshes = new Set(tapMeshes(eaveChime.group));
  const hutMeshes = tapMeshes(hut).filter((m) => !chimeMeshes.has(m) && m.material.visible !== false);

  // ---- the moment: the words go up -------------------------------------
  let camera = null;
  let clock = 0;
  let disturbed = 0;
  let lastAt = -99;
  
  input.onTap(() => {
  if (!camera) return;
  // the eave chime first, so a tap aimed at it never also calls the rain
  const chimeHit = eaveChime.pick(camera, input);
  if (chimeHit) { eaveChime.ring(0.75, chimeHit.tube); return; }
  if (!input.raycastFirst(camera, hutMeshes)) return;
  if (clock - lastAt < 0.5) return;
  touched && touched();
  lastAt = clock;
  // ask, and the sky answers: the shower leans in for a moment
  rain.surge(SURGE);
  disturbed++;
  audio && audio.rainSurge();
  });

  // ---- the weather the surge brings with it ------------------------------
  // Sampled at the moment of taking over and handed back exactly on the way
  // out, so the workbench's sliders are only ever borrowed while it is actually
  // blowing — the same contract case 20's squall and case 29's flag keep with
  // the same two knobs. The FOLIAGE wind is one module-level uniform shared by
  // every tree in the book, which is why it is also released in dispose().
  const grass = world.grass;
  let blowing = false;
  let grassBase = 1;
  let treeBase = 1;
  const release = () => {
  blowing = false;
  grass && grass.setWind(grassBase);
  setFoliageWeather({ wind: treeBase });
  rain.setLean(0.16);                    // makeRain's own default, the rest state
  audio && audio.setWindLevel(WIND_HEARD);
  };
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  rain.update(dt, simTime);
  // ONE ENVELOPE FOR ALL OF IT: the rain's own surge, normalised, so the
  // grass, the wood, the shower's lean, the chime and the ear can never
  // drift apart. Read AFTER rain.update so the level is this frame's.
  const g = Math.min(1, rain.surgeLevel() / SURGE);
  if (g > 0.001) {
  if (!blowing) {
  blowing = true;
  grassBase = grass && grass.wind ? grass.wind() : 1;
  treeBase = foliageWind();
  }
  grass && grass.setWind(grassBase * (1 + GUST_MULT * g));
  setFoliageWeather({ wind: treeBase * (1 + GUST_MULT * g) });
  rain.setLean(0.16 + (RAIN_LEAN - 0.16) * g);
  audio && audio.setWindLevel(WIND_HEARD * (1 + 2.2 * g));
  } else if (blowing) {
  release();
  }
  // the eave chime answers the same weather — a bell hanging in a squall
  eaveChime.setWindLevel(1 + GUST_MULT * g);
  eaveChime.update(dt, simTime);
  },
  fragment() {
  return {
  disturbed,
  drops: rain.count(),
  surge: +rain.surgeLevel().toFixed(4),
  gust: +Math.min(1, rain.surgeLevel() / SURGE).toFixed(4),
  grassWind: +(world.grass && world.grass.wind ? world.grass.wind() : 0).toFixed(3),
  rainLean: +rain.lean().toFixed(3),
  chimeStrikes: eaveChime.strikes(),
};
      },
      // the trees' wind is one uniform shared by the whole book, so a reader
      // who turns the page mid-squall must not take the weather with them
      dispose() { if (blowing) release(); rain.dispose(); },
    };
  },
};
