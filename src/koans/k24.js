import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeWildflowers, makeBirds, makeMonk, faceMonk,
  makeBuffalo, makeLights, addOutlines, bakeStatic,
} from '../kit/index.js';

const ID = 24;

// Asked how to express the truth without speaking and without silence,
// Fuketsu answers with a memory of spring in southern China: the birds singing
// among innumerable kinds of fragrant flowers. Mumon grumbles that he only
// borrowed an old poem.
//
// The scene is that line, taken at face value. A meadow full of blooms, a man
// sitting in it, and birds. Touch him and he does not speak and does not stay
// silent either — the birds go up instead, and the flowers move, and that is
// the whole answer. Southern China, spring, borrowed from someone else.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 17, target: [3.95, 1.25, -1.3], heading: -24.5, pitch: 17.5, maxDist: 18 };
  export default {
  id: ID,
  slug: 'without-words-without-silence',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.20:broadleaf', 'birds', 'music'],
  mood: 'yo',      // the brightest case in the book: it is literally springtime
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.026);
  scene.add(makeLights());
  
  const path = makePath({ from: [5.0, 8.0], to: [-3.0, -18], width: 1.2, seed: ID, groundSeed: 21, wander: 1.4 });
  scene.add(path);
  
  // FUKETSU, sitting in the middle of the answer
  const fuketsu = makeMonk({ height: 1.58, pose: 'sit' });
  fuketsu.position.set(1.1, 0, 1.1);
  faceMonk(fuketsu, { x: 4.0, z: 4.0 });
  scene.add(fuketsu);
  
  // the monk who asked the question, standing over him
  const monk = makeMonk({ height: 1.60 });
  monk.position.set(3.1, 0, 2.2);
  faceMonk(monk, fuketsu.position);
  scene.add(monk);
  
  // A buffalo (k37's, off its tether) grazing far up the meadow — spring
  // in southern China is a WORKED landscape, and one grazing animal in
  // the middle distance is what says so without saying anything. Angled
  // away from camera, head down: grazing, not posing.
  const buffalo = makeBuffalo({ height: 1.4, seed: 24 });
  buffalo.group.position.set(12, 0, -9.0);
  buffalo.group.rotation.y = .7;
  scene.add(buffalo.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 8,
  keepout: [
  ...path.keepout(24, 1.0),
  { at: fuketsu, r: 1.3 },
  { at: monk, r: 1.2 },
  { at: buffalo.group, r: 2.0 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.9),
  
  { at: fuketsu, r: 1.2 },
  ],
  });
  
  // INNUMERABLE KINDS OF FRAGRANT FLOWERS — a meadow genuinely in bloom, on
  // the kit's default palette: whitish petals off the paper, stalks in the
  // grass tone. Scaled up from the kit default and a little denser, so the
  // blooming reads at this camera instead of dissolving into grass texture.
  // The accent belongs to the birds below, not to the ground.
  const flowers = makeWildflowers({
  count: 175,
  scale: 2,
  radius: 17,
  seed: ID,
  groundSeed: 21,
  keepout: [
  ...path.keepout(24, 0.8),
  { at: fuketsu, r: 0.9 },
  { at: monk, r: 0.8 },
  ],
  });
  scene.add(flowers.mesh);
  
  // AND THE BIRDS — the seal of this case. "The birds sing among innumerable
  // kinds of fragrant flowers": the birds are what the whole answer is, so
  // they carry the accent. Small marks against the sky, so full accent reads
  // as seals rather than glare.
  // LOWER, and at MIXED altitudes. At height 6 with the stock 2.6 spread
  // they all cruised in one narrow band near the top of the frame, which
  // read as a row rather than a flock and half-left the picture (Frank:
  // "all the birds are kind of the exact same height... a little bit
  // lower, because they're kind of almost off the top of the camera").
  const birds = makeBirds({
  count: 9, seed: ID, center: [0.5, -1.0], color: ACCENT,
  height: 4.4, heightVary: 4.4, spread: 5.6,
  });
  scene.add(birds.group);
  
  // ---- THE BAKE ---------------------------------------------------------
  // Fuketsu and his questioner stand; the buffalo grazes without going
  // anywhere. All of that is one mesh per material once it is merged, before
  // the ink pass doubles it — 136 draw calls to about 84.
  //
  // NOT THE BIRDS. They are the seal of this case and every one of them
  // flaps: three meshes apiece that have to stay three meshes.
  //
  // The buffalo keeps its TAIL. Sixteen of its eighteen pieces never move,
  // but the tail swings on makeTail's own clock (buffalo.update), and a
  // merged tail is a tail that has stopped.
  //
  // The trees and pines are not passed in at all — bakeStatic would refuse
  // them anyway (their canopies carry wind attributes and a shell that reads
  // them), and asking is just a slower way of being told no.
  bakeStatic([fuketsu, monk], { name: 'the-two' });
  bakeStatic(buffalo.group, { keep: ['tail'] });

  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.85, 1.6, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'fuketsu-hit';
  hit.userData.noOutline = true;
  hit.position.set(0.8, 0.7, 0.6);
  scene.add(hit);
  
  // ---- the moment: neither words nor silence ---------------------------
  let camera = null;
  let clock = 0;
  let asked = 0;
  let lastAsk = -99;
  const song = [];
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, [hit])) return;
  if (clock - lastAsk < 0.8) return;
  lastAsk = clock;
  asked++;
  birds.scatter();
  // he says nothing, and he is not silent either: a breath crosses the
  // meadow from where he sits, and three notes go up out of the grass,
  // spaced like birdsong rather than struck like a chord
  flowers.gustAt(fuketsu.position.x, fuketsu.position.z, 0.5);
  song.length = 0;
  song.push(clock + 0.05, clock + 0.31, clock + 0.68);
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  birds.update(dt, simTime);
  flowers.update(dt, simTime);
  buffalo.update(dt, simTime);
  
  while (song.length && clock >= song[0]) {
  song.shift();
  audio && audio.chimeStrike({ tube: song.length, force: 0.5, at: fuketsu.position });
  }
  },
  fragment() {
  return { asked, aloft: +birds.energy().toFixed(4), birds: birds.count() };
  },
  dispose() {},
};
  },
};
