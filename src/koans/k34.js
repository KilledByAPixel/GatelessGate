import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeRain, makeMonk, faceMonk,
  makeLights, addOutlines, toonMaterial, makeFurin,
} from '../kit/index.js';

const ID = 34;

// "Mind is not Buddha. Learning is not the path." Two sentences, and Mumon
// says Nansen was getting old and forgot to be ashamed.
//
// The scene is the study the second sentence walks out of — the RED house
// the old man has turned his back on — a reading mat before its door with a
// monk still seated on it, and Nansen standing apart from all of it.
// Overhead, rain — the verse's own weather: "When the earth is parched rain
// will fall." The birds that used to cross this sky moved on (Frank is
// thinking about where); what's left overhead now is indifferent to the
// sentence that just walked out the door.
//
// Touch the mat and the shower leans in for a moment. That is the whole of
// what the words do when they leave the paper — they ask, and the sky
// answers, briefly, then settles back to its own patter.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.5, target: [0.7, 1.5, -0.8], heading: 31.5, pitch: 20.1 };
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
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights());
  
  // The road, back to ordinary dirt — it carried the case's red for a
  // while, but a ground-spanning ribbon never sat right as a seal.
  const path = makePath({ from: [4.6, 8.2], to: [5.1, -20], width: 1.3, seed: ID, groundSeed: 21, wander: 0.8 });
  scene.add(path);
  
  // THE STUDY is the seal now (Frank: "make the little house red, because
  // it mentions his home") — the one red thing is the home the sentences
  // walk out of. A building is a big mass, so it takes the DEEP mix, per
  // the palette's own rule: same hue, less glare.
  const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, color: ACCENT_DEEP });
  hut.position.set(-1.0, 0, -3.6);
  hut.rotation.y = 0.46;
  scene.add(hut);
  
  // THE MAT. Lifted just clear of the ground and drawn in front of it
  // (polygonOffset) so it never z-fights the terrain or the path. The
  // scrolls that used to cover it — 22 loose cylinders, then a cord-wood
  // pile with part-unrolled ribbons — are GONE entirely: three rounds of
  // Frank asking what the cylinders were is the answer to whether they ever
  // read as scrolls.
  const matMat = toonMaterial({ color: WASH.dry, flat: true });
  matMat.polygonOffset = true;
  matMat.polygonOffsetFactor = -2;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 1.9), matMat);
  mat.name = 'mat';
  mat.position.set(.5, 0.035, -0.7);
  mat.rotation.y = 0.5;
  scene.add(mat);
  
  // ...and a student on it (Frank: "let's put a monk sitting down on that
  // mat, just kinda sitting there"). He faces the shut study — the one who
  // stayed with the books while Nansen walked off. Seated on the mat's top
  // face; the sit pose brings its own zabuton.
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
  eaveChime.group.position.set(1.1, 2.3, 1.25);
  hut.add(eaveChime.group);
  
  // THE RAIN: the verse's own weather — "When the earth is parched rain
  // will fall" — already falling over the study, indifferent to the
  // sentence that walked out of it.
  const rain = makeRain({ count: 460, seed: ID, width: 26, depth: 26, height: 13 });
  scene.add(rain.points);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
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
  
  addOutlines(scene, { width: 0.030, wobble: 0.7 });
  
  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(1.7, 1.7, 0.9, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'mat-hit';
  hit.userData.noOutline = true;
  hit.position.set(-0.1, 0.35, -0.8);
  scene.add(hit);
  
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
  if (!input.raycastFirst(camera, [hit])) return;
  if (clock - lastAt < 0.5) return;
  lastAt = clock;
  // ask, and the sky answers: the shower leans in for a moment
  rain.surge(1);
  disturbed++;
  audio && audio.rainSurge();
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  rain.update(dt, simTime);
  eaveChime.setWindLevel(1);   // the kit's own default; see k47's furin
  eaveChime.update(dt, simTime);
  },
  fragment() {
  return {
  disturbed,
  drops: rain.count(),
  surge: +rain.surgeLevel().toFixed(4),
  chimeStrikes: eaveChime.strikes(),
};
      },
      dispose() { rain.dispose(); },
    };
  },
};
