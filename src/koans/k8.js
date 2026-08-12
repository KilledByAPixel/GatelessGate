import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeWheel, makeMonk, faceMonk, makeStall, makeHut,
  makeLights, toonMaterial,
} from '../kit/index.js';

const ID = 8;

// Getsuan asks what becomes of a wheel when you take out the nave — the hub
// that unites fifty spokes. So the scene is a wheelwright's yard with one
// finished wheel standing on its stand, and the koan is a thing you can
// actually do to it: reach in, take the nave, and watch what is left.
//
// What is left keeps turning. It was never the hub that turned it.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 9, target: [0.7, 1.25, 0.4], heading: 31.5, pitch: 19 };
  export default {
  id: ID,
  slug: 'keichu-s-wheel',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the wheel is a real emitter: it knocks when it comes apart and when it
  // gathers itself back
  ambience: ['wind:0.20', 'wheel', 'music'],
  mood: 'yo',        // a workshop in daylight, not a night of doubt
  // closer than the default diorama rig: the subject is a wheel, not a hillside
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights());
  
  const path = makePath({ from: [-3.0, 8.5], to: [3.6, -18], width: 1.3, seed: ID, groundSeed: 21, wander: 1.0 });
  scene.add(path);
  
  // THE WHEEL, on its stand, turning. Its face is squared to the home camera
  // so the spokes read as spokes rather than as an edge-on line.
  //
  // EIGHT SPOKES, for the eightfold path (Frank). The case's own text says
  // fifty, which no wheel in a low-poly diorama was ever going to carry — at
  // this radius twelve already read as a grey blur where the hub should be,
  // and eight both counts as something and lets the nave the koan turns on
  // actually be seen between them.
  const wheel = makeWheel({ radius: 1.05, spokes: 8, wheelColor: ACCENT });
  wheel.group.position.set(1.3, 0, 0.4);
  wheel.group.rotation.y = 0.55;
  scene.add(wheel.group);
  
  // the yard it stands in: a trestle with an unfinished rim leaning on it —
  // one wheel finished, one not, which is what a wheelwright's yard is
  const timber = toonMaterial({ color: WASH.dark, flat: true });
  const trestle = new THREE.Group();
  trestle.name = 'trestle';
  for (const sx of [-1, 1]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.72, 0.11), timber);
  leg.name = 'leg';
  leg.position.set(sx * 0.5, 0.36, 0);
  trestle.add(leg);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.09, 0.34), timber);
  top.name = 'bench';
  top.position.y = 0.76;
  trestle.add(top);
  trestle.position.set(-1.9, 0, -1.5);
  
  // The workshop's stall (k45's roadside stand, restocked with a
  // cartwright's wares): Keichu made a hundred carts — somewhere he sold
  // the work. Behind the trestle, facing the road, it turns the yard
  // from "a wheel on a stand" into a man's whole living.
  const stall = makeStall({ seed: 8 });
  stall.position.set(-3.6, 0, 0.9);      // in frame left of the wheel, not hidden behind the trestle
  faceMonk(stall, { x: 1.3, z: 0.4 });   // open side toward the work
  scene.add(stall);
  trestle.rotation.y = -0.4;
  scene.add(trestle);
  
  // Keichu's own house, behind the working yard (Frank: "add a hut") —
  // a wheelwright lives where he works. Left-rear so the road (x≈0.4 at
  // this depth, measured off the seeded curve) keeps a clear verge, its
  // threshold opening onto the yard it feeds.
  const HUT = { x: -4.2, z: -4.2 };
  const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, chimes: 16 });
  hut.position.set(HUT.x, 0, HUT.z);
  faceMonk(hut, { x: 1.3, z: 0.4 });
  scene.add(hut);
  
  const blank = new THREE.Mesh(
  new THREE.TorusGeometry(0.78, 0.05, 5, 22),
  toonMaterial({ color: WASH.mid, flat: true }));
  blank.name = 'blank';                       // a rim with no spokes in it yet
  blank.position.set(-1.55, 0.80, -0.95);
  blank.rotation.set(-0.34, 0.5, 0.22);       // leaning against the bench
  scene.add(blank);
  
  // Getsuan, who asked, and the student he asked
  const master = makeMonk({ height: 1.66, elder: true, hat: false });
  master.position.set(-0.4, 0, 1.7);
  master.rotation.y = 1.8;
  scene.add(master);
  
  const student = makeMonk({ height: 1.56, pose: 'sit' });
  student.position.set(2.8, 0, 1.5);
  faceMonk(student, wheel.group.position);
  scene.add(student);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.1),
  { x: 1.3, z: 0.4, r: 2.0 },
  { at: trestle, r: 1.6 },
  { at: master, r: 1.1 },
  { at: student, r: 1.1 },
  { at: stall, r: 1.6 },
  { at: hut, r: 3.0 },
  ],
  // the working yard is trodden bare around the stand and the bench
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { x: 1.3, z: 0.4, r: 1.5 },
  { at: trestle, r: 1.1 },
  { at: hut, r: 1.9 },
  ],
  });

  // ---- the moment: take out the nave -----------------------------------
  let camera = null;
  let pulls = 0;
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, wheel.pickTargets())) return;
  const whole = wheel.toggle();
  pulls++;
  // wood coming apart, and wood gathering itself back
  audio && audio.knock({ force: whole ? 0.55 : 0.85, at: wheel.group.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);
  wheel.update(dt, simTime);
  },
  fragment() {
  return {
  pulls,
  hubbed: wheel.hubbed(),
  assembled: +wheel.assembled().toFixed(3),
  turn: +wheel.turn().toFixed(3),
};
      },
      dispose() {},
    };
  },
};
