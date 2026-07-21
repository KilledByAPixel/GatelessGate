import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import { makeMonk, aimMonk } from '../kit/monk.js';
import { makeRaisedFinger } from '../kit/finger.js';
import { composeWorld } from '../kit/scenery.js';
import { makePath } from '../kit/path.js';
import { makeHut } from '../kit/hut.js';
import { makeLantern } from '../kit/lantern.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 3;

// WHAT THIS SCENE SHOWS, AND WHAT IT DOES NOT.
//
// The text of case 3 ends with a knife. The diorama does not, and never will:
// both fingers here are whole, there is nothing sharp anywhere in the yard, and
// that is not squeamishness. Gutei's teaching is called finger-Zen — the RAISED
// finger IS the koan and the severed one is only what happened afterwards. So
// this stages the moment the case hangs on: the master holding up one finger,
// unhurried, and a few steps away a small boy doing exactly the same thing.
//
// Two red seals, not one, and that is the whole reason this case gets an
// exception to the one-seal-per-koan rule. A single red fingertip reads as a
// wound. Two identical red fingertips read as a gesture repeated — which is
// precisely what the case is about.

// Both figures present their raised sleeve along this bearing. Aiming them at
// each other was the obvious first staging and it was wrong: the case is not a
// confrontation, it is a copy. Facing the same way, the two silhouettes make the
// same shape at two sizes, which is the picture. It also puts both gestures in
// the screen plane at the home azimuth, so neither arm is foreshortened.
const FACING = 0.55;
const RIGHT = { x: Math.cos(FACING), z: -Math.sin(FACING) };   // where the sleeves point

const GUTEI = { x: -1.35, z: 1.05 };
const SPAN = 2.95;                                             // a few steps away
const BOY = { x: GUTEI.x + RIGHT.x * SPAN, z: GUTEI.z + RIGHT.z * SPAN };
const VISITOR = { x: 2.70, z: -1.40 };                         // he asked the boy
const RESIDENT = { x: -2.80, z: 0.60 };                        // he asked the master
const LANTERN = { x: 3.60, z: -3.40 };
const HALL = { x: 3.40, z: -6.20 };

// ---------------------------------------------------------------------------
// the gesture
// ---------------------------------------------------------------------------

// Where the raised sleeve ends. monk.js builds an arm as a cylinder translated
// so the SHOULDER sits at the arm's local origin, which leaves the wide hem at
// local (0, -sleeveLength, 0). Reading that length back off the geometry's own
// bounding box, rather than re-deriving monk.js's constants here, means the
// finger keeps landing on the hem if those proportions are ever retuned.
function sleeveHem(arm) {
  const geo = arm.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const len = -geo.boundingBox.min.y;
  arm.updateMatrix();
  return {
    point: new THREE.Vector3(0, -len, 0).applyMatrix4(arm.matrix),   // in monk space
    along: new THREE.Vector3(0, -1, 0).applyQuaternion(arm.quaternion), // shoulder -> hem
    radius: geo.boundingBox.max.x,
  };
}

// pose:'point' lifts the local +x sleeve; the other one hangs. Pick by which hem
// ends up higher rather than by side, so nothing here depends on which sleeve
// monk.js decides to raise.
function raisedSleeve(monk) {
  let best = null, top = -Infinity;
  for (const c of monk.children) {
    if (c.name !== 'arm') continue;
    const y = sleeveHem(c).point.y;
    if (y > top) { top = y; best = c; }
  }
  return best;
}

// Park the finger on the hem, pushed back along the sleeve by its own width so
// its base sits INSIDE the cuff instead of floating off the lip of it.
function seat(f) {
  const hem = sleeveHem(f.arm);
  f.finger.position.copy(hem.point).addScaledVector(hem.along, -f.radius * 1.15);
}

