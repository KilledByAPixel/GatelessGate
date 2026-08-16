import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  aimMonk, composeWorld, faceMonk, makeAssembly, makeBasin, makeHut, makeMonk,
  makeVase, makeWater, tapMeshes, plantTree
} from '../kit/index.js';
import { makeLights } from '../render/lights.js';

const ID = 40;

// THE BEFORE, NEVER THE AFTER.
//
// The case ends with a vase on its side and a monastery decided. The diorama
// stages the moment it all still hangs on: the vase STANDS, alone on a patch
// of bare ground, and everything else in the scene is arranged around the fact
// of it. Hyakujo to one side, sleeve raised — the question is mid-air. The
// assembly seated in an arc, every face turned to the vase. And one monk of
// that crowd standing, a step forward of the others: the cooking monk, about
// to do the thing nobody labels. No spilled water. Nothing decided.
//
// THE RED SEAL is the vase and only the vase — small and held at full ACCENT,
// which glows on its own (SEAL_GLOW in render/material.js; nothing added here).
//
// The staging borrows k14's orbit lesson: the crowd is strung along a diagonal
// roughly square to the camera's home line, with the vase forward of everyone
// toward the lens, so no stretch of the orbit hides the one thing the case is
// about behind a wall of ink.

const VASE = { x: 1.5, z: 0.5 };      // forward of everyone, nearest the lens
const VASE_H = 0.55;
const HALL = { x: -1.0, z: -6.2 };    // the new monastery's stand-in, far back
const HYAKUJO = { x: 0.7, z: 1.3 };   // beside the vase, not behind it —
                                          // the red must sit against paper and
                                          // grass, never against a black robe
