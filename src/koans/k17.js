import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makeVeranda, makeMonk, makeLantern, wrapPi, bearing,
  makeLights, washMaterial, makeCylinderChime,
} from '../kit/index.js';

const ID = 17;

// Chu called his attendant three times. Three times Oshin answered. Then Chu
// said he ought to apologize for all the calling — but really Oshin ought to
// apologize to him.
//
// So the diorama is a courtyard with a teacher on one side and an attendant on
// the other, and the interaction is the case itself, played out at your own
// pace: call, and he answers. Call again, and he answers again. After the
// third the two of them bow to each other, which settles nothing, and the
// courtyard goes back to how it was so you can do the whole thing over.

const ANSWER_DELAY = 0.4;      // he is across a courtyard, not beside you
// Radians of lean. The nine degrees this started at is a nod, and at this
// staging distance not a visible one. Two dozen is a bow you can watch two
// figures exchange from across a yard, and still well short of the folding bow
// k32's philosopher makes.
const BOW = 0.42;
const BOW_IN = 1.1, BOW_HOLD = 1.9, BOW_OUT = 1.2;
// THE NOD — a touched thing has to do something, however small. A small forward
// dip at the sash, on the TAP — the same instant-acknowledgment rule as Oshin's
// turn below: the call is his gesture, so his body carries it the moment it is
// made, not when the answer arrives. Added on top of whatever the mutual bow is
// doing, so a call made mid-ceremony can never snap his waist to a smaller
// angle.
const NOD = 0.11;               // radians past wherever his waist already is
const NOD_SPAN = 0.9;           // seconds down and back

