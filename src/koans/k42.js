import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT_DEEP, wash } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makeBuddha, makeMonk, faceMonk,
  makeLights, washMaterial,
} from '../kit/index.js';

const ID = 42;

// Manjusri — wisest of the bodhisattvas, teacher of seven Buddhas — walks
// round the girl three times, snaps his fingers, carries her to a high heaven,
// and cannot bring her out of samadhi. Then Momyo, a beginner, comes up out of
// the earth, snaps once, and she wakes.
//
// MANJUSRI IS STILL SNAPPING, a metre from her, forever, to nothing. That is
// the whole of what the scene says on its own — the wisest of the bodhisattvas,
// in mid-gesture, being ignored. TOUCH HER and she comes out: she comes round
// first, then lifts off the boards, hangs there tilting slowly, and settles
// back down. The snap that works is not his.
//
// TWO THINGS WERE CUT TO GET HERE, both worth the record:
//
//   1. The waking was a STIR — a six-hundredth of a radian of lean and three
//      centimetres of lift, the honest size of a person coming round, and far
//      too small to be the answer to anything. The floating is not a liberty:
//      Manjusri carries her to a high heaven and it does nothing, and the case
//      is not subtle about her being beyond reach.
//   2. MOMYO, the beginner who came up out of the earth. See the note where he
//      used to be staged.

const WAKE = 1.4;         // seconds for her to come round — head lifting, shoulders opening
// SHE FLOATS. Up, held, and down again — a hover, not a departure: this case
// ends with her out of samadhi and sitting in the same room, so she comes back
// to the floor she left. (Case 41's wisp is the one that leaves; it goes up and
// keeps going, and the difference between the two is the whole difference
// between something being taken away and someone waking up.)
const LIFT = 0.62;        // metres off the boards at the top
const LIFT_IN = 2.2;      // slowly, as if the floor let go rather than she pushed
const LIFT_HOLD = 2.4;    // hovering, tilting a little, before she comes down
const LIFT_OUT = 2.6;     // and slower still coming down
const LIFT_SPAN = LIFT_IN + LIFT_HOLD + LIFT_OUT;
const CALL_SPAN = WAKE + LIFT_SPAN;
// AND SHE TILTS WHILE SHE IS UP THERE. Two slow sines at frequencies that do
// not divide into each other, one per axis, scaled by how high she is — so the
// tilt exists only while she is off the floor and is exactly zero the moment
// she is back on it. Not a wobble and not a spin: a body with nothing under it,
// drifting the way something floating does. (Case 46's mast wobble is the same
// two-axis idea doing a different job — that one is struck and rings down, this
// one is continuous for as long as she hangs there.) Four of them, not two, and
// all at frequencies that do not divide into each other — the pitch and roll
// she tilts on, a slow turn, and a drift up and down inside the hover. Two axes
// at five degrees read as a statue with a wobble; what says HOVERING is that no
// two of the motions ever come back into step, so she never repeats a pose and
// nothing about her looks driven.
const TILT = 0.16;        // radians, about nine degrees at the widest
const TILT_X = 0.55;      // rad/s: the pitch
const TILT_Z = 0.38;      // ...and a slower roll across it
const TURN = 0.13;        // and she turns on the spot, slightly
const TURN_HZ = 0.21;     // slowest of the four — a drift, not a spin
const BOB = 0.055;        // metres of rise and fall inside the hover itself
const BOB_HZ = 0.47;
const TAU = Math.PI * 2;   // the two given in Hz read as Hz

