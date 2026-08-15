import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  aimMonk, composeWorld, faceMonk, makeAssembly, makeCat, makeHut, makeMonk,
} from '../kit/index.js';
import { washMaterial } from '../render/material.js';
import { makeLights } from '../render/lights.js';

const ID = 14;

// THE MOMENT BEFORE.
//
// The text of this case ends in a killing. The diorama does not, and that is
// deliberate: the koan is not the cut, it is the silence that made the cut
// possible. Nansen has asked for one good word and nobody has said it yet. So
// the courtyard holds a live cat, two halls' worth of monks who have stopped
// arguing, and a question standing in the air with no answer under it.
//
// The reader arrives standing exactly where the silent monks stood. There is no
// blade in this scene and there never will be — staging the after would answer
// the koan on the reader's behalf, which is the one thing a koan must not do.
// (This case set the rule the rest of the book follows: the diorama stages the
// moment the case hangs on, and that moment is almost always before anything
// is resolved.)
//
// THE RED SEAL is the cat, and only the cat. It is small enough to take full
// ACCENT rather than the deepened mix a large mass needs.

// The courtyard, and the axis the two halls face each other across. That axis
// runs SQUARE TO THE CAMERA'S LINE on purpose: the shot orbits, and two groups
// strung along the view would spend most of the arc hiding behind one another.
const C = { x: 1.0, z: -1.6 };
const U = { x: 0.853, z: -0.522 };   // east <-> west
const V = { x: 0.522, z: 0.853 };    // and square to that
const at = (a, b = 0) => ({ x: C.x + U.x * a + V.x * b, z: C.z + U.z * a + V.z * b });

const PAD_R = 1.9;                  // the swept ground, the only thing that clears grass
const STONE = { x: 1.8, z: 0.0 };    // the cat's perch, forward of Nansen toward the lens
const STONE_TOP = 0.30;