// wrapPi/bearing are the kit's now (faceMonk's convention, which chu's
// hand-rolled turn below already used). The local bearing was once aimMonk's
// (atan2(-dz, dx)), so Oshin faced a quarter turn off.

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 9.9, target: [0.6, 1.3, -0.4], heading: 35.5, pitch: 17.8 };
  export default {
  id: ID,
  slug: 'the-three-calls-of-the-emperor-s-teacher',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'cylinder' names the pair hung under the teacher's own veranda — a real
  // teaching porch is exactly where a set of these would hang, at two sizes
  // so they read as a set rather than one repeating note. ONE token for both
  // instances, not two: the honest reason is RATE, not a token-per-object
  // rule (there isn't one — case 29 declares two 'furin' tokens for THREE
  // physical chimes). kit/cylinder.js is tuned for "tens of strikes an hour"
  // per instance from wind alone (its own WIND_LEAN comment); two of them
  // together are nowhere near as busy a voice as 'birds' wheeling overhead
  // or a flag rippling continuously in the breeze, the kind of emitter a
  // second token is actually meant to flag as "busier now."
  ambience: ['wind:0.15', 'call', 'cylinder', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -15, pitch: 39 } }));
  
  // the teacher's veranda, back-left, open onto the courtyard
  const veranda = makeVeranda({ width: 4.2, depth: 3.4, height: 3.0 });
  veranda.position.set(-2.6, 0, -3.6);
  veranda.rotation.y = 0.5;
  scene.add(veranda);
  
  // CHU, seated on the boards — HE is the seal. There was nothing else in the
  // courtyard that wanted to be red (it is two people and a call), so the
  // teacher on the platform takes the accent; deepened, since a whole figure at
  // full accent glares.
  const chu = makeMonk({ height: 1.6, pose: 'sit', elder: true, color: ACCENT_DEEP, bow: true });
  const chuWaist = chu.getObjectByName('waist');
  const CHU_POS = new THREE.Vector3(-1.9, 0.34, -2.7);
  const OSHIN_POS = new THREE.Vector3(3.1, 0, 1.6);
  chu.position.copy(CHU_POS);
  // A SEATED figure's visible front is local +z — the folded sleeves point that
  // way — so aimMonk (which turns local +x) left him reading a quarter turn
  // off, gazing past the yard instead of at the man he is calling — he read as
  // looking off to one side. Turn his lap toward Oshin directly, and bow about
  // x (order YXZ: pitch inside the yaw) so the lean goes the way he faces.
  chu.rotation.order = 'YXZ';
  chu.rotation.y = Math.atan2(OSHIN_POS.x - CHU_POS.x, OSHIN_POS.z - CHU_POS.z);
  // His staff rests on the boards beside him — the kit LAYS a seated
  // elder's staff down now, so the hand-placement that used to live here
  // (which only moved it clear of the hem, still upright) is gone: it
  // would have put the lying shaft back at y = 0, half sunk in the deck.
  scene.add(chu);
  
  // The reed mat that used to lie under him is GONE: the seated figure brings
  // its own zabuton now, and the two were nearly the same size, so stacked they
  // read as one thing doubled: an extra thin slab under the figure, where the
  // default cushion alone says it better.
  
  // OSHIN, across the yard, turned to his own work — the whole point is that
  // he is not already looking
  // `bow: true` gives him the sash hinge without touching his arms — see the
  // update loop, where the roll this used to be is corrected.
  const oshin = makeMonk({ height: 1.58, bow: true });
  const oshinWaist = oshin.getObjectByName('waist');
  oshin.position.copy(OSHIN_POS);
  const AWAY = bearing(OSHIN_POS, { x: 6.5, z: 3.0 });
  const TOWARD = bearing(OSHIN_POS, CHU_POS);
  oshin.rotation.y = AWAY;
  scene.add(oshin);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(0.6, 0, -3.2);
  scene.add(lantern);
  
  // A pair of hanging bronze cylinders under the teacher's own eave, sized
  // differently (0.65 / 0.95) so they answer with two distinct notes
  // rather than one repeated — several of different sizes hung near each
  // other reads as a set, per the kit's own note on the piece. Local to the
  // veranda group, one either side of its centre post (px ~0, +-2.1 at
  // this width), so both stay clear of the timber and square to the porch
  // however the scene is placed.
  const chimeA = makeCylinderChime({
  size: 0.65, seed: 17,
  onStrike: (note, force, pos) => audio && audio.cylinderStrike({ note, force, at: pos }),
  });
  chimeA.group.position.set(-1.1, 2.8, -0.15);
  veranda.add(chimeA.group);
  const chimeB = makeCylinderChime({
  size: 0.95, seed: 173,
  onStrike: (note, force, pos) => audio && audio.cylinderStrike({ note, force, at: pos }),
  });
  chimeB.group.position.set(1.1, 2.8, -0.15);
  veranda.add(chimeB.group);
  const chimes = [chimeA, chimeB];
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  { at: veranda, r: 3.8 },
  { x: OSHIN_POS.x, z: OSHIN_POS.z, r: 1.2 },
  { at: lantern, r: 0.9 },
  { x: 0.4, z: -0.6, r: 2.6 },      // the courtyard between them stays open
  ],
  // Grass is cleared UNDER THE PLATFORM and nowhere else. The courtyard circle
  // above keeps TREES out of the space between the two figures, which is what
  // it is for; the grass list used to carry a copy of it, and with nothing
  // standing there it read as a bald patch in the middle of the meadow. The
  // veranda's own circle is centred on the veranda, not offset forward of it.
  grassKeepout: [
  { x: veranda.position.x+1., z: veranda.position.z+1.5, r: 2.7 }, // nudge it a bit
  ],
  });

  const hit = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.6, 1.5),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'chu-hit';
  hit.position.set(CHU_POS.x, CHU_POS.y + 0.6, CHU_POS.z);
  scene.add(hit);
  
  // ---- the moment: call, and be answered -------------------------------
  let camera = null;
  let clock = 0;
  let calls = 0;
  let pending = -1;          // sim time an answer is due
  let answered = 0;
  let bowAt = -99;
  let nodAt = -99;

  input.onTap(() => {
  if (!camera) return;
  // the pair of cylinders first: probed and returned on before the big
  // call-hit box below ever gets a chance to start a call
  for (const c of chimes) {
  if (c.pick(camera, input)) { c.ring(0.75); return; }
  }
  if (!input.raycastFirst(camera, [hit])) return;
  // the nod is UNGATED on purpose: even a tap the call logic refuses (bow in
  // progress, answer pending) still lands on him, and the body acknowledging
  // the touch is the whole of what the audit asked for
  nodAt = clock;
  if (bowAt > -99 && clock - bowAt < BOW_IN + BOW_HOLD + BOW_OUT) return;  // let it finish
  if (pending >= 0) return;                     // one call at a time
  pending = clock + ANSWER_DELAY - calls*.1;
  calls++;
  audio && audio.knock({ force: 0.8, at: CHU_POS });         // "Oshin."
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  for (const c of chimes) { c.setWindLevel(1); c.update(dt, simTime); }
  const step = Math.max(0, dt || 0);
  
  // the answer, a beat after the call
  if (pending >= 0 && clock >= pending) {
  pending = -1;
  answered++;
  audio && audio.knock({ force: 0.35, at: OSHIN_POS });    // "Yes."
  if (answered >= 3) bowAt = clock;
  }
  
  // He comes round a third of the way at each call, and all the way home
  // again once the bowing is done.
  //
  // ON THE CALL, NOT ON THE ANSWER. This used to advance on `answered`, so
  // nothing moved until ANSWER_DELAY had elapsed and the reply had sounded — a
  // tap, a wait, and only then a turn, which reads as lag. A reader wants to
  // see him turn the instant they touch him, not after the sound has happened.
  // The turn is the acknowledgement and it belongs to the tap; the answer still
  // lands a beat later, on its own clock, and the bow still waits for the third
  // of them to actually arrive.
  const bowU = bowAt > -99 ? (clock - bowAt) : -1;
  const done = bowU > BOW_IN + BOW_HOLD + BOW_OUT;
  const want = done ? AWAY : AWAY + wrapPi(TOWARD - AWAY) * Math.min(1, calls / 3);
  oshin.rotation.y += wrapPi(want - oshin.rotation.y) * (1 - Math.exp(-3.0 * step));
  
  // and then they bow to each other, which settles nothing
  let lean = 0;
  if (bowU >= 0 && !done) {
  if (bowU < BOW_IN) lean = clamp01(bowU / BOW_IN);
  else if (bowU < BOW_IN + BOW_HOLD) lean = 1;
  else lean = 1 - clamp01((bowU - BOW_IN - BOW_HOLD) / BOW_OUT);
  lean = lean * lean * (3 - 2 * lean);
  }
  // Standing: bend at the sash. This was rotation.z on the whole figure,
  // with a comment claiming local +x was his facing — a leftover from
  // before the aimMonk audit. Bodies front +z, so a z-roll listed him
  // sideways while his teacher bowed back correctly on x.
  oshinWaist.rotation.x = BOW * lean;
  // AND HE BENDS AT THE WAIST TOO. This was `chu.rotation.x`, which pitches the
  // whole seated figure about its own origin down at deck level — so his knees
  // and the staff lying beside him swung under the boards. Invisible at the old
  // nine-degree bow, plain at twenty-four: his legs and the staff beside him
  // sank through the boards. makeFigure hinges seated bodies now, so this is
  // the same gesture his student makes, from the same joint. ...plus the tap's
  // own nod, riding on top of the ceremony's lean (its header above): quick
  // down, slower up, gone in under a second
  const nu = clock - nodAt;
  let nod = 0;
  if (nu >= 0 && nu < NOD_SPAN) {
  nod = Math.min(1, nu / 0.25, (NOD_SPAN - nu) / 0.45);
  nod = nod * nod * (3 - 2 * nod);
  }
  if (chuWaist) chuWaist.rotation.x = BOW * 0.7 * lean + NOD * nod;
  if (done) { bowAt = -99; calls = 0; answered = 0; }
  },
  fragment() {
  return {
  calls, answered, bowing: +Math.abs(oshinWaist.rotation.x).toFixed(4),
  chimeStrikes: chimes.reduce((n, c) => n + c.strikes(), 0),
};
      },
      dispose() {},
    };
  },
};
