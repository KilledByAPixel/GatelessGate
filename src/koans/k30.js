import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_PALE, WASH } from '../palette.js';
import {
  composeWorld, makeBuddha, makeBasin, makeWater, makeKoi, makeMonk, faceMonk, makeLantern,
  makeLights, washMaterial,
} from '../kit/index.js';

const ID = 30;

// "What is Buddha?" — "This mind is Buddha."
//
// A still pond with the figure seated on the far bank. There used to be a
// painted reflection of him lying flat on the water; it read as exactly what it
// was, a flat 2D thing lying on the pond, and it is gone — the pond answers
// with koi and ripples, not with a second Buddha.
//
// Case 33 is this scene with the far bank empty. They are meant to be read as
// a pair, so they share a seed, a camera and a pond.
//
// The pond is a RAISED stone basin rather than a hole in the ground: the ground
// plane is unbroken (kit/ground.js), so water sunk into it would simply be
// hidden. `surface` sits far enough below `rim` that a ripple crest cannot slop
// over the stone, and far enough above `floor` that the koi have room to swim.
export const POND = {
  x: 0.6, z: -1.4, size: 6.4,
  inner: 3.24, outer: 3.84, rim: 0.55, floor: 0.02, surface: 0.40,
};
export const BANK = { x: 0.6, z: -5.6 };

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.5, target: [1.15, 0.55, -0.75], heading: 31.5, pitch: 33.5 };
  export default {
  id: ID,
  slug: 'this-mind-is-buddha',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // Used to carry a water bed (water:0.35), but that continuous wash read as
  // surf, and this is still water, so it is gone (see makeWaterBed's comment in
  // synths.js). A tap on the pond still rings a drip.
  ambience: ['wind:0.12', 'music'],
  mood: 'yo',      // "Under blue sky, in bright sunlight"
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  // "Under blue sky, in bright sunlight" — the case names its own
  // weather, so this is the highest sun in the book and the pond
  // takes it nearly flat. Case 33 is the same pond under the
  // opposite light.
  scene.add(makeLights({ sun: { heading: 61, pitch: 66 } }));
  
  // the pond: an OPEN stone basin and a still sheet inside it. It used to be a
  // solid cylinder, whose top cap sealed the water and the fish underneath it —
  // the pond read as a stone platform rather than as water.
  const lip = makeBasin({
  inner: POND.inner, outer: POND.outer, rim: POND.rim, floor: POND.floor,
  color: WASH.stone, segments: 20,
  });
  lip.name = 'lip';
  lip.position.set(POND.x, 0, POND.z);
  scene.add(lip);
  
  // round, to match the stone basin it sits inside — and RED. Only the SHEET
  // takes the accent, not the fish and not the stone: the basin stays stone and
  // the koi stay ink, so the red is the water answering, not the pond dressing
  // up. The urna keeps its dot: the red is knowingly doubled here.
  const water = makeWater({
  shape: 'round', size: POND.size, color: ACCENT_PALE, seed: ID, strike: 0.135, opacity: 0.5,
  });
  water.group.position.set(POND.x, POND.surface, POND.z);
  scene.add(water.group);
  
  // koi under the surface — what turns the pale disc into water. They are
  // wash-toned, not accent (the seal is the red water), and they read as the same
  // pond's life in case 33, which shares this pond.
  const koi = makeKoi({
  count: 4, seed: 30, radius: POND.size * 0.32, color: WASH.mid,
  // sized to the water they are actually in: the tail fin stands taller
  // than the old 0.95 fish was deep, so its dorsal broke the surface
  length: 0.7, depth: 0.19,
  surfaceAt: water.swellAt,
  });
  koi.group.position.set(POND.x, POND.surface, POND.z);
  scene.add(koi.group);
  
  // THE BUDDHA, on the far bank. The stone is a real DAIS now, not a paver: its
  // top (SEAT_TOP) stands above the basin's rim (POND.rim = 0.55), so from the
  // shipped lens he sits clearly over the water line instead of peeking out
  // from behind the stone lip.
  const SEAT_TOP = 0.62;
  const seat = new THREE.Mesh(
  new THREE.CylinderGeometry(1.05, 1.2, SEAT_TOP, 9),
  washMaterial({ color: WASH.stone, flat: true }));
  seat.name = 'seat';
  seat.position.set(BANK.x, SEAT_TOP / 2, BANK.z);
  scene.add(seat);
  
  // The mat that used to lie on the stone is GONE: the seated figure brings its
  // own zabuton now, so an art-directed one under him was a second slab saying
  // the same thing, where the default cushion alone says it. Case 33 still
  // builds one, because THERE the cushion has to exist with nobody on it; it is
  // sized to this zabuton exactly, so the pair still reads as one seat occupied
  // and the same seat empty.
  
  // ordinary monk scale (overnight pass 2), seated on the top of the mat:
  // everything on the dais derives from SEAT_TOP so raising the stone
  // raises the whole stack together
  const buddha = makeBuddha({ height: 1.6 });
  buddha.position.set(BANK.x, SEAT_TOP + 0.05, BANK.z);
  scene.add(buddha);
  
  // the monk who asked, on the near shore
  const daibai = makeMonk({ height: 1.58 });
  daibai.position.set(3.4, 0, 2.2);
  faceMonk(daibai, buddha.position);
  scene.add(daibai);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(-4.2, 0, -2.6);
  scene.add(lantern);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 33,
  groundSeed: 21,
  trees: 4,
  keepout: [
  { x: POND.x, z: POND.z, r: POND.size * 0.62 },
  { x: BANK.x, z: BANK.z, r: 1.8 },
  { at: lantern, r: 0.9 },
  ],
  grassKeepout: [
  { x: POND.x, z: POND.z, r: POND.size * 0.60 },
  { x: BANK.x, z: BANK.z, r: 1.2 },
  ],
  });

  // ---- the moment: touch the water -------------------------------------
  let camera = null;
  let rippled = 0;
  const surface = water.group.children.find((c) => c.name === 'surface');
  
  // brushing the water stirs it — mini-ripples by pointer speed (the
  // water's breeze; see stir in src/kit/water.js). Silent: the drip is the tap's.
  input.onHover(() => {
  if (!camera || !surface) return;
  const hit = input.raycastFirst(camera, [surface]);
  if (!hit) return;
  const local = water.group.worldToLocal(hit.point.clone());
  water.stir(local.x, local.z);
  });

  input.onTap(() => {
  if (!camera || !surface) return;
  const hit = input.raycastFirst(camera, [surface]);
  if (!hit) return;
  const local = water.group.worldToLocal(hit.point.clone());
  water.ripple(local.x, local.z);
  audio && audio.drip({ loud: true, at: hit.point });
  rippled++;
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);
  water.update(dt, simTime);
  koi.update(dt, simTime);
  },
  fragment() {
  return { rippled, ripples: water.rippleCount(), koi: koi.fishCount() };
  },
  dispose() {},
};
  },
};