const EAST_ONE = at(2., 1.5), WEST_ONE = at(-1.3, -1.7);   // the two who were arguing
const EAST_HALL = { x: 2.4, z: -6.2 }, WEST_HALL = { x: -3.7, z: -3.5 };

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.5, target: [1.05, 1.45, -1.75], heading: 35, pitch: 18.5 };
  export default {
  id: ID,
  slug: 'nansen-cuts-the-cat-in-two',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12'],
  // Closer and lower than the standard diorama shot: the thing this case turns
  // on is 0.42 units tall, and the default framing loses it in the courtyard.
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  // High and short-shadowed. The other sensitive case handled the
  // same way case 3 is — see the note there.
  scene.add(makeLights({ sun: { heading: 68, pitch: 48 } }));
  
  // ---- the courtyard ----------------------------------------------------
  // Swept ground, and the only footprint in the case that genuinely covers
  // earth. Everyone else stands in grass, because they would.
  const pad = new THREE.Mesh(
  new THREE.CylinderGeometry(PAD_R, PAD_R * 1.02, 0.09, 12),
  washMaterial({ color: WASH.stone, flat: true }));
  pad.name = 'courtyard';
  pad.position.set(C.x, 0.005, C.z);   // sunk a little so it cannot z-fight the ground
  pad.rotation.y = 0.2;
  scene.add(pad);
  
  // ---- the two halls ----------------------------------------------------
  // Set well back, one either side, so they read as the buildings the two
  // arguing parties came out of rather than as scenery in the way.
  for (const [p, w, h, d, chimes] of [[EAST_HALL, 2.6, 2.3, 2.2, 0], [WEST_HALL, 2.3, 2.1, 2.0, 115]]) {
  const hall = makeHut({ width: w, height: h, depth: d, color: WASH.dark, chimes });
  hall.position.set(p.x, 0, p.z);
  hall.rotation.y = Math.atan2(C.x - p.x, C.z - p.z);   // open front toward the courtyard
  scene.add(hall);
  }
  
  // ---- the cat ----------------------------------------------------------
  // Alive, whole, and completely uninterested. It sits on a stone rather than
  // in Nansen's hands: held, it would read as a thing being brandished, and
  // this cat is not in any trouble it knows about.
  const stone = new THREE.Mesh(
  new THREE.CylinderGeometry(0.40, 0.46, 0.34, 7),
  washMaterial({ color: WASH.stone, flat: true }));
  stone.name = 'stone';
  stone.position.set(STONE.x, STONE_TOP - 0.17, STONE.z);
  stone.rotation.y = 0.6;
  scene.add(stone);
  
  const cat = makeCat({ height: 0.44, color: ACCENT, seed: ID, pose: 'sit' });
  cat.group.position.set(STONE.x, STONE_TOP, STONE.z);
  cat.group.rotation.y = 0.35;        // looking out past the whole argument
  scene.add(cat.group);
  
  // ---- Nansen -----------------------------------------------------------
  // In the middle of the swept ground, one sleeve raised toward the cat: the
  // challenge, mid-air. Nothing in his hand.
  const nansen = makeMonk({ pose: 'point', height: 1.75, stout: 1.06 });
  nansen.position.set(C.x, 0.05, C.z);
  aimMonk(nansen, { x: STONE.x, z: STONE.z });
  scene.add(nansen);
  
  // ---- the two halls' monks --------------------------------------------
  // Two instanced seated crowds ringing the courtyard from opposite sides
  // (arcCenter is what lets them face each other across it), each with one
  // standing figure stepped out in front — the two who had been doing the
  // arguing. Every one of them is turned toward the cat. Nobody is turned
  // toward Nansen, because nobody has anything to say to him.
  const westCrowd = makeAssembly({
    count: 5, radius: 2.2, spread: 1, seed: ID * 3,
    center: [C.x-.1, C.z+.5],
    facing: [STONE.x, STONE.z],
    arcCenter:-.9,
    arcSpan:1.7
  });
  scene.add(westCrowd);

  const eastCrowd = makeAssembly({
    count: 5, radius: 2.3, spread: 1.1, seed: ID * 3+17,
    center: [C.x+.1, C.z-.3],
    facing: [STONE.x, STONE.z],
    arcCenter:-3.75,
    arcSpan:1.7
  });
  scene.add(eastCrowd);

  for (const [p, stout] of [[EAST_ONE, 1.0], [WEST_ONE, 1.1]]) {
  const m = makeMonk({ height: 1.6, stout });
  m.position.set(p.x, 0, p.z);
  faceMonk(m, { x: STONE.x, z: STONE.z });
  scene.add(m);
  }
  
  // ---- the world --------------------------------------------------------
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 3,
  // generous: nothing scattered may land in the courtyard, in either group,
  // or inside a hall
  keepout: [
  { x: C.x, z: C.z, r: 3.3 },
  { x: STONE.x, z: STONE.z, r: 1.4 },
  // the crowds' own reckoning of where they sit — a retuned arc moves its
  // keepout with it instead of leaving it guarding empty grass
  { ...westCrowd.userData.footprint, r: westCrowd.userData.footprint.r + 0.9 },
  { ...eastCrowd.userData.footprint, r: eastCrowd.userData.footprint.r + 0.9 },
  { x: EAST_ONE.x, z: EAST_ONE.z, r: 1.2 },
  { x: WEST_ONE.x, z: WEST_ONE.z, r: 1.2 },
  { x: EAST_HALL.x, z: EAST_HALL.z, r: 2.6 },
  { x: WEST_HALL.x, z: WEST_HALL.z, r: 2.4 },
  ],
  // stingy: only the swept courtyard actually covers ground. The monks
  // stand in the meadow, which is where monks stand.
  grassKeepout: [{ x: C.x, z: C.z, r: 2.15 }],
  });

  // ---- the moment: the cat is fine --------------------------------------
  // Touch it and it stretches, swivels an ear and curls its tail, then settles
  // back to ignoring everyone. That is the whole interaction, and it is meant
  // to be an anticlimax: the reader goes looking for the thing that resolves
  // the case and finds a cat having a nice time.
  let camera = null;
  const targets = [...cat.meshes(), stone];
  
  input.onTap(() => {
  if (!camera) return;
  const hit = input.raycastFirst(camera, targets);
  if (!hit) return;
  touched && touched();
  cat.stir();
  // the stretch was silent, and a touch wants an answer. cloth is the palette's
  // fur — a brush, not an impact; nothing sharper belongs anywhere near this
  // cat.
  // cloth is the softest voice in the palette, so the seal's own ack runs
  // at the top of what still reads as a brush (the cat test holds the
  // ceiling: fur, never an impact) rather than the palette-typical middle
  audio && audio.cloth({ force: 0.6, at: hit.point });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);      // the meadow's wind
  cat.update(dt, simTime);
  },
  fragment() {
  return {
  stirs: cat.stirCount(),
  stir: +cat.stirLevel().toFixed(4),
  stirring: cat.stirring(),
};
      },
      dispose() {},
    };
  },
};
