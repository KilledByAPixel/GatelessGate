import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';

// The steelyard balance Tozan was weighing flax on (case 18).
//
// The whole point of the object is that it does not matter what you do to it:
// disturb it and it swings, and it settles back to exactly the reading it had
// before. Three pounds. The beam is a damped oscillator whose rest angle is a
// constant — every disturbance is superposed as its own decaying term that
// contributes nothing at the instant it lands, so a second nudge mid-swing
// adds energy without any snap in the pose (the bell's trick).
//
// Origin on the ground under the post; the beam runs along local ±x, pan on
// the -x end, counterweight on +x.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const REST = -0.05;      // a hair pan-heavy at equilibrium; dead level reads as a prop
const PERIOD = 1.15;
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.85;
const A0 = 0.16;         // radians at a full-force nudge
const MAX = 0.42;

export function makeScale({ height = 1.35, color = WASH.dark, panColor = WASH.stone, reading = 3 } = {}) {
  const H = height;
  const g = new THREE.Group();
  g.name = 'scale';

  const timber = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });
  const stone = toonMaterial({ color: WASH.stone, flat: true });

  const padH = 0.05 * H;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.30 * H, 0.36 * H, padH, 8), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * H, 0.062 * H, H, 7), timber);
  post.name = 'post';
  post.position.y = H / 2;
  g.add(post);

  // the beam pivots on the post's head
  const beam = new THREE.Group();
  beam.name = 'beam';
  beam.position.y = H;
  g.add(beam);

  const BEAM_L = 1.55 * H;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(BEAM_L, 0.045 * H, 0.045 * H), flat);
  bar.name = 'bar';
  beam.add(bar);

  const fulcrum = new THREE.Mesh(new THREE.ConeGeometry(0.075 * H, 0.11 * H, 6), flat);
  fulcrum.name = 'fulcrum';
  fulcrum.position.y = 0.055 * H;
  beam.add(fulcrum);

  // The pan hangs from the -x end on a cord and stays level however the beam
  // tips — a pan that rotated with the beam would read as welded on.
  const PAN_X = -BEAM_L / 2 + 0.03 * H;
  const hang = new THREE.Group();
  hang.name = 'hang';
  hang.position.set(PAN_X, 0, 0);
  beam.add(hang);

  const CORD = 0.34 * H;
  const cordGeo = new THREE.CylinderGeometry(0.012 * H, 0.012 * H, CORD, 5);
  cordGeo.translate(0, -CORD / 2, 0);
  const cord = new THREE.Mesh(cordGeo, flat);
  cord.name = 'cord';
  hang.add(cord);

  const pan = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * H, 0.20 * H, 0.07 * H, 10),
    toonMaterial({ color: panColor, flat: true }));
  pan.name = 'pan';
  pan.position.y = -CORD - 0.035 * H;
  hang.add(pan);

  const PAN_X2 = BEAM_L / 3 + 0.03 * H;
  const hang2 = new THREE.Group();
  hang2.name = 'hang2';
  hang2.position.set(PAN_X2, 0, 0);
  beam.add(hang2);
  
  const cord2 = new THREE.Mesh(cordGeo, flat);
  cord2.name = 'cord2';
  hang2.add(cord2);

  // the counterweight, slid out along the beam to where three pounds balances
  const weight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075 * H, 0.095 * H, 0.19 * H, 8),
    toonMaterial({ color, flat: true }));
  weight.name = 'weight';
  weight.position.set(0, -0.25 * H, 0);
  hang2.add(weight);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(BEAM_L * 1.05, 0.62 * H, 0.4 * H),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'scale-hit';
  hit.userData.noOutline = true;
  hit.position.y = H - 0.13 * H;
  g.add(hit);

  let clock = 0;
  const nudges = [];      // { t, force }

  function pose() {
    let a = 0;
    for (const n of nudges) {
      const t = clock - n.t;
      if (t < 0) continue;
      a += A0 * n.force * Math.exp(-t / TAU) * Math.sin(OMEGA * t);
    }
    beam.rotation.z = REST + clamp(a, -MAX, MAX);
    hang.rotation.z = -beam.rotation.z;      // the pan stays level, as a hung pan does
  }

  return {
    group: g,
    pan,
    pickTargets() { return [hit]; },

    disturb(force = 1) {
      nudges.push({ t: clock, force: clamp(force, -3, 3) });
      if (nudges.length > 8) nudges.shift();
      pose();
    },
    // it always says the same thing, which is the koan
    reading() { return reading; },
    angle() { return beam.rotation.z; },
    // how much swing is left; 0 when it has settled back to its one answer
    settling() {
      let e = 0;
      for (const n of nudges) if (clock >= n.t) e += A0 * Math.abs(n.force) * Math.exp(-(clock - n.t) / TAU);
      return e;
    },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (nudges.length && clock - nudges[0].t > 8 * TAU) nudges.shift();
      pose();
    },
  };
}
