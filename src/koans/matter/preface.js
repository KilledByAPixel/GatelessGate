import * as THREE from '../../../lib/three.module.js';
import MATTER from '../text/matter.js';
import { PAPER, WASH, wash, ACCENT_DEEP } from '../../palette.js';
import {
  composeWorld, faceMonk, groundHeight, makeBell, makeFlag,
  makeLantern, makeLights, makeMonk, makePath, plantTree, tapMeshes,
} from '../../kit/index.js';

// Mumon's own preface, which is where the four lines the book is named after
// actually come from. Shaped like a koan module so it travels the same rails —
// the nav queue, the ink transitions, the scroll — and differs only in having
// no number, which is what turns off the seal.
//
// ITS OWN SCENE NOW, not the hub with the gate removed. The picture is the
// verse itself:
//
//   THE FORK. "The great path has no gate, thousands of roads enter it" — so
//   the road the reader arrives on SPLITS, a Y opening in the middle distance,
//   both arms running out into haze. No gate stands anywhere in the scene,
//   which is the other half of the same verse and was the one good idea of the
//   old staging, kept.
//
//   THE BELL AND THE FLAG, either side of the split — the first page of the
//   book, so it carries something to touch right away: the bonshō rings like
//   case 16's, the flag ruffles
//   under the pointer like case 29's. Both behaviors live in their kit pieces;
//   this page only hangs them.
//
// THE MONK IS THE RED THING. The gate used to carry this page's warm mark and
// the gate is gone; now it is the figure standing at the choosing — which is
// the right reading for a preface: the one red thing on the book's first page
// is the person about to walk it. ACCENT_DEEP, not full ACCENT — the house rule
// for a person-sized mass (k42's girl is the precedent). The bell and flag stay
// ink: case 16 owns the red bonshō and case 29 the red flag, and one warm mark
// per page is the book's law. Staged by eye from here — the numbers below are a
// first placement.
const page = MATTER.preface;
const SEEDS = { seed: 23, groundSeed: 41, pathSeed: 61 };

// A THINNER HORIZON, kept from the gateless staging: the title screen's peak
// band is a WALL — every road bearing ends in rock (measured; no seed clears
// it). Fewer peaks, further off, paler, so both arms of the fork run out into
// haze instead of into a mountain, which is the right picture for "thousands
// of roads enter it."
const MOUNTAINS = [
  { count: 7, distance: 70, arcCenter: .2, arcSpan: 4.4, color: wash(0.12), hScale: 0.55 },
  { count: 3, distance: 48, arcCenter: -.2, arcSpan: 3.6, color: wash(0.21), hScale: 0.55 },
];

