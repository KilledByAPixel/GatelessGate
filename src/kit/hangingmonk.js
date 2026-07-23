import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { hash1 } from '../util/noise.js';

// The man in Kyogen's tree (case 5), holding on by his teeth. Built from
// monk.js's vocabulary — lathed robe, sphere head, cylinder sleeves — but
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
export function makeHangingMonk({ height = 1.6, color = INK, seed = 5 } = {}) {
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
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), mat);
  body.name = 'body';
  // the body hangs plumb under the HEAD, not under the mouth — this backset is
  // what draws the tipped-back dangle on a figure made of featureless solids
  body.position.z = -0.062 * h;
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
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 10), mat);
  head.name = 'head';
  // mouth = origin = head centre + (up 0.55 + forward 0.75) · headR
  head.position.set(0, -0.55 * headR, -0.75 * headR);
  g.add(head);

  // A NECK, bridging the collar to the head. Featureless solids left a visible
  // gap between the hanging robe and the sphere, so the head read as floating a
  // little clear of the body (Frank's note). A short tapered column filling that
  // span — thin under the skull, swelling into the collar — reads as fully
  // connected without moving either piece. It leans back a touch to follow the
  // head, which hangs behind the pivot.
  const collar = new THREE.Vector3(0, -0.232 * h, -0.060 * h);
  const nape = new THREE.Vector3(0, -0.120 * h, -0.072 * h);
  const dir = nape.clone().sub(collar);
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.050 * h, 0.064 * h, dir.length() + 0.05 * h, 8), mat);
  neck.name = 'neck';
  neck.position.copy(collar).addScaledVector(dir, 0.5);
  neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.add(neck);

  // sleeves hanging straight down at his sides — his hands grasp no branch
  const sleeveL = 0.36 * h;
  for (const side of [-1, 1]) {
    const geo = new THREE.CylinderGeometry(0.035 * h, 0.065 * h, sleeveL, 7);
    geo.translate(0, -sleeveL / 2, 0);
    const arm = new THREE.Mesh(geo, mat);
    arm.name = 'arm';
    arm.position.set(side * 0.122 * h, -0.295 * h, -0.062 * h);
    arm.rotation.z = side * -0.055;   // a hair clear of the robe, still plumb
    arm.rotation.x = 0.02;
    g.add(arm);
  }

  // feet together below the hem — they rest on no limb
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030 * h, 0.026 * h, 0.075 * h, 7), mat);
    foot.name = 'foot';
    foot.position.set(side * 0.037 * h, -0.955 * h, -0.050 * h);
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