// One finger, standing straight up out of the cuff.
//
// The finger is a child of the MONK, not of the sleeve. Parented to the sleeve
// it would inherit the sleeve's lean and point off sideways across the yard,
// and what Gutei holds up is a finger held UP — the whole gesture is that it is
// vertical. The price is that it has to be re-seated whenever the arm moves,
// which is all seat() does.
function raiseFinger(monk, { length, radius }) {
  const arm = raisedSleeve(monk);
  const finger = makeRaisedFinger({ length, radius });
  // Its own outline, thin, added BEFORE the scene-wide pass can claim it: the
  // house stroke is 0.033 wide and this digit is 0.05 across, so the standard
  // inverted hull would swallow the red completely.
  addOutlines(finger, { width: 0.007, wobble: 0.4 });
  monk.add(finger);
  const f = { monk, arm, finger, radius, restZ: arm.rotation.z, lift: 0, since: -1 };
  seat(f);
  return f;
}

const LIFT = 0.24;        // radians of extra sleeve — about a hand's width of rise
const GESTURE = 1.5;      // seconds, raise to settle
const BEAT = 0.55;        // the pause before the other one answers

function setLift(f, lift) {
  f.lift = lift;
  f.arm.rotation.z = f.restZ + lift * LIFT;
  seat(f);
}

// Quick up, a moment held, slow down — the shape a hand actually makes.
function envelope(u) {
  if (!(u > 0) || u >= 1) return 0;
  const e = Math.min(1, u / 0.18, (1 - u) / 0.55);
  return e * e * (3 - 2 * e);
}

