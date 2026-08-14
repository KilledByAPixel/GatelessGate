import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeGate, makeLantern, makeMonk, faceMonk, plantRock,
  makeLights, washMaterial, makeFurin, tapMeshes,
} from '../kit/index.js';

const ID = 15;

// Tozan answers every question with a fact — which village, which temple, which
// date — and Ummon tells him he has earned three blows with a stick, but that
// today he is forgiven. The blows are the most famous thing in the case and
// they never land.
//
// So the diorama is the gate at evening with Tozan bowing in it, and the
// interaction is the beating: touch the gate and three strikes sound, spaced
// out, on nothing at all. The stick is the only vermillion thing in the scene.
//
// THE STICK MOVES NOW — a planted staff tipping forward and back once per blow,
// reversing the original staging note that it never would. What is kept from
// that note is the important half: the blows still land on NOTHING — the staff
// tips at the empty air between the two of them, no strike reaches anybody, and
// the knocks stay deliberately unplaced.

const BLOWS = 3;
const BLOW_GAP = 0.5;
// Radians at the waist. Deeper than a nod — he is bowing to the master who has
// just told him he has earned a beating — and held, not animated: the movement
// in this case is the three blows, and they land on nothing.
const BOW = 0.55;
// ...held, EXCEPT when the reader touches him. The held bow deepens by DIP and
// comes back up: the one figure the reader can reach answers by bowing further,
// which is the most Tozan gesture there is.
const DIP = 0.22;            // radians past the held BOW, at the same waist
const DIP_SPAN = 2.4;        // seconds down and up, and the retap floor

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.1, target: [1.25, 1.3, -0.8], heading: -4, pitch: 13.5 };
  export default {
  id: ID,
  slug: 'tozan-s-three-blows',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'furin' names the three tubes hung under Ummon's own lintel — a temple
  // gate at evening is exactly where a real fūrin would hang, and this case
  // already gives the gate a voice ('gate').
  //
  // THE HISTORY IS WORTH KEEPING, because this has now gone in both directions.
  // It started as a FIVE-TUBE cluster; code review called that "the busiest new
  // voice in the book, on a case whose whole point is three blows that never
  // land" — right, and it came down to a single tube, then back up to THREE
  // SINGLES, one per blow. That is not a reversal of the review, it is the
  // distinction the review was actually about. A ring is a CHORD — one clapper,
  // five tubes, a chatter that reads as an ANSWER to the beating. Three
  // separate chimes are three separate single tones, and they rhyme with the
  // three blows rather than competing with them.
  //
  // MEASURED, so the trade is on the record rather than assumed: the ring
  // this case rejected sounded 1567 times an hour, one note every 2.3s.
  // Three singles sound 749, one every 4.8s — half as busy as the thing that
  // was too busy, and each note isolated instead of part of a cluster. Wind
  // level is NOT the lever here: the chime's weather barely tracks it (250/hr
  // at windLevel 1 down to only 142 at 0.3), so turning the wind down would
  // cost the swing without buying quiet.
  //
  // 'furin' repeated TWICE, k29's own reasoning: emitterCount() sees it and
  // thins the drift layer accordingly (src/audio/music.js), which is exactly
  // what a page that just gained two voices wants.
  ambience: ['wind:0.20:pine', 'gate', 'furin', 'furin', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  // evening: the fog closes in earlier than anywhere else in the book
  scene.fog = new THREE.FogExp2(PAPER, 0.040);
  scene.add(makeLights());
  
  const path = makePath({ from: [3.2, 8.6], to: [-4.4, -25], width: 1.5, seed: ID, groundSeed: 21, wander: 2.7 });
  scene.add(path);
  
  // UMMON'S GATE, straddling the road
  const gate = makeGate({ width: 2.8, height: 3.0 });
  gate.position.set(1.5, 0, -2.2);
  gate.rotation.y = 0.26;
  scene.add(gate);

  plantRock(scene, { x: -2.1, z: -4.9, size: 2.7, sink: 0  });
  plantRock(scene, { x: 4.6, z: -2.9, size: 1.3, sink: 0  });
  
  // TOZAN, in the gateway, bowing — he came back the next day to ask why. He
  // used to bow by rotation.z on the whole figure, which is a ROLL: he listed
  // sideways like a man on a slope, not a man bowing — the same fault k32's
  // philosopher had. pose 'bow' hinges him at the sash instead, and a number
  // sets how far: bodies front local +z, so the waist's turn about x carries
  // the chest forward, along whatever way faceMonk has already turned him.
  const tozan = makeMonk({ height: 1.58, pose: 'bow', bow: BOW });
  tozan.position.set(2.5, 0, 0.9);
  faceMonk(tozan, { x: -1.4, z: -1.8 });
  scene.add(tozan);
  const tozanWaist = tozan.getObjectByName('waist');
  const tozanTargets = tapMeshes(tozan);
  
  // UMMON, beyond the gate, holding the stick he is not going to use
  const ummon = makeMonk({ height: 1.68, elder: true });
  ummon.position.set(0.5, 0, -1.1);
  faceMonk(ummon, tozan.position);
  const stick = ummon.getObjectByName('staff');
  if (stick) stick.material = washMaterial({ color: ACCENT, flat: true });
  scene.add(ummon);
  
  const lantern = makeLantern({ height: 1.2 });
  lantern.position.set(2.9, 0, -2.0);
  scene.add(lantern);
  
  // THREE fūrin, three sizes, hung under the gate's own kasagi — one for
  // each of Ummon's three blows (see the ambience note above for why three
  // singles are not the five-tube ring this case turned down).
  //
  // POSITIONS. The kasagi's flat centre span is flush underside for
  // |x| < width*0.364 — see k29's comment for the derivation, which is the
  // same lintel geometry. At this gate's width (2.8) that is |x| < 1.02.
  // Spread across it at 0.68 apart: the swing cap displaces a chime about
  // 0.26 sideways at this hang depth, so two neighbours swung toward each
  // other close by 0.53, and 0.68 clears that with their own half-widths
  // and real margin. tests/k15.test.js re-derives it from the LIVE
  // SWING.maxOmegaFrac rather than trusting this paragraph.
  const CHIME_X = [-0.68, 0, 0.68];
  // SIZES, and therefore notes — the case asks for a size and kit/furin.js's
  // noteForSize decides the pitch, the rule everywhere else in the book.
  // This case used to override it, reporting a flat `tube: 2` whatever it
  // had built. 0.15 is the size that lands back on exactly that note, so
  // the voice already heard here is kept and the other two are hung either
  // side of it: -2, 2, 6.
  const CHIME_SIZES = [0.20, 0.15, 0.11];
  // Absolute cords, solved so the three BELLS hang on one line (bottoms at
  // 0.30 below the lintel, within 0.001 of each other) rather than the
  // paper below them, which is meant to vary — k29's own reasoning. Deepest
  // total reach is 0.490 including the tanzaku, against the nuki's top face
  // 0.59 below the hang point (this gate is 3.0 high, so its cross-tie sits
  // at 2.34 with a 0.07 half-thickness). Rest is the worst case: swinging
  // only ever shortens the drop.
  const CHIME_CORD = [0.094, 0.146, 0.187];
  const chimes = CHIME_X.map((x, i) => {
  const f = makeFurin({
  tubes: 1,
  size: CHIME_SIZES[i],
  cordLength: CHIME_CORD[i],
  seed: 150 + i,
  phase: 1.1 + 2.3 * i,        // own clock, so the three never sway or strike in step
  onStrike: (note, force, pos) => audio && audio.chimeStrike({ tube: note, force, at: pos }),
  });
  f.group.position.set(x, 3.0, 0);
  gate.add(f.group);
  return f;
  });
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 5,
  keepout: [
  ...path.keepout(24, 1.3),
  { at: gate, r: 2.4 },
  { at: tozan, r: 1.1 },
  { at: ummon, r: 1.1 },
  { at: lantern, r: 0.9 },
  ],
  grassKeepout: [
  ...path.keepout(26, 0.95),
  { at: gate, r: 1.2 },
  ],
  });

  const hit = new THREE.Mesh(
  new THREE.BoxGeometry(3.4, 3.2, 0.9),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'gate-hit';
  hit.position.set(0.5, 1.6, -1.2);
  hit.rotation.y = -0.16;
  scene.add(hit);
  
  // ---- the moment: three blows, forgiven -------------------------------
  let camera = null;
  let clock = 0;
  let struck = 0;              // blows delivered in the current beating
  let startedAt = -99;
  let beatings = 0;
  let dippedAt = -99;
  let dips = 0;
  let blewAt = -99;            // when the last blow landed — drives the staff
  // The staff plants at Ummon's side with its base at the ground (figure.js),
  // so a turn about x tips it about that base, top swinging toward his local
  // +z — the way he faces, which faceMonk aimed at Tozan. It rises ahead of
  // each knock and comes down ON it: the knock is the landing.
  const STAFF_TIP = 0.16;      // radians at the base, forward
  const STAFF_SPAN = 0.45;     // seconds up and down again — inside BLOW_GAP

  input.onTap(() => {
  if (!camera) return;
  // the chimes first: their own hit drums sit inside the gate's big
  // forgiving hit-box, so they have to be probed and returned on before
  // that box ever gets a chance to start a beating instead. Returning on
  // the FIRST hit also stops one tap ringing two of them.
  for (const c of chimes) {
  const chimeHit = c.pick(camera, input);
  if (chimeHit) { c.ring(0.75, chimeHit.tube); return; }
  }
  // then Tozan himself, before the gate's box gets him: touch the man and
  // he bows deeper — a robe rustle, not a knock; nothing strikes him
  if (input.raycastFirst(camera, tozanTargets)) {
  if (clock - dippedAt >= DIP_SPAN) {
  dippedAt = clock;
  dips++;
  audio && audio.cloth({ force: 0.6, at: tozan.position });
  }
  return;
  }
  if (!input.raycastFirst(camera, [hit])) return;
  if (startedAt > -99 && struck < BLOWS) return;      // let the three finish
  startedAt = clock;
  struck = 0;
  beatings++;
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  for (const c of chimes) {
  c.setWindLevel(1);        // a steady evening wind — see k47's furin
  c.update(dt, simTime);
  }
  if (startedAt > -99 && struck < BLOWS && clock - startedAt >= struck * BLOW_GAP) {
  struck++;
  blewAt = clock;
  // wood on wood, out of the empty air. The case's whole point is that
  // these three blows land on NOTHING, so giving them a position would
  // put a source exactly where the text insists there isn't one. Left
  // unplaced on purpose — the staff tips at empty air (below), and the
  // sound stays sourceless.
  audio && audio.knock({ force: 0.85 });
  }
  // the staff comes down with each blow and lifts back: tip about its own
  // planted base, quick down on the knock, easier return
  if (stick) {
  const bu = clock - blewAt;
  let tip = 0;
  if (bu >= 0 && bu < STAFF_SPAN) {
  tip = Math.min(1, bu / 0.12, (STAFF_SPAN - bu) / 0.28);
  tip = tip * tip * (3 - 2 * tip);
  }
  stick.rotation.x = STAFF_TIP * tip;
  }
  // the deepened bow: down quickly, up slowly, from the held BOW — the
  // waist is reassigned every frame so idle is exactly the built pose
  const du = clock - dippedAt;
  let lean = 0;
  if (du >= 0 && du < DIP_SPAN) {
  lean = Math.min(1, du / 0.5, (DIP_SPAN - du) / 1.1);
  lean = lean * lean * (3 - 2 * lean);
  }
  tozanWaist.rotation.x = BOW + DIP * lean;
  },
  fragment() {
  // summed, not per-chime — a debug-panel fragment is finite numbers and
  // booleans only (tests/staging.test.js), no arrays
  return {
  beatings, struck, forgiven: struck >= BLOWS,
  chimeStrikes: chimes.reduce((n, c) => n + c.strikes(), 0),
  dips, lean: +tozanWaist.rotation.x.toFixed(4),
};
      },
      dispose() {},
    };
  },
};
