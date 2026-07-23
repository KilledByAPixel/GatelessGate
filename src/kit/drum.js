import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH, wash } from '../palette.js';

// The dinner drum (case 13) — a barrel drum slung in its own frame, the
// companion piece to the bonshō. Tokusan's whole mistake is that this has not
// been beaten yet.
//
// The drum's axis runs along local ±X, so the near skin faces local +X: aim
// that at the camera. Origin on the ground under the frame.
//
// strike() is a closed form like the bell's: a fast decaying pulse that bulges
// the skin and rocks the barrel in its slings, superposed so repeated hits
// stack without a snap.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const PERIOD = 0.42;     // the barrel's rock — light, quick, over in a moment
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.30;
const A0 = 0.055;        // radians of rock at a full strike
const SKIN0 = 0.18;      // skin bulge, as a fraction of its own depth
const SKIN_TAU = 0.11;   // the head stops moving well before the frame does
const MAX = 0.13;

export function makeDrum({ radius = 0.52, color = WASH.dark, skinColor = wash(0.20), seed = 13 } = {}) {
  const R = radius;
  const g = new THREE.Group();
  g.name = 'drum';

  const timber = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });
  const stone = toonMaterial({ color: WASH.stone, flat: true });

  const PIVOT_Y = R * 2.3;

  const padH = 0.14 * R;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * R, 1.42 * R, padH, 9), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  // two posts flanking the barrel along its axis, carrying a beam
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * R, 0.12 * R, PIVOT_Y + 0.2 * R, 7), timber);
    post.name = 'post';
    post.position.set(sx * 1.02 * R, (PIVOT_Y + 0.2 * R) / 2, 0);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.5 * R, 0.16 * R, 0.16 * R), flat);
  beam.name = 'beam';
  beam.position.y = PIVOT_Y + 0.2 * R;
  g.add(beam);

  // the barrel hangs under the beam and rocks about it
  const rock = new THREE.Group();
  rock.name = 'rock';
  rock.position.y = PIVOT_Y + 0.2 * R;
  g.add(rock);

  const DROP = 0.2 * R + R * 0.02;
  for (const sx of [-1, 1]) {
    const slingGeo = new THREE.CylinderGeometry(0.022 * R, 0.022 * R, DROP + R * 0.55, 5);
    slingGeo.translate(0, -(DROP + R * 0.55) / 2, 0);
    const sling = new THREE.Mesh(slingGeo, flat);
    sling.name = 'sling';
    sling.position.x = sx * 0.62 * R;
    rock.add(sling);
  }

  const barrel = new THREE.Group();
  barrel.name = 'barrel';
  barrel.position.y = -DROP - R * 0.02;
  rock.add(barrel);

  // The body: a lathed barrel — widest at the middle, the way a taiko is
  // hollowed — laid on its side so the heads face ±x.
  const DEPTH = 1.34 * R;
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = R * (0.80 + 0.20 * Math.sin(Math.PI * t));
    prof.push(new THREE.Vector2(r, t * DEPTH - DEPTH / 2));
  }
  prof.unshift(new THREE.Vector2(0, -DEPTH / 2));
  prof.push(new THREE.Vector2(0, DEPTH / 2));
  const bodyGeo = new THREE.LatheGeometry(prof, 12);
  bodyGeo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, toonMaterial({ color, flat: true }));
  body.name = 'body';
  barrel.add(body);

  // the two heads — pale hide, the only light thing on it
  const heads = [];
  for (const sx of [-1, 1]) {
    const headGeo = new THREE.CylinderGeometry(0.805 * R, 0.805 * R, 0.06 * R, 12);
    headGeo.rotateZ(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, toonMaterial({ color: skinColor, flat: true }));
    head.name = 'head';
    head.position.x = sx * (DEPTH / 2 + 0.01 * R);
    barrel.add(head);
    heads.push(head);
  }

  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.05, R * 1.05, DEPTH * 1.5, 10),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.geometry.rotateZ(Math.PI / 2);
  hit.name = 'drum-hit';
  hit.userData.noOutline = true;
  hit.position.y = PIVOT_Y - DROP - R * 0.02 + 0.2 * R;
  g.add(hit);

  let clock = 0;
  const struck = [];

  function pose() {
    let a = 0, s = 0;
    for (const t0 of struck) {
      const t = clock - t0;
      if (t < 0) continue;
      a += A0 * Math.exp(-t / TAU) * Math.sin(OMEGA * t);
      s += SKIN0 * Math.exp(-t / SKIN_TAU) * Math.sin(OMEGA * 2.4 * t);
    }
    rock.rotation.z = clamp(a, -MAX, MAX);
    // the near head takes the blow; the far one answers a beat behind it
    const bulge = clamp(s, -0.5, 0.5);
    heads[1].scale.x = 1 + bulge;
    heads[0].scale.x = 1 - bulge * 0.45;
  }

  return {
    group: g,
    pickTargets() { return [hit, body]; },

    strike() {
      struck.push(clock);
      if (struck.length > 6) struck.shift();
      pose();
    },
    // energy still in the head, 0 at rest
    ringing() {
      let e = 0;
      for (const t0 of struck) if (clock >= t0) e += SKIN0 * Math.exp(-(clock - t0) / SKIN_TAU);
      return e;
    },
    angle() { return rock.rotation.z; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (struck.length && clock - struck[0] > 8 * TAU) struck.shift();
      pose();
    },
  };
}