export default {
  id: ID,
  slug: 'gutei-s-finger',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12'],
  // Closer and lower than the standard diorama framing. The subject of this one
  // is two marks a few centimetres long; at the default distance they are specks
  // in a meadow. The azimuth is nudged a little off the sleeves' bearing so that
  // Gutei's staff never lines up with his own raised finger anywhere in the
  // drag range.
  // Lifted off the deck: at polar 1.30 the lens sat down among the grass tips and
  // both figures were shot through a screen of blades.
  camera: { distance: 9.6, target: [0.33, 1.25, -0.05], azimuth: 0.72, polar: 1.18 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the approach to the temple, coming up the right-hand side of the yard and
    // running past the hall
    const path = makePath({ from: [3.9, 8.5], to: [2.0, -15], width: 1.6, seed: 33, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    const hall = makeHut({ width: 3.2, height: 2.4, depth: 2.6 });
    hall.position.set(HALL.x, 0, HALL.z);
    hall.rotation.y = -0.50;                       // its threshold opens onto the yard
    scene.add(hall);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(LANTERN.x, 0, LANTERN.z);
    scene.add(lantern);

    // Gutei: bigger, stouter, hatted, with an elder's staff. Everything about
    // him should say master before you have looked at what he is doing.
    // No staff. The elder's staff stands on the same side as the raised arm, so
    // it drew a grey vertical right beside the red seal and the two competed —
    // in a case whose entire subject is one small red gesture, nothing else gets
    // to be a vertical line next to it. He still reads as the master by size,
    // stoutness, hat and staging.
    const gutei = makeMonk({ height: 1.66, stout: 1.1, pose: 'point' });
    gutei.position.set(GUTEI.x, 0, GUTEI.z);
    gutei.rotation.y = FACING;
    scene.add(gutei);

    // The boy attendant, bare-headed — a novice has no travelling hat, and
    // without one his own finger clears the top of his head instead of
    // disappearing behind a brim.
    const boy = makeMonk({ height: 1.10, pose: 'point', hat: false });
    boy.position.set(BOY.x, 0, BOY.z);
    boy.rotation.y = FACING;
    scene.add(boy);

    // the two seals. His is a little larger than the boy's, but nothing like the
    // difference in their heights: the boy's copy has to read as the SAME thing,
    // and a strictly proportional finger on him is a speck.
    const master = raiseFinger(gutei, { length: 0.17, radius: 0.027 });
    const pupil = raiseFinger(boy, { length: 0.14, radius: 0.023 });

    // whoever has just asked. Kept off to the sides: the gap between the master
    // and the boy is where both gestures live and nothing else belongs in it.
    const visitor = makeMonk({ height: 1.58, stout: 0.96 });
    visitor.position.set(VISITOR.x, 0, VISITOR.z);
    aimMonk(visitor, boy.position);
    scene.add(visitor);

    // seated, deliberately: a low silhouette cannot crowd a raised finger
    const resident = makeMonk({ height: 1.55, pose: 'sit' });
    resident.position.set(RESIDENT.x, 0, RESIDENT.z);
    aimMonk(resident, gutei.position);
    scene.add(resident);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.05),
        { x: GUTEI.x, z: GUTEI.z, r: 1.5 },
        { x: BOY.x, z: BOY.z, r: 1.2 },
        // the yard between them — nothing grows up between the two gestures
        { x: (GUTEI.x + BOY.x) / 2, z: (GUTEI.z + BOY.z) / 2, r: 1.7 },
        { x: VISITOR.x, z: VISITOR.z, r: 1.1 },
        { x: RESIDENT.x, z: RESIDENT.z, r: 1.1 },
        { x: LANTERN.x, z: LANTERN.z, r: 1.0 },
        { x: HALL.x, z: HALL.z, r: 3.2 },
        // the lens sits out here; a tree between it and the gesture would cost
        // the whole case
        { x: 4.6, z: 5.0, r: 5.2 },
      ],
      // Stingy on purpose. Only the trodden path, the hall's footprint and the
      // lantern's base actually cover ground — everyone here is standing in the
      // grass, which is how people stand in grass.
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: HALL.x, z: HALL.z, r: 1.9 },
        { x: LANTERN.x, z: LANTERN.z, r: 0.4 },
        // The swept yard. Standing in grass is right for a monk on a hillside and
        // wrong here — waist-high meadow buried both gestures, and the gestures
        // are the entire case. A temple yard is trodden bare, so this earns its
        // keepout the way the trail does.
        { x: (GUTEI.x + BOY.x) / 2, z: (GUTEI.z + BOY.z) / 2, r: 2.9 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [gutei.position, 0.72, 0.56, 0.42],
      [boy.position, 0.48, 0.38, 0.40],
      [visitor.position, 0.65, 0.5, 0.40],
      [resident.position, 0.62, 0.5, 0.40],
      [lantern.position, 0.32, 0.27, 0.30],
      [hall.position, 2.1, 1.6, 0.30],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: touch one of them, and the other one answers ----------
    // The imitation IS the koan, so the imitation is the thing you can reach.
    // No prompt says so and nothing is scored; it is a small ambient echo, and
    // both fingers are up whether or not anyone ever touches them.
    let camera = null;
    let now = 0;
    let taps = 0, answers = 0;
    let echo = null, echoAt = 0;

    const pick = (o) => {
      const out = [];
      o.traverse((m) => { if (m.isMesh && !m.userData.isOutline) out.push(m); });
      return out;
    };
    const guteiMeshes = pick(gutei);
    const boyMeshes = pick(boy);

    const strike = (f) => {
      f.since = now;
      // the master's note is low, the boy's a fifth above it: the same gesture,
      // twice, in two voices
      audio && audio.bell({ f0: f === master ? 62 : 93, gain: f === master ? 0.14 : 0.11 });
    };

    input.onTap(() => {
      if (!camera) return;
      const onGutei = input.raycastFirst(camera, guteiMeshes);
      const onBoy = onGutei ? null : input.raycastFirst(camera, boyMeshes);
      if (!onGutei && !onBoy) return;
      taps++;
      strike(onGutei ? master : pupil);
      echo = onGutei ? pupil : master;      // and after a beat, so does the other
      echoAt = now + BEAT;
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.12']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        now = simTime;
        world.update(dt, simTime);          // the meadow's wind
        if (echo && simTime >= echoAt) {
          strike(echo);
          echo = null;
          answers++;
        }
        for (const f of [master, pupil]) {
          const u = f.since < 0 ? -1 : (simTime - f.since) / GESTURE;
          if (u >= 1) f.since = -1;
          const lift = envelope(u);
          if (lift !== f.lift) setLift(f, lift);   // idle costs nothing; a finger at rest stays put
        }
      },
      fragment() {
        return {
          taps,
          answers,
          mirrored: answers > 0,
          masterLift: +master.lift.toFixed(4),
          boyLift: +pupil.lift.toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