const ISAN = { x: 1.9, z: 0 };    // of the crowd, one step out of it
const CROWD = { x: 4.15, z: -1.1 };   // where the arc's centroid should land
// The washing basin — case 7's yard fitting, standing in this one. A monastery
// that argues about a water vase has somewhere it draws the water. Placed off
// to the side of the courtyard for now and meant to be moved: everything that
// depends on where it stands (its keepout, the water sheet, the ripple sound)
// reads BASIN rather than repeating the numbers, so nudging this one line
// carries the whole fitting with it.
const BASIN = { x: -2.2, z: -2.7};
const ARC_R = 1.9;
const ARC_PULL = ARC_R * 0.81;        // mean(cos) over the 0.7π arc — see k14

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11, target: [1.5, 1, -0.1], heading: 73, pitch: 14 };
  export default {
  id: ID,
  slug: 'tipping-over-a-water-vase',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'music'],
  mood: 'yo',      // the kick is play, not violence
  // Closer than the standard shot: the thing this case turns on is 0.55 units
  // tall, and the courtyard framing loses it. Target height splits the
  // difference between the vase and the standing figures.
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: 21, pitch: 52 } }));
  
  // ---- the hall ---------------------------------------------------------
  // Set well back, open front toward the clearing: the gathering happens
  // OUTSIDE it, which is what makes the ground in front read as a courtyard.
  const hall = makeHut({ width: 3.2, height: 2.5, depth: 2.6, color: WASH.dark, chimes: 39 });
  hall.position.set(HALL.x, 0, HALL.z);
  hall.rotation.y = Math.atan2(VASE.x - HALL.x, VASE.z - HALL.z);
  scene.add(hall);

  plantTree(scene, { x: -4, z: 0, height: 4, seed: ID + 1 });
  plantTree(scene, { x: -2, z: 2.5, height: 3.5, seed: ID + 2, kind:'pine' });
  
  // ---- the vase ---------------------------------------------------------
  // Alone on open ground, the way a test object is put down: nothing within
  // arm's reach of it. The bare pad under it is carved out of the grass
  // below (grassKeepout), not built — a clearing, not a plinth.
  const vase = makeVase({ height: VASE_H, color: ACCENT, seed: ID });
  vase.group.position.set(VASE.x, 0, VASE.z);
  scene.add(vase.group);
  
  // ---- Hyakujo ----------------------------------------------------------
  // The elder, staff planted, one sleeve raised toward the vase: the
  // question, still open. He stands aside so the reader's line to the vase
  // is his line to the vase.
  const hyakujo = makeMonk({ pose: 'point', height: 1.72, stout: 1.05, elder: true });
  hyakujo.position.set(HYAKUJO.x, 0, HYAKUJO.z);
  aimMonk(hyakujo, { x: VASE.x, z: VASE.z });
  scene.add(hyakujo);
  
  // ---- the assembly -----------------------------------------------------
  // Seated in a loose arc, every figure faced at the vase — the whole
  // monastery looking at one small red thing. makeAssembly fans onto the +z
  // side of its centre, so the centre is pushed back by ARC_PULL for the
  // crowd to land on the CROWD mark (k14's correction).
  const assembly = makeAssembly({
  count: 9, radius: ARC_R, spread: 3.0, seed: ID,
  center: [CROWD.x, CROWD.z - ARC_PULL],
  facing: [VASE.x, VASE.z],
  });
  scene.add(assembly);
  
  // ---- Isan -------------------------------------------------------------
  // One monk of the crowd on his feet, a step forward of the others, leaning
  // a few degrees toward the vase. Not labelled, not accented: the
  // composition says who he is — the only one already moving.
  const isan = makeMonk({ height: 1.58, hat: false, stout: 1.2 });
  isan.position.set(ISAN.x, 0, ISAN.z);
  faceMonk(isan, { x: VASE.x, z: VASE.z });
  isan.rotation.z = -0.07;   // applied before the yaw: a lean toward what he faces
  scene.add(isan);
  
  // ---- the washing basin ------------------------------------------------
  // The same fitting case 7's yard has, built the same way: an OPEN stone
  // basin (a solid cylinder seals the water under its top cap and there is
  // nothing to see), taller than it is wide or it reads as a puddle, with a
  // round sheet dropped just below the rim so the water sits IN it rather
  // than on it. The sheet is round because the basin is — a square one pokes
  // its corners out through the stone.
  const BASIN_H = 0.52;
  const basin = makeBasin({
    inner: 0.68, outer: 0.76, rim: BASIN_H, floor: 0.30, color: WASH.stone, segments: 12,
  });
  basin.position.set(BASIN.x, 0, BASIN.z);
  scene.add(basin);
  const water = makeWater({ shape: 'round', size: 1.4, color: WASH.ground });
  water.group.position.set(BASIN.x, BASIN_H - 0.10, BASIN.z);
  scene.add(water.group);
  const surface = water.group.children.find((c) => c.name === 'surface');

  // ---- the world --------------------------------------------------------
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  // generous: nothing scattered may land in the clearing, the crowd, or
  // the hall
  keepout: [
  { x: HALL.x, z: HALL.z, r: 3.0 },
  { x: VASE.x, z: VASE.z, r: 1.6 },
  { x: HYAKUJO.x, z: HYAKUJO.z, r: 1.2 },
  { x: ISAN.x, z: ISAN.z, r: 1.1 },
  { x: CROWD.x, z: CROWD.z, r: 3.0 },
  // by live reference, so moving BASIN moves what it keeps clear with it
  { at: basin, r: 1.2 },
  ],
  forests :[
    { center: [-23, 0, -27], spread: 23, count: 55 },
    { center: [16, 0, -31], spread: 24, count: 40 },
  ],
  // The examination yard is SWEPT. "Figures stand in grass" is the house
  // default and it is wrong here: Hyakujo has gathered the whole monastery
  // to watch a test, and that happens on the trodden ground before the
  // hall, not in waist-high meadow — at tuft height the vase all but
  // disappeared and the seated crowd read as heads floating in scrub. One
  // court-sized clearing spans the hall, the vase and the gathering; the
  // meadow starts where the occasion ends.
  grassKeepout: [
  { x: HALL.x, z: HALL.z, r: 2.4 },
  { x: (VASE.x + CROWD.x) / 2 - 0.6, z: (VASE.z + HALL.z) / 2, r: 4.6 },
  { x: VASE.x, z: VASE.z, r: 2.2 },
  { x: CROWD.x, z: CROWD.z, r: 2.6 },
  ],
  });

  // ---- the moment: it rocks, and rights itself --------------------------
  // Touch the vase and it tips a few degrees and wobbles back upright. That
  // is all, and it is the whole case held open: the reader's tap is Isan's
  // foot NOT quite happening. It cannot be knocked over — makeVase caps the
  // tilt far short of the tipping point however often it is tapped.
  let camera = null;
  let rippled = 0;
  const vaseMeshes = tapMeshes(vase.group);
  
  input.onTap(() => {
  if (!camera) return;
  // the vase first: it is the case, it is small, and it must never lose a
  // tap to the basin's broad sheet a few steps behind it
  const hit = input.raycastFirst(camera, vaseMeshes);
  if (hit) {
  touched && touched();
  vase.nudge();
  // stoneware, tipped and righting itself — the seal of this koan is the
  // only thing in the scene that could make a noise
  audio && audio.ceramic({ force: 0.8, at: hit.point });
  return;
  }
  // ...and the basin rings where you touch it, like every other water in the
  // book. NOT a find: the vase is what this page turns on (one find per
  // page), and the basin is the yard it is standing in.
  if (!surface) return;
  const onWater = input.raycastFirst(camera, [surface]);
  if (!onWater) return;
  const local = water.group.worldToLocal(onWater.point.clone());
  water.ripple(local.x, local.z);
  rippled++;
  audio && audio.drip({ loud: true, at: onWater.point });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);   // the meadow's wind
  vase.update(dt, simTime);    // the wobble, when there is one
  water.update(dt, simTime);   // ...and the basin's rings, or a touch leaves a still sheet
  },
  fragment() {
  return {
  nudges: vase.nudges(),
  rock: +vase.tilt().toFixed(4),
  rocking: vase.rocking(),
  rippled,
};
      },
      dispose() {},
    };
  },
};
