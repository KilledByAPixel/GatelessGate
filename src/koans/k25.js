import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, faceMonk, makeAssembly, makeLights, makeMonk,
  makeScreen, makeVeranda, mergeSimple, washMaterial,
} from '../kit/index.js';

const ID = 25;

// Kyozan DREAMS that he goes to Maitreya's Pure Land, finds himself in the
// third seat, is announced as the one who will preach, stands up, hits the
// gavel and says the truth is above words and thought — and then Mumon asks
// whether he preached or not.
//
// It is the only case in the book that is not happening. So this is the only
// diorama built on dream rules: the fog closes to nearly nothing, the ground
// is a pale suggestion under a floor that is standing in cloud, and the whole
// hall breathes very slightly out of true — a rocking too slow to catch in the
// act but never quite still.
//
// The gavel works. Striking it deepens the wobble, which is what happens when
// you assert something inside a dream.

// the gavel hangs off the dream's own rocking group (`hall`), so its local
// position is not its world position — reused rather than allocated per tap
const scratchPos = new THREE.Vector3();

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11, target: [0.2, 1.3, -0.95], heading: 31.5, pitch: 28.5 };
  export default {
  id: ID,
  slug: 'preaching-from-the-third-seat',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'gavel', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  // the dream's weather: everything past the hall is already gone
  scene.fog = new THREE.FogExp2(PAPER, 0.060);
  scene.add(makeLights({ sun: { heading: -108, pitch: 55 } }));
  
  // EVERYTHING THAT IS DREAMING — one group, rocked as a whole
  const hall = new THREE.Group();
  hall.name = 'dream';
  scene.add(hall);
  
  // the cloud the floor is standing on: flat pale discs, no edges anywhere
  const cloud = new THREE.Group();
  cloud.name = 'cloud';
  for (let i = 0; i < 5; i++) {
  const r = 3.4 + i * 0.9;
  const disc = new THREE.Mesh(
  new THREE.CylinderGeometry(r, r * 0.94, 0.10, 13),
  washMaterial({ color: wash(0.09 - i * 0.012), flat: true }));
  disc.name = 'cloud-disc';
  disc.position.set((i % 2 ? 0.5 : -0.4) * i * 0.4, -0.18 - i * 0.12, -1.4 + i * 0.3);
  cloud.add(disc);
  }
  hall.add(cloud);
  
  // The hall hovers HOVER above the terrain — it is a dream — but the rule for
  // floating platforms holds even here: a deck standing on daylight reads as a
  // bug, so the veranda's own under-frame (`legs`) carries it to the ground and
  // the dream floats on carpentry instead of air.
  const HOVER = 0.32;
  const veranda = makeVeranda({ width: 5.4, depth: 4.4, height: 3.4, legs: HOVER });
  veranda.position.set(0.2, HOVER, -4.0);
  hall.add(veranda);
  
  // Everyone in the hall stands ON the boards. The deck's top surface is HOVER
  // + the deck thickness (0.34, the veranda default) — the seats and monks used
  // to be placed for a far thinner deck and sat 0.14 INSIDE the boards, which
  // swallowed every seated robe's base and made the figures read as squat
  // blobs.
  const DECK_TOP = HOVER + 0.34;
  
  // A bamboo screen (k26's, in plain ink — there it is the red thing
  // itself) closing the back of the dream hall. Maitreya's hall is FURNISHED —
  // that is what makes the dream feel like a place someone keeps, rather than
  // a stage set.
  //
  // FIXED, not hanging. k26's screen is a sudare on a roller with pull cords,
  // which needs a lintel over it; this is an open deck, so the roller and its
  // cords hung in daylight holding nothing up.
  //
  // AND IT FILLS THE BAY EXACTLY, read off the veranda rather than typed. The
  // first pass put it 1.3 units behind the post line, past the back edge of
  // the deck over open ground, 3.0 wide in a 5.4 bay and 2.3 tall in a 2.86
  // one — three separate numbers guessed at, all wrong, which is what
  // veranda.opening now exists to stop. No stiles: the veranda's own corner
  // posts stand exactly on this line and are the frame already.
  const bay = veranda.opening;
  const screen = makeScreen({
    width: bay.width, height: bay.height, slats: 11, seed: 25,
    fixed: true, stiles: false,
  });
  screen.group.position.set(
    veranda.position.x + 0,
    veranda.position.y + bay.y,
    veranda.position.z + bay.z,
  );
  hall.add(screen.group);
  
  // the seats: three low platforms, and Kyozan standing at the third
  const seats = [];
  for (let i = 0; i < 3; i++) {
  const seat = new THREE.Mesh(
  new THREE.BoxGeometry(1.05, 0.20, 1.05),
  washMaterial({ color: i === 2 ? WASH.stone : wash(0.26), flat: true }));
  seat.name = 'seat';
  seat.position.set(-1.9 + i * 1.75, DECK_TOP + 0.10, -2.2);
  hall.add(seat);
  seats.push(seat);
  }
  const SEAT_TOP = DECK_TOP + 0.20;
  
  const kyozan = makeMonk({ height: 1.62, pose: 'raise' });
  kyozan.position.set(seats[2].position.x, SEAT_TOP, seats[2].position.z);
  faceMonk(kyozan, { x: 1.0, z: 4.0 });
  hall.add(kyozan);
  
  // the two who are already seated — book-normal height, not the 1.42 they
  // were first authored at (the shortest ordinary sitters in the book)
  for (let i = 0; i < 2; i++) {
  const sitter = makeMonk({ height: 1.54, pose: 'sit' });
  sitter.position.set(seats[i].position.x, SEAT_TOP, seats[i].position.z);
  faceMonk(sitter, { x: 0.6, z: 4.0 });
  hall.add(sitter);
  }
  
  // THE GAVEL and its block, on a stand before the third seat — the seal,
  // and the one thing in the dream you can act on
  const stand = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.42, 0.4),
  washMaterial({ color: WASH.dark, flat: true }));
  stand.name = 'stand';
  stand.position.set(seats[2].position.x, DECK_TOP + 0.21, seats[2].position.z + 1.15);
  hall.add(stand);
  
  // The gavel is an actual MALLET now — a hammer, not a block: a fat head lying
  // across the stand and a slim tapered handle out of its side, resting at a
  // hand-laid angle with its butt overhanging the block's edge. One accent
  // material, so the two parts merge into a single mesh and the strike bounce
  // still moves the whole tool through the group.
  const gavel = new THREE.Group();
  gavel.name = 'gavel';
  gavel.position.copy(stand.position);
  gavel.position.y += 0.24;
  // The handle (local +z) faces KYOZAN at the third seat, not the audience — it
  // is his hand that takes it up. Derived from where he actually stands, plus a
  // few degrees off square so it still reads hand-laid.
  gavel.rotation.y = Math.atan2(
  kyozan.position.x - stand.position.x,
  kyozan.position.z - stand.position.z) + 0.15;
  const headGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.21, 8);
  headGeo.rotateZ(Math.PI / 2);            // the head lies on its side
  const handleGeo = new THREE.CylinderGeometry(0.020, 0.026, 0.34, 7);
  handleGeo.translate(0, 0.17, 0);         // hinge at the head end
  handleGeo.rotateX(Math.PI / 2 + 0.03);   // out along +z, butt settling to the wood
  const mallet = new THREE.Mesh(
  mergeSimple([headGeo, handleGeo]),
  washMaterial({ color: ACCENT, flat: true }));
  mallet.name = 'gavel-head';
  gavel.add(mallet);
  hall.add(gavel);
  
  // The audience, on the ground where the floor stops. The whole staging area
  // sits inside groundHeight's flat radius, so the terrain under the arc is
  // level at y = 0 — the crowd sits AT zero, not floated 0.34 up on an
  // imaginary extension of the deck, which left them floating. The dream's
  // rocking still carries them, but its amplitude is millimetres; it never
  // lifts a hem visibly off the grass.
  const assembly = makeAssembly({
  count: 8, radius: 4.6, center: [-.7, -2.5], facing: [0.2, -3.0], spread: 1.3, seed: ID,
  });
  hall.add(assembly);
  
  // The surrounding world hangs off the SCENE, not the dream — deliberately.
  // The tuft meadow derives each blade's variant, mirror, stiffness and lean
  // from its live world XZ through a chaotic hash, which only holds still while
  // a tuft never moves. Rocking the grass (it used to ride on `hall`) re-rolled
  // every one of those hashes each frame and the meadow visibly re-randomised —
  // the meadow appeared to regenerate every frame. So the dream floats and
  // rocks; the ground it floats above stays put.
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 2,
  treeRing: [17, 24],
  rocks: 4,
  bushes: 3,
  keepout: [{ x: 0.2, z: -2.0, r: 8.0 }],
  grassKeepout: [{ x: -.3, z: -2.0, r: 4.4 }],
  });

  const hit = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.7, 0.8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'gavel-hit';
  hit.position.copy(gavel.position);
  hall.add(hit);
  
  // ---- the moment: strike the gavel, inside a dream ---------------------
  // The dream rocks very slightly, and ONLY on its own — striking the gavel
  // never touches the world. An earlier cut grew the wobble on every click,
  // which read as the camera being knocked out of place the more you tapped
  // the more you tapped. The strike is a sound and a small LOCAL bounce of the
  // gavel now; the world is left alone.
  const BASE = 0.006;        // the faint rocking that never stops, unchanging
  const GAVEL_Y = stand.position.y + 0.24;
  let camera = null;
  let clock = 0;
  let strikes = 0;
  let struckAt = -99;
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, [hit])) return;
  struckAt = clock;
  strikes++;
  audio && audio.knock({ force: 1, at: gavel.getWorldPosition(scratchPos) });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  
  // constant, click-independent dream drift — nothing here reads `strikes`
  hall.rotation.z = Math.sin(clock * 0.31) * BASE;
  hall.rotation.x = Math.sin(clock * 0.23 + 1.1) * BASE * 0.8;
  hall.position.y = Math.sin(clock * 0.19 + 2.2) * BASE * 3.0;
  
  // the gavel gives a small LOCAL bounce when struck — it moves, the
  // world does not
  const t = clock - struckAt;
  const bounce = t >= 0 && t < 1 ? 0.12 * Math.exp(-t / 0.18) * Math.abs(Math.sin(t * 22)) : 0;
  gavel.position.y = GAVEL_Y + bounce;
  },
  fragment() {
  return {
  strikes,
  rock: +hall.rotation.z.toFixed(5),
  bounce: +(gavel.position.y - GAVEL_Y).toFixed(5),
};
      },
      dispose() {},
    };
  },
};
