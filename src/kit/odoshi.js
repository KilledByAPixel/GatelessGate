import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';

// The shishi-odoshi — the bamboo deer-scarer: water fills the tube, the tube
// tips and pours, and the butt falls back onto the stone. Kotsun. A metronome
// disguised as a garden object, and the only instrument in the book whose
// silence you can WATCH filling up.
//
// The cycle is deterministic: closed forms over the simTime handed to
// update(), per-cycle length jittered by seeded hash — same seed, same call
// sequence, same knocks. This is kit, not audio: the no-Math.random rule
// applies in full. Sound leaves only through onPour/onKnock callbacks.
//
// Origin at the ground under the pivot; the mouth points along local +x.

const POUR_S = 1.3;      // tipping over and emptying
const RETURN_S = 0.9;    // the fall back, the knock, and the settling wobble
const KNOCK_AT = 0.07;   // seconds into the return when the butt meets stone
const BOUNCE_AT = 0.19;  // the second, softer tap
const REST = 0.34;       // arm angle at rest: butt down on the stone
const TIP = -0.42;       // arm angle poured out: mouth down

const easeOut = (k) => 1 - (1 - k) * (1 - k);

export function makeOdoshi({ size = 1, seed = 7, period = 32, phase = null, onPour = null, onKnock = null } = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'odoshi';

  const wood = toonMaterial({ color: WASH.dark, flat: true });
  const bamboo = toonMaterial({ color: WASH.dry });
  const stoneM = toonMaterial({ color: WASH.stone, flat: true });

  // the stand: two posts carrying an axle
  const PIVOT_Y = 0.52 * S;
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * S, 0.045 * S, PIVOT_Y + 0.06 * S, 6), wood);
    post.name = 'post';
    post.position.set(0, (PIVOT_Y + 0.06 * S) / 2, sz * 0.11 * S);
    g.add(post);
  }
  const axleGeo = new THREE.CylinderGeometry(0.022 * S, 0.022 * S, 0.34 * S, 6);
  axleGeo.rotateX(Math.PI / 2);
  const axle = new THREE.Mesh(axleGeo, wood);
  axle.name = 'axle';
  axle.position.y = PIVOT_Y;
  g.add(axle);

  // the tube swings about the axle; pivot sits aft of centre so the mouth
  // side is longer, the way the real object balances
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.y = PIVOT_Y;
  g.add(arm);
  const tubeGeo = new THREE.CylinderGeometry(0.065 * S, 0.075 * S, 1.15 * S, 8);
  tubeGeo.rotateZ(Math.PI / 2);
  const tube = new THREE.Mesh(tubeGeo, bamboo);
  tube.name = 'tube';
  tube.position.x = 0.12 * S;
  arm.add(tube);
  // darker rings where the culm's nodes are — what says "bamboo" at a glance
  for (const nx of [-0.32, 0.5]) {
    const rGeo = new THREE.CylinderGeometry(0.075 * S, 0.075 * S, 0.035 * S, 8);
    rGeo.rotateZ(Math.PI / 2);
    const ring = new THREE.Mesh(rGeo, wood);
    ring.name = 'node';
    ring.position.x = nx * S;
    arm.add(ring);
  }

  // the strike stone under the butt
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * S, 0.2 * S, 0.14 * S, 7), stoneM);
  stone.name = 'stone';
  stone.position.set(-0.42 * S, 0.07 * S, 0);
  g.add(stone);

  // a forgiving tap target around the whole mechanism
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(1.5 * S, 0.6 * S, 0.45 * S),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'odoshi-hit';
  hit.userData.noOutline = true;
  hit.position.y = PIVOT_Y;
  g.add(hit);

  // stagger: each instance starts a seeded way into its first fill, so two in
  // one garden never knock together
  const off = phase === null ? hash1(3, seed) * period : phase;

  let clock = 0;
  let cycle = 0;
  let cycleStart = -off;
  let len = period * (0.85 + 0.3 * hash1(11, seed));
  let poured = false, knocked = false, bounced = false;
  let knocks = 0;
  let tipRequest = false;

  function nextCycle() {
    cycleStart += len;
    cycle++;
    len = period * (0.85 + 0.3 * hash1(11 + cycle, seed));
    poured = knocked = bounced = false;
  }

  return {
    group: g,
    pickTargets() { return [hit]; },

    // a tap tips it without waiting out the fill — the audition page's
    // "tip it now", carried by the component
    tip() { tipRequest = true; },
    knocks() { return knocks; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      let u = clock - cycleStart;
      while (u >= len) { nextCycle(); u = clock - cycleStart; }   // skipped cycles fire nothing

      const fillLen = len - (POUR_S + RETURN_S);
      if (tipRequest) {
        if (u < fillLen) { cycleStart = clock - fillLen; u = fillLen; }
        tipRequest = false;                       // mid-pour taps are simply absorbed
      }

      if (u < fillLen) {
        // filling: the nose dips imperceptibly as the water loads it
        arm.rotation.z = REST - 0.06 * (u / fillLen);
      } else if (u < fillLen + POUR_S) {
        if (!poured) { poured = true; if (onPour) onPour(); }
        const k = easeOut(Math.min(1, ((u - fillLen) / POUR_S) * 2.2));
        arm.rotation.z = (REST - 0.06) + (TIP - (REST - 0.06)) * k;
      } else {
        const v = u - fillLen - POUR_S;
        if (!knocked && v >= KNOCK_AT) { knocked = true; knocks++; if (onKnock) onKnock(1); }
        if (!bounced && v >= BOUNCE_AT) { bounced = true; knocks++; if (onKnock) onKnock(0.4); }
        // the fall back: a damped wobble that lands on the stone and settles
        arm.rotation.z = REST + (TIP - REST) * Math.exp(-v / 0.11) * Math.cos(v * 22);
      }
    },
  };
}