// HER BELL'S PITCH, and this is the knob. Bells in this book are addressed by
// SIZE rather than by frequency (src/audio/synths.js's bellVoice): the
// fundamental is BELL_REF_HZ / size, with BELL_REF_HZ = 110, so a SMALLER
// number is a HIGHER bell. Passed alongside `preset`, it overrides the preset's
// own size and keeps everything else the preset is for — its partial dressing,
// ring length, beam, ping and reverb mix. (`f0` is not the way in here: bell()
// only reads it when no preset is given, so `{ preset, f0 }` silently ignores
// the f0.)
//
//   0.25 -> 440 Hz (A4)      0.38 -> 289 Hz (~D4, the 'hand' preset's own)
//   0.30 -> 367 Hz (~F#4)    0.50 -> 220 Hz (A3)
//   0.35 -> 314 Hz (~D#4)    0.75 -> 147 Hz (~D3)
//
// One caveat worth knowing before dialling: size scales the DECAY too
// (`decay: d * s` in modesAt), which is physically true of real bells — a
// smaller one rings higher AND shorter. There is no pitch-only control, so a
// big move here changes the length of the note as well as its note.
const BELL_SIZE = 0.42;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 0 on the boards, 1 at the top. A pure function of seconds since she began to
// rise, so nothing accumulates and she is exactly back where she sat.
function liftShape(u) {
  if (!(u >= 0) || u >= LIFT_SPAN) return 0;
  if (u < LIFT_IN) return smooth(u / LIFT_IN);
  if (u < LIFT_IN + LIFT_HOLD) return 1;
  return 1 - smooth((u - LIFT_IN - LIFT_HOLD) / LIFT_OUT);
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 8.3, target: [0.8, 1.15, -1.2], heading: 31.5, pitch: 15.5 };
  export default {
  id: ID,
  slug: 'the-girl-comes-out-from-meditation',
  title: TEXT[ID].title,
  accent: ACCENT_DEEP,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'snap', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights({ sun: { heading: 86, pitch: 58 } }));
  
  // the Buddha, back and above, presiding over an argument he has already
  // settled — the same ordinary figure as everyone in it (overnight pass 2);
  // the raised stone and the distance are what set him back and above
  const seat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.95, 0.28, 9),
  washMaterial({ color: wash(0.32), flat: true }));
  seat.name = 'seat';
  seat.position.set(0.5, 0.14, -3.3);
  scene.add(seat);
  
  const buddha = makeBuddha({ height: 1.6 });
  buddha.position.set(0.5, 0.28, -3.3);
  scene.add(buddha);
  
  // THE GIRL, unmoved, in the middle of the floor. She is the seal: the one
  // figure in the book rendered in the accent, because she is the only thing
  // in this case that nobody can shift.
  const GIRL = new THREE.Vector3(0.85, 0, -1.15);
  const girl = makeMonk({ height: 1.24, pose: 'sit', hat: false, color: ACCENT_DEEP });
  girl.position.copy(GIRL);
  faceMonk(girl, buddha.position);
  scene.add(girl);
  // the yaw faceMonk just gave her — the hover's turn is added to this, never
  // written over it, or she would swing round to face north as she lifted off
  const GIRL_YAW = girl.rotation.y;
  
  // MANJUSRI, standing over her with his hand up, having just snapped it
  const manjusri = makeMonk({ height: 1.72, pose: 'raise' });
  manjusri.position.set(-0.55, 0, -0.25);
  faceMonk(manjusri, GIRL);
  scene.add(manjusri);
  
  // (A shishi-odoshi stood at the garden's edge for a while — k7's, silent,
  // keeping a different yard's time. It's gone: its tip landed inside the
  // floor's own big hit box, so touching the one moving prop in the scene made
  // a monk rise out of the earth — an answer to a question nobody was asking.)
  
  // MOMYO IS NOT STAGED. The beginner who comes up out of the earth was here —
  // posed under the floor from the start, rising through it when you touched
  // the boards — and he did not read as anything at all: a second person coming
  // up out of the ground, unexplained, in a scene that wants only the girl.
  //
  // Which is fair, and the reason is in the staging rather than the reading. A
  // figure surfacing through a floor has no lead-up and no explanation in the
  // picture: a monk simply is not there, and then is, in a scene otherwise made
  // of people standing still. Worse, the target for it was the FLOOR — a big
  // invisible box that also covers the ground in front of the Buddha, so a
  // reader aiming at the seated Buddha got a stranger out of the earth instead
  // ("I don't know what's going on when you click on Buddha"). It was the one
  // page in the book where a tap produced a new person.
  //
  // What survives is the half that was always the point. Manjusri cannot move
  // her; the case's own answer is that she comes out for a beginner and not for
  // the wisest of the bodhisattvas. Now SHE is the only thing that answers, and
  // she answers the reader.

  const world = composeWorld(scene, {
  view: CAM,
  seed: 302,
  groundSeed: 21,
  trees: 8,
  keepout: [
  { x: 0.5, z: -3.3, r: 2.0 },
  { x: GIRL.x, z: GIRL.z, r: 1.4 },
  { at: manjusri, r: 1.2 },
  ],
  // the floor of the assembly hall is swept
  grassKeepout: [{ x: 0.8, z: -1.8, r: 2.4 }],
  forests : [
    { center: [-0, 0, -37], spread: 13, count: 55 },
    { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  mountains : [
    { count: 8, distance: 62, arcSpan: 3.6, color: wash(0.16), hScale: 0.65 },   // farthest band
    { count: 5, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.55 },
  ]
  });

  const girlHit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.62, 0.62, 1.5, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  girlHit.name = 'girl-hit';
  girlHit.position.set(GIRL.x, 0.6, GIRL.z);
  scene.add(girlHit);

  // (the floor's own big hit box is gone with the beginner it called — it
  // reached across the ground in front of the Buddha, which is how a tap aimed
  // at HIM produced a stranger out of the earth)

  // ---- the moment: she comes out ----------------------------------------
  let camera = null;
  let clock = 0;
  let calls = 0;
  let calledAt = -99;
  // the RAISED sleeve, not the hanging one: pose 'raise' swings it to
  // PI - 0.34, while the resting sleeve sits at a mere -0.28, so both are
  // non-zero and only the magnitude tells them apart
  const manjusriArm = manjusri.children
  .filter((c) => c.name === 'arm')
  .find((c) => Math.abs(c.rotation.z) > 1);
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, [girlHit])) return;
  // let her finish the one she is already doing
  if (clock - calledAt < CALL_SPAN) return;
  touched && touched();
  calledAt = clock;
  calls++;
  // A BELL, not a knock. A knock is a hand on wood — the sound of somebody
  // trying — and it was the right note when this was Manjusri's useless snap.
  // What answers now is her coming out of samadhi, which is the one thing in
  // the case that actually happens, and a struck bell is what the book uses
  // when something turns over.
  audio && audio.bell({ preset: 'hand', size: BELL_SIZE, gain: 0.38, at: GIRL });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  
  // Manjusri keeps snapping, forever, to no effect
  if (manjusriArm) manjusriArm.rotation.x = 0.22 + Math.sin(clock * 1.6) * 0.06;
  
  // EVERYTHING RIDES `up`, and that is the whole of the fix. There used to be a
  // separate waking term on its own clock — a small lean that came in over WAKE
  // seconds before the lift began — and it snapped, twice over — her rotation
  // snapped before she began to float, when she should simply start floating.
  //
  // Both faults were the same missing guard. Before any touch, `calledAt`
  // is -99, so `clock - calledAt` is enormous: the wake curve read as
  // FINISHED rather than as not started, and she sat at its full -0.06 lean
  // for the life of the page. The first touch reset that clock, so the lean
  // fell to zero in one frame — a snap INTO the rest pose, at the moment
  // she was asked to move. Then the lift waited out WAKE before starting.
  //
  // Scaled by `up` there is nothing to guard: liftShape is exactly zero
  // before the touch and exactly zero after the gesture, so every term here
  // is zero when she is sitting, and all of them come in together the
  // instant she leaves the floor.
  const up = liftShape(clock - calledAt);
  const t = clock - calledAt;
  girl.position.y = GIRL.y + LIFT * up + BOB * up * Math.sin(t * BOB_HZ * TAU);
  girl.rotation.x = TILT * up * Math.sin(t * TILT_X);
  // the waking lean is part of the same motion now, not a beat before it
  girl.rotation.z = up * (-0.06 + TILT * Math.sin(t * TILT_Z + 1.1));
  // ...and she turns on the spot. Added to the yaw faceMonk gave her rather
  // than replacing it, or she would swing round to face north the moment she
  // left the floor.
  girl.rotation.y = GIRL_YAW + TURN * up * Math.sin(t * TURN_HZ * TAU + 0.6);
  },
  fragment() {
  return {
  calls,
  woken: +smooth(clamp01((clock - calledAt) / WAKE)).toFixed(3),
  // 0 on the boards, 1 at the top of the hover
  afloat: +liftShape(clock - calledAt - WAKE).toFixed(3),
  tilt: +Math.hypot(girl.rotation.x, girl.rotation.z).toFixed(4),
};
      },
      dispose() {},
    };
  },
};
