import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { sphereHead, sleeve } from './figure.js';
import { createPendulum, integratePendulum, kickPendulum } from './pendulum.js';

// The man in Kyogen's tree (case 5), holding on by his teeth. Built from
// figure.js's shared vocabulary — the same sphere head, the same cuffed sleeve every other person in the book wears — but
// the robe stays his own profile (hanging robes hang; see below) and he is
// hung rather than stood: the group's ORIGIN is the teeth-grip itself, the
// point where his mouth meets the branch, and every part of him hangs below
// it. Rotating the group therefore swings him from the bite, which is the
// only pendulum this figure could honestly be.
//
// No hat. It would have fallen. (A case may lay one on the ground far below.)
//
// He is trying very hard to be still: at rest the sway is barely a breath.
// sway() gives him one small decaying swing — a man nudged, not a man
// answering. Everything is driven off simTime, so a replayed session swings
// exactly the same way.
export function makeHangingMonk({ height = 1.6, color = INK_LIT, seed = 5 } = {}) {
  const g = new THREE.Group();
  g.name = 'hangingmonk';
  const mat = washMaterial({ color, flat: true });
  const h = height;

  // The robe, hung. Narrow at the collar, swelling at the shoulders, and only
  // slightly flared at the hem — gravity pulls a hanging robe straight, so the
  // wide bell of the standing monk would read as a man planted upside-down in
  // the air. y runs NEGATIVE: the profile is authored from the pivot down.
  const profile = [
    [0.020, -0.920],   // hem, closed
    [0.150, -0.920],   // hem edge — the widest cloth he owns
    [0.163, -0.870],   // a slight bell just above it
    [0.132, -0.620],
    [0.114, -0.440],   // waist
    [0.126, -0.330],   // chest
    [0.130, -0.275],   // shoulders
    [0.055, -0.215],   // collar tucked under the head
    [0.000, -0.200],   // closed over: with no neck piece the open ring showed paper from above
  ].map(([r, y]) => new THREE.Vector2(r * h, y * h));
  // The whole lower body — robe, sleeves, feet — is lifted toward the head so
  // the collar sits just under the skull. The head can't move (its front is the
  // bite, pinned to the branch at the origin), so closing the gap means raising
  // the body to it, which also shortens the neck to a real neck rather than a
  // long stalk — the neck read as too long until the body came up to meet it.
  const LIFT = 0.075 * h;

  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), mat);
  body.name = 'body';
  // the body hangs plumb under the HEAD, not under the mouth — this backset is
  // what draws the tipped-back dangle on a figure made of featureless solids
  body.position.set(0, LIFT, -0.062 * h);
  g.add(body);

  // THE BITE. The group origin is the mouth, and the mouth is on the head's
  // upper-front surface — so the head hangs BELOW AND BEHIND the origin,
  // reaching up-and-forward to it, and when the case sets the origin against
  // the branch the front of his face presses INTO the wood, which is what the
  // physics asks for: a man hanging by his teeth tips back, chin up, crown away
  // — he dangles from his jaw, he doesn't stand under it. (The head is a
  // featureless sphere, so the tilt is drawn mostly by OFFSETS — head behind
  // the pivot, body further behind still. A later pass added the rotateX below
  // on top of them, pitching the head back on its own centre as well.)
  const headR = 0.095 * h;
  // sphereHead's own default is the radius headR names above, so this is
  // figure.js's head rather than a lookalike copy.
  const head = sphereHead({ height: h, mat });
  // mouth = origin = head centre, offset up and forward by fractions of headR
  head.position.set(0, -0.7 * headR, -0.9 * headR);
  head.rotateX(-1.0)
  g.add(head);

  // NO NECK PIECE. The lifted collar already closes inside the skull, so the
  // head sits on the robe unaided; a column bridging the two stood wider than
  // the collar it rose from and read as a peg driven through his throat.

  // SLEEVES HANGING AT HIS SIDES — his hands grasp no branch. They are
  // figure.js's sleeve(), so the cloth is the cloth everyone wears, and they
  // hang SLACK rather than straight: two plain tubes dropped plumb from a
  // shoulder as wide as the cuff were rods, and the last ones left in the book
  // once every standing figure had elbows. Three things make them arms, the
  // same three the standing figure's are made of:
  //   - a slight bend, elbow back and hand forward, and a different one on
  //     each side, because a mirrored pair is a chess piece. It is kept well
  //     short of a gesture: he is not doing anything with them.
  //   - slim at the shoulder and wide at the mouth, the low back corner of
  //     the mouth dropped — weight at the bottom edge of the cloth.
  //   - the hinge set just under the robe's own shoulder ring, so the cap
  //     closes beneath it and the outline runs collar, shoulder, arm. Hinged
  //     level with that ring the caps stood up past it as a second pair of
  //     shoulders, square as a coat hanger.
  // The mesh's origin is the shoulder, and each sleeve is cut for the way it
  // is turned (its `hang` is plumb as seen from inside the posed arm), which
  // is why the rotation is fixed before the sleeve is built. The length is
  // what brings the hem back to where a slack hand ends, short of the knee,
  // now that the hinge is lower.
  const sleeveL = 0.345 * h;
  const pose = new THREE.Euler();
  const plumb = new THREE.Quaternion();
  // one hand hangs a little ahead of the other; which one is the seed's
  const ahead = hash1(2, seed) < 0.5 ? -1 : 1;
  for (const side of [-1, 1]) {
    const k = side < 0 ? 10 : 20;
    // and each turns a hair in at the wrist, following the robe as it narrows
    pose.set(
      0.02 + side * ahead * (0.025 + 0.02 * hash1(k + 1, seed)),
      0,
      side * -(0.035 + 0.03 * hash1(k + 3, seed)));
    const arm = sleeve({
      height: h, len: sleeveL, r0: 0.037, r1: 0.045, mat,
      bend: 0.07 + 0.05 * hash1(k + 4, seed),
      hang: new THREE.Vector3(0, -1, 0).applyQuaternion(plumb.setFromEuler(pose).invert()),
      drape: 0.03,
    });
    arm.position.set(side * 0.120 * h, -0.312 * h + LIFT, -0.062 * h);
    arm.rotation.copy(pose);
    g.add(arm);
  }

  // feet together below the hem — they rest on no limb
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030 * h, 0.026 * h, 0.075 * h, 7), mat);
    foot.name = 'foot';
    foot.position.set(side * 0.037 * h, -0.955 * h + LIFT, -0.050 * h);
    g.add(foot);
  }

  // ---- the pendulum --------------------------------------------------------
  // THE NUDGE IS INTEGRATED, NOT REPLAYED, and that is the whole of why this
  // is not a closed form like the rest of the book's animation.
  //
  // It WAS one: swingA * sin((simTime - t0) * WS), with sway() setting
  // t0 = now. sin(0) is 0, so every tap threw away the phase he was in and
  // restarted the swing from dead vertical — touch a man who is out at the end
  // of his arc and he SNAPS through the bottom before moving. Amplitude was
  // carried across the tap; the position was not, which is the one part the
  // reader can see.
  //
  // A kick is a change in VELOCITY, and kit/pendulum.js already models exactly
  // that (kickPendulum touches omega and leaves theta alone, so the thing you
  // just hit is still where it was the instant before your hand landed — the
  // same reason case 46's pole cannot pop on repeat taps). Determinism is not
  // lost by integrating: integratePendulum folds any dt into fixed substeps,
  // so the pose depends on elapsed time and the sequence of kicks, never on
  // how a caller chopped up the frames.
  //
  // THE BREATH STAYS CLOSED-FORM. He is trying very hard to be still, and that
  // stillness is not a pendulum state — it is a man breathing, and it must not
  // be something a tap can add energy to. So it rides on top, and only the
  // nudge is physics.
  const REST = 0.022;                        // rad — the stillness he manages
  const W = 2.3;                             // rest sway, ~2.7 s a side
  const W2 = 1.77;                           // the cross-plane drifts slower
  const WS = 3.1;                            // rad/s — a nudge swings a little faster
  const TAU = 2.4;                           // seconds for a swing to fade
  const CAP = 0.30;                          // rad — taps never build past this
  const KICK = 0.15 * WS;                    // the impulse one sway(1) is worth
  const G = 9.8;                             // furin.js's GRAVITY, the kit's one value
  const phase = hash1(1, seed) * Math.PI * 2;

  // Length from the frequency rather than the other way round: WS is the number
  // that was tuned by eye, so it is the one that stays authored. A lightly
  // damped oscillator's envelope decays as exp(-damping*t/2), which is what
  // sets damping from the TAU that was likewise tuned.
  const p = createPendulum({ length: G / (WS * WS), g: G, damping: 2 / TAU });
  const noTorque = () => 0;

  // Amplitude of the swing he would reach if left alone from here — position
  // and velocity together, which is what "how much swing is in him" means for
  // something that is moving. The old `mag()` was the decaying amplitude of a
  // replayed curve; this is the same quantity for a real one, so `energy()`
  // and `swinging()` keep meaning what they meant.
  const amp = () => Math.hypot(p.theta, p.omega / WS);

  function update(dt, simTime) {
    integratePendulum(p, Math.max(0, dt || 0), noTorque);
    const s = p.theta;
    const t = Number.isFinite(simTime) ? simTime : p.clock;
    g.rotation.z = REST * Math.sin(t * W + phase) + s;
    g.rotation.x = REST * 0.6 * Math.sin(t * W2 + phase * 1.7) + s * 0.3;
  }
  update(0, 0);   // posed at rest from the first frame

  return {
    group: g,
    update,
    // A shove, on top of whatever he is already doing — his position at this
    // instant is untouched. Repeated taps add a little, never past CAP: he
    // steadies himself, he does not build to a launch. The cap is applied to
    // the impulse rather than to the pose, because clamping theta afterwards
    // would be the snap this rewrite exists to remove.
    sway(strength = 1) {
      const want = KICK * Math.max(0, strength);
      if (amp() >= CAP) return;                     // already as wound up as he gets
      // the largest impulse that still lands inside CAP, in the direction he
      // is already going, so a tap never fights the swing it is adding to
      const room = Math.sqrt(Math.max(0, CAP * CAP - p.theta * p.theta)) * WS;
      const dir = p.omega >= 0 ? 1 : -1;
      kickPendulum(p, dir * Math.min(want, Math.max(0, room - Math.abs(p.omega))));
    },
    swinging() { return amp() > 0.01; },
    energy() { return amp(); },
  };
}