// Where the road splits. The approach ends here square (taper 0) and the two
// arms START a stride and a half before it, their square starts buried under
// the approach's full-width ribbon — that overlap is what makes three ribbons
// read as one road forking rather than three roads meeting. Each arm rides a
// few millimetres higher via its own groundFn, or the overlapped triangles
// z-fight (all three would otherwise sit at exactly ground + 0.03).
const FORK = { x: 0.5, z: -3.2 };

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 13, target: [0.2, 1.2, -3.2], heading: -18.6, pitch: 15.5 };
  export default {
  id: null,
  slug: page.slug,
  title: page.title,
  sections: page.sections,
  labels: page.labels,
  text: page.text,
  accent: undefined,
  // 'bell' so emitterCount sees the bonshō and thins the drift, k16's rule
  ambience: ['wind:0.30', 'bell', 'music'],
  mood: 'in',
  // aimed at the fork — the choice is the subject
  camera: CAM,
  
  build(ctx = {}) {
  const { audio = null, input = null, touched = null } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights());
  
  // ---- the thousand roads, drawn as three ribbons ----------------------
  // the road the reader arrives on, swinging through a real curve on its
  // way to the split
  const approach = makePath({
  from: [2.0, 9.5], via: [-2.0, 3.0], to: [FORK.x-.4, FORK.z+.5],
  width: 1.8, wander: 1.0, taper: 0,
  seed: SEEDS.pathSeed, groundSeed: SEEDS.groundSeed,
  });
  scene.add(approach);
  
  // the two arms. Slightly unequal widths — a fork where both choices are
  // identical is a diagram, not a place — and each carries its own curve
  // away from the other. groundFn lifts: see FORK's comment.
  const lift = (dy) => (x, z) => groundHeight(x, z, { seed: SEEDS.groundSeed }) + dy;
  // (both arms' start points are MEASURED against the approach's sampled
  // centreline near z -1.7/-2.0 — the wander bows the ribbon, so a start
  // placed by eye landed a hand's width outside it and the arm's tip
  // showed as a separate sliver of road)
  const left = makePath({
  from: [-0.1, -1.7], via: [-3.6, -8.0], to: [-11.5, -23.0],
  width: 1.4, wander: 1.1,
  seed: SEEDS.pathSeed + 1, groundSeed: SEEDS.groundSeed, groundFn: lift(0.004),
  });
  scene.add(left);
  const right = makePath({
  from: [0.1, -2.0], via: [4.8, -9.0], to: [9.0, -22.0],
  width: 1.25, wander: 1.1,
  seed: SEEDS.pathSeed + 2, groundSeed: SEEDS.groundSeed, groundFn: lift(0.008),
  });
  scene.add(right);
  
  // ---- the two things worth touching -----------------------------------
  // The bonshō, off the right arm's shoulder, facing the split. Ink-dark
  // bronze, not case 16's red — see the header on accent.
  const bell = makeBell({ height: 1.1, color: WASH.deep, seed: SEEDS.seed });
  bell.group.position.set(3.0, 0, -3.0);
  bell.group.rotation.y = -1.1;
  scene.add(bell.group);
  
  // the flag across from it, off the left arm — the wind made visible
  const flag = makeFlag({ seed: SEEDS.seed, color: WASH.dark });
  flag.group.position.set(-3.5, 0, -5.2);
  flag.group.rotation.y = 0.5;
  scene.add(flag.group);
  
  // and the one who has arrived at the choosing, still on the single road —
  // the page's one red thing (see the header)
  const mp = approach.sample(0.72);
  const monk = makeMonk({ height: 1.6, color: ACCENT_DEEP });
  monk.position.set(mp.x, 0, mp.z);
  faceMonk(monk, { x: FORK.x, z: FORK.z });
  scene.add(monk);

  plantTree(scene, { x:.2, z: -11.4, height: 3.4 });
  
  // and a stone lantern at the road's edge opposite — the pair of verticals
  // that make the spot a PLACE on the road rather than a stretch of it
  const LANTERN = { x: -.1, z: -3.5 };
  const lantern = makeLantern({ height: 1.15 });
  lantern.position.set(LANTERN.x, 0, LANTERN.z);
  scene.add(lantern);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: SEEDS.seed,
  groundSeed: SEEDS.groundSeed,
  trees: 9,
  mountains: MOUNTAINS,
  keepout: [
  ...approach.keepout(16, 1.2),
  ...left.keepout(16, 1.1),
  ...right.keepout(16, 1.1),
  { at: bell.group, r: 1.7 },
  { at: flag.group, r: 1.0 },
  { at: monk, r: 1.1 },
  // the lens corridor: the home eye sits out near (7.0, 8.6) looking at
  // the fork, and nothing may grow into that line
  { x: 4.6, z: 3.6, r: 4.2 },
  ],
  grassKeepout: [
  ...approach.keepout(18, 0.95),
  ...left.keepout(16, 0.8),
  ...right.keepout(16, 0.75),
  { at: bell.group, r: 1.0 },
  { at: flag.group, r: 0.4 },
  ],
  });

  // ---- the first touches in the book -----------------------------------
  // k16's bell idiom (strike + temple preset + the 0.5s held-pointer floor)
  // and k29's flag idiom (hover ruffles; a tap is a firmer brush of the
  // same cloth). Nothing is scored; these are the book saying "you can
  // touch things" on its first page.
  let camera = null;
  let clock = 0;
  let strikes = 0;
  let ruffles = 0;
  let greets = 0;      // the monk answering, which is this page's own find
  let lastRing = -99;
  
  input && input.onHover(() => {
  if (!camera) return;
  const hit = input.raycastFirst(camera, [flag.mesh]);
  if (hit) {
  const local = flag.mesh.worldToLocal(hit.point.clone());
  flag.hoverAt(local.x, local.y);
  }
  });
  // one ring, whoever asks for it — the bonshō directly, or the monk (below)
  const ring = () => {
  if (clock - lastRing < 0.5) return;
  lastRing = clock;
  bell.strike();
  strikes++;
  audio && audio.bell({ preset: 'temple', at: bell.group.position });
  };
  const monkTargets = tapMeshes(monk);
  // THE MONK ANSWERS FOR HIMSELF. He used to ring the bonshō — touching him
  // acted THROUGH him, on the reading that the bell is what sounds whoever asks
  // — and the cost of that was a page with three touchable things and two
  // sounds between them: the reader could not tell from the answer which thing
  // they had reached. He gets his own voice now, a chime at the man rather than
  // a bell across the road, and the bonshō is left to be the bonshō.
  //
  // He is also the page's one FIND: the mark in the Contents is his and not the
  // bell's, which is the same ruling in the other direction — the bell and the
  // flag are the road he is standing on.
  let lastGreet = -99;
  const greet = (at) => {
  if (clock - lastGreet < 0.5) return;      // the bell's own floor, for the same reason
  lastGreet = clock;
  greets++;
  touched && touched();
  audio && audio.chimeStrike({ tube: 2, force: 0.5, at });
  };
  input && input.onTap(() => {
  if (!camera) return;
  // the bell rings, and ringing it is all it does
  if (input.raycastFirst(camera, bell.pickTargets())) { ring(); return; }
  const onMonk = input.raycastFirst(camera, monkTargets);
  if (onMonk) { greet(onMonk.point); return; }
  const hit = input.raycastFirst(camera, [flag.mesh]);
  if (hit) {
  const local = flag.mesh.worldToLocal(hit.point.clone());
  flag.hoverAt(local.x, local.y);
  ruffles++;
  audio && audio.cloth({ force: 0.8, at: hit.point });
  }
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  bell.update(dt, simTime);
  flag.update(dt, simTime);
  },
  fragment() {
  return { strikes, ruffles, greets };
  },
  dispose() {},
};
  },
};
