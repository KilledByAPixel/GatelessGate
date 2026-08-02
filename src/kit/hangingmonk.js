import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK_FIGURE } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { sphereHead, neckBetween, sleeve } from './figure.js';

// The man in Kyogen's tree (case 5), holding on by his teeth. Built from
// figure.js's shared vocabulary — the same sphere head, the same solved
// neck, the same cuffed sleeve every other person in the book wears — but
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
export function makeHangingMonk({ height = 1.6, color = INK_FIGURE, seed = 5 } = {}) {
  const g = new THREE.Group();
  g.name = 'hangingmonk';
  const mat = toonMaterial({ color, flat: true });
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
  ].map(([r, y]) => new THREE.Vector2(r * h, y * h));
  // The whole lower body — robe, sleeves, feet — is lifted toward the head so
  // the collar sits just under the skull. The head can't move (its front is the
  // bite, pinned to the branch at the origin), so closing the gap means raising
  // the body to it, which also shortens the neck to a real neck rather than a
  // long stalk (Frank: the neck was still too long — bring the body up).
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
  // the branch the front of his face presses INTO the wood. Frank's note, and
  // he's right about the physics: a man hanging by his teeth tips back, chin
  // up, crown away — he dangles from his jaw, he doesn't stand under it.
  // (The head is a featureless sphere, so the tilt is drawn by OFFSETS — head
  // behind the pivot, body further behind still — rather than by rotating
  // geometry nobody can see rotate.)
  const headR = 0.095 * h;
  // sphereHead's default r is 0.095 — the same radius headR names — so this
  // is figure.js's own head, not a lookalike copy.
  const head = sphereHead({ height: h, mat });
  // mouth = origin = head centre + (up 0.55 + forward 0.75) · headR
  head.position.set(0, -0.55 * headR, -0.75 * headR);
  g.add(head);

  // A NECK, bridging the collar to the head. Featureless solids left a visible
  // gap between the hanging robe and the sphere, so the head read as floating a
  // little clear of the body (Frank's note). A short tapered column filling that
  // span — thin under the skull, swelling into the collar — reads as fully
  // connected without moving either piece. It leans back a touch to follow the
  // head, which hangs behind the pivot.
  const collar = new THREE.Vector3(0, -0.232 * h + LIFT, -0.060 * h);   // the lifted collar
  const nape = new THREE.Vector3(0, -0.140 * h, -0.072 * h);            // just into the skull
  // neckBetween is this file's own solve, promoted to figure.js — same two
  // radii and pad this file always used, just passed explicitly: its
  // defaults are absolute units, not fractions of height, so the
  // height-scaled numbers below would silently mean something else left
  // implicit.
  const neck = neckBetween(collar, nape, { r0: 0.056 * h, r1: 0.070 * h, pad: 0.03 * h, mat });
  g.add(neck);

  // sleeves hanging straight down at his sides — his hands grasp no branch.
  // figure.js's sleeve() gives him the same cuffed taper the rebuilt monk
  // wears: its default shoulder/wrist radii (0.035, 0.065) are the exact
  // numbers this file's plain cylinder always used, so this is the cuff
  // upgrade landing here, not a new proportion. The mesh's own origin is the
  // shoulder — the same convention the old hand-translated cylinder used —
  // so the position below still means what it always meant.
  const sleeveL = 0.36 * h;
  for (const side of [-1, 1]) {
    const arm = sleeve({ height: h, len: sleeveL, mat });
    arm.position.set(side * 0.122 * h, -0.295 * h + LIFT, -0.062 * h);
    arm.rotation.z = side * -0.055;   // a hair clear of the robe, still plumb
    arm.rotation.x = 0.02;
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
  const REST = 0.022;                        // rad — the stillness he manages
  const W = 2.3;                             // rest sway, ~2.7 s a side
  const W2 = 1.77;                           // the cross-plane drifts slower
  const WS = 3.1;                            // a nudge swings a little faster
  const TAU = 2.4;                           // seconds for a swing to fade
  const CAP = 0.30;                          // rad — taps never build past this
  const phase = hash1(1, seed) * Math.PI * 2;

  let swingA = 0;      // amplitude at the moment of the last nudge
  let t0 = 0;          // when that nudge landed (simTime)
  let last = 0;        // latest simTime seen by update()

  const mag = () => swingA * Math.exp(-(last - t0) / TAU);

  function update(dt, simTime) {
    last = simTime;
    const s = mag() * Math.sin((simTime - t0) * WS);
    g.rotation.z = REST * Math.sin(simTime * W + phase) + s;
    g.rotation.x = REST * 0.6 * Math.sin(simTime * W2 + phase * 1.7) + s * 0.3;
  }
  update(0, 0);   // posed at rest from the first frame

  return {
    group: g,
    update,
    // one decaying swing on top of whatever he is already doing. Repeated
    // taps add a little, never past CAP: he steadies himself, he does not
    // build to a launch.
    sway(strength = 1) {
      swingA = Math.min(CAP, mag() + 0.15 * Math.max(0, strength));
      t0 = last;
    },
    swinging() { return mag() > 0.01; },
    energy() { return mag(); },
  };
}
