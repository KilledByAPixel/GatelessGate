import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makePath, makeHut, makeMonk, aimMonk, faceMonk, makeLantern,
  makeScale, makeLights, washMaterial, makeFurin,
} from '../kit/index.js';

const ID = 31;

// Every traveller who asks the old woman the road to Taizan gets the same four
// words — "Go straight ahead" — and the moment they walk on she says to
// herself that this one is a common church-goer too. Joshu goes and asks and
// gets the identical answer, comes back, and announces he has investigated her.
//
// The answer is a machine, so the scene is built around the giving of it: her
// tea stall at the fork, the road running past, and the arm she raises. Ask
// her as many times as you like. The arm goes up, the same way, at the same
// speed, and points the same direction, whoever is standing there.

const POINT = 1.5;        // seconds: raise, hold, and back down

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.4, target: [1.95, 1.3, -0.2], heading: 31.5, pitch: 18.4 };
  export default {
  id: ID,
  slug: 'joshu-investigates',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'furin' names the single tube hung under the stall's own eave — a
  // wayside tea stall is a business somebody keeps, and the eave over a
  // bench is exactly where a real one hangs. One small quiet voice, not a
  // cluster: the woman's answer is a machine, always the same; the chime
  // stays a background murmur so it never reads as a second, competing
  // "reply."
  ambience: ['wind:0.20', 'stall', 'furin', 'music'],
  mood: 'yo',
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -33, pitch: 48 } }));
  
  // the road, and the branch of it that goes on to Taizan
  const road = makePath({ from: [5.4, 7.6], to: [-4.4, -16], width: 1.6, seed: ID, groundSeed: 21, wander: 0.6 });
  scene.add(road);
  const branch = makePath({ from: [1.6, -2.2], to: [9.0, -14], width: 1.1, seed: ID * 3, groundSeed: 21, wander: 0.9 });
  scene.add(branch);
  
  // the tea stall at the fork: a hut with an awning over a bench
  const stall = makeHut({ width: 2.6, height: 2.0, depth: 2.1 });
  stall.position.set(-2.6, 0, -2.6);
  stall.rotation.y = 0.7;
  scene.add(stall);
  
  // The merchant's scale (k18's, weighing tea instead of flax), standing
  // by the stall's serving side. The old woman RUNS this place — a
  // working shop weighs its goods, and the case is about being weighed.
  const scale = makeScale({ height: 1.2, reading: 2 });
  scale.group.position.set(-2.15, 0, -0.75);
  faceMonk(scale.group, { x: 2.4, z: 1.5 });   // toward the customer's approach
  scene.add(scale.group);
  
  const awning = new THREE.Mesh(
  new THREE.BoxGeometry(2.4, 0.07, 1.3),
  washMaterial({ color: WASH.dry, flat: true }));
  awning.name = 'awning';
  awning.position.set(-1.5, 1.75, -1.7);
  awning.rotation.set(0.16, 0.7, 0);
  scene.add(awning);
  
  const bench = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 0.09, 0.42),
  washMaterial({ color: WASH.dark, flat: true }));
  bench.name = 'bench';
  bench.position.set(-1.4, 0.42, -1.5);
  bench.rotation.y = 0.7;
  scene.add(bench);
  for (const sx of [-1, 1]) {
  const leg = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.42, 0.32),
  washMaterial({ color: WASH.dark, flat: true }));
  leg.name = 'leg';
  leg.position.set(-1.4 + sx * 0.62 * Math.cos(0.7), 0.21, -1.5 - sx * 0.62 * Math.sin(0.7));
  leg.rotation.y = 0.7;
  scene.add(leg);
  }
  
  // Two cups on the bench — the tea nobody in this case ever drinks. They used
  // to be the seal, and two 5cm cylinders on a bench in the middle distance is
  // a poor place to spend the one warm note on a page: at the home lens they
  // read as two red specks and the woman giving the answer — who IS the case —
  // was painted the same ink as everybody else. The seal moved to her. Stall
  // timber, now, like the bench they stand on.
  for (const off of [-0.35, 0.3]) {
  const cup = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.045, 0.075, 8),
  washMaterial({ color: WASH.mid, flat: true }));
  cup.name = 'cup';
  cup.position.set(-1.4 + off * Math.cos(0.7), 0.50, -1.5 - off * Math.sin(0.7));
  scene.add(cup);
  }
  
  // THE OLD WOMAN, at her stall, with the answer ready — and this page's one
  // warm note, since the answer is hers and the whole case is an argument
  // about what she is. The book's other red figure (case 4's portrait of
  // Bodhidharma) is a painting of a man; this is a woman at a roadside stall,
  // and the accent is doing the same job in both: naming who the case is
  // about before a word of it is read.
  const woman = makeMonk({ height: 1.5, hat: false, stout: 1.08, pose: 'point', color: ACCENT });
  const WOMAN = new THREE.Vector3(-0.7, 0, -0.9);
  woman.position.copy(WOMAN);
  // she points UP THE ROAD, not at whoever asked — that is the whole joke
  aimMonk(woman, { x: 5, z: -29 });
  scene.add(woman);
  const arm = woman.children
  .filter((c) => c.name === 'arm')
  .find((c) => Math.abs(c.rotation.z) > 1);
  const ARM_REST = arm ? arm.rotation.z : 0;
  
  // and the traveller currently receiving it
  const traveller = makeMonk({ height: 1.6, elder: true });
  traveller.position.set(2.4, 0, 1.5);
  faceMonk(traveller, WOMAN);
  scene.add(traveller);
  
  const lantern = makeLantern({ height: 1.0 });
  lantern.position.set(2, 0, -4.2);
  scene.add(lantern);
  
  // A single small tube on a cord, under the stall's own front eave — the
  // eave overhangs `over` past the wall (see kit/hut.js), so z=depth/2+0.05
  // sits just inside that overhang. x=0.9 clears both the doorway (|x| <
  // ~0.6 at this width) and the corner post (x ~ 1.3).
  const furin = makeFurin({
  tubes: 1, seed: 31,
  onStrike: (_, force, pos) => audio && audio.chimeStrike({ tube: 0, force, at: pos }),
  });
  furin.group.position.set(0.9, 2.0, 1.1);
  stall.add(furin.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...road.keepout(24, 1.3),
  ...branch.keepout(18, 1.1),
  { x: stall.position.x, z: stall.position.z, r: 2.8 },
  { x: WOMAN.x, z: WOMAN.z, r: 1.2 },
  { at: traveller, r: 1.2 },
  { at: lantern, r: 0.9 },
  { at: scale.group, r: 0.7 },
  ],
  grassKeepout: [
  ...road.keepout(26, 1.0),
  ...branch.keepout(18, 0.9),
  { x: stall.position.x, z: stall.position.z, r: 1.8 },
  ],
  });

  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.7, 1.8, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'woman-hit';
  hit.position.set(WOMAN.x, 0.9, WOMAN.z);
  scene.add(hit);
  
  // ---- the moment: ask her ---------------------------------------------
  let camera = null;
  let clock = 0;
  let asked = 0;
  let askedAt = -99;
  
  input.onTap(() => {
  if (!camera) return;
  // the eave chime first, so a tap aimed at it never starts an asking
  const chimeHit = furin.pick(camera, input);
  if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
  if (!input.raycastFirst(camera, [hit])) return;
  if (clock - askedAt < POINT) return;
  askedAt = clock;
  asked++;
  // the same four words, at the same volume, for everybody — a CHIME now, not
  // the knock it shipped with: a knock is a door's voice, and there is no door
  // in the exchange. Identical every asking, of course.
  audio && audio.chimeStrike({ tube: 2, force: 0.55, at: WOMAN });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  furin.setWindLevel(1);      // a steady roadside wind — see k47's furin
  furin.update(dt, simTime);
  const u = askedAt > -99 ? clamp01((clock - askedAt) / POINT) : 1;
  // up quickly, held, and lowered — identical every time
  const lift = (u >= 1) ? 0 : Math.min(1, u / 0.16, (1 - u) / 0.42);
  const e = lift * lift * (3 - 2 * lift);
  if (arm) arm.rotation.z = ARM_REST + 0.30 * e;
  },
  fragment() {
  return {
  asked,
  // whatever the count, the answer is the same size
  lift: arm ? +(arm.rotation.z - ARM_REST).toFixed(4) : 0,
  chimeStrikes: furin.strikes(),
};
      },
      dispose() {},
    };
  },
};
