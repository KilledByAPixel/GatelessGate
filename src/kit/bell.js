import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { ACCENT, WASH } from '../palette.js';

// A temple bell (bonshō) hung from its own two-post frame, the way they stand
// in temple yards: a stone pad, two posts carrying a beam, a small roof over
// the beam, and the bell on a short link under it (case 16's seal).
//
// The bell is the accent, so its material glows on its own — see SEAL_GLOW in
// render/toon.js — and nothing here adds an emissive of its own.
//
// strike() sets it swinging: a pendulum rotation about the hanging point that
// dies back over about four seconds. A bonshō is massive, so the swing is slow
// (a ~1.9s period — a plausible pendulum for a bell this size) and SMALL: a few
// degrees at the strike, not a church-tower toll. Each strike is superposed as
// its own decaying impulse, so a second strike while it is still moving adds
// energy without any snap in the pose — the new term contributes nothing at the
// instant it lands and pushes from there. Everything is a closed form over the
// simTime fed to update(), so the motion is deterministic: same seed, same
// history of calls, same pose.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function makeBell({ height = 1.1, color = ACCENT, frameColor = WASH.dark, seed = 16 } = {}) {
  const g = new THREE.Group();
  g.name = 'bell';
  const H = height;

  const timber = toonMaterial({ color: frameColor });
  const flat = toonMaterial({ color: frameColor, flat: true });
  const stone = toonMaterial({ color: WASH.stone, flat: true });

  // the stone pad the frame stands on — also what the grass keeps out of
  const padH = 0.065 * H;
  const padR = 0.75 * H;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR * 1.07, padH, 10), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  // two posts carrying the beam the bell hangs from
  const spread = 1.16 * H;              // post-to-post
  const pivotY = 1.47 * H;              // the hanging point, under the beam
  const beamY = pivotY + 0.065 * H;     // beam centre; its underside is the pivot
  const postH = beamY - padH;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * H, 0.07 * H, postH, 8), timber);
    post.name = 'post';
    post.position.set(sx * spread / 2, padH + postH / 2, 0);
    g.add(post);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(spread + 0.5 * H, 0.13 * H, 0.13 * H), flat);
  beam.name = 'beam';
  beam.position.y = beamY;
  g.add(beam);

  // a small roof over the beam: the hut's pyramid, squared to the posts and
  // squashed front-to-back so it reads as a beam cap rather than a building
  const roofGeo = new THREE.ConeGeometry(1.31 * H, 0.34 * H, 4);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, 0.55);
  const roof = new THREE.Mesh(roofGeo, flat);
  roof.name = 'roof';
  roof.position.y = beamY + 0.065 * H + 0.17 * H;
  g.add(roof);

  // Everything below the pivot swings as one piece about it.
  const swing = new THREE.Group();
  swing.name = 'swing';
  swing.position.y = pivotY;
  g.add(swing);

  const linkLen = 0.14 * H;
  const linkGeo = new THREE.CylinderGeometry(0.032 * H, 0.032 * H, linkLen, 6);
  linkGeo.translate(0, -linkLen / 2, 0);
  const link = new THREE.Mesh(linkGeo, flat);
  link.name = 'link';
  swing.add(link);

  // The bell itself: dome top, near-straight barrel, and a slight flare at the
  // mouth — the widest ring is the lowest one. The profile runs mouth to crown
  // with a shallow recessed underside, so nothing is open from below.
  const P = [
    [0.000, 0.055], [0.235, 0.035], [0.340, 0.000], [0.315, 0.090],
    [0.300, 0.300], [0.295, 0.520], [0.285, 0.660], [0.245, 0.790],
    [0.160, 0.910], [0.065, 0.985], [0.000, 1.000],
  ].map(([r, y]) => new THREE.Vector2(r * H, y * H));
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 12), toonMaterial({ color, flat: true }));
  body.name = 'body';
  body.position.y = -linkLen - H;       // crown at the link's foot; mouth at 0.33·H
  swing.add(body);

  // A tap wants the bell, not a particular facet: an invisible drum around the
  // body keeps the gesture forgiving on a phone. Solid to a raycast only.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48 * H, 0.48 * H, 1.25 * H, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'bell-hit';
  hit.userData.noOutline = true;
  hit.position.y = -linkLen - 0.5 * H;
  swing.add(hit);

  // ---- the swing --------------------------------------------------------
  const PERIOD = 1.9;                     // seconds per swing — massive, unhurried
  const OMEGA = (2 * Math.PI) / PERIOD;
  const TAU = 1.35;                       // envelope e-folding: ~5% left at 4s
  const A0 = 0.055;                       // radians per strike — subtle
  const MAX = 0.11;                       // spamming taps still stays a bonshō
  // a faint off-axis component so the swing is not machine-planar; per-seed
  // rate and depth, and it starts from zero at each strike like the main term
  const wobFreq = OMEGA * (0.78 + 0.10 * hash1(7, seed));
  const wobAmp = 0.20 + 0.15 * hash1(8, seed);

  let clock = 0;
  const struck = [];                      // simTimes of strikes still sounding

  function pose() {
    let x = 0, z = 0;
    for (const t0 of struck) {
      const t = clock - t0;
      if (t < 0) continue;
      const env = A0 * Math.exp(-t / TAU);
      x += env * Math.sin(OMEGA * t);
      z += env * wobAmp * Math.sin(wobFreq * t);
    }
    swing.rotation.x = clamp(x, -MAX, MAX);
    swing.rotation.z = clamp(z, -MAX, MAX);
  }

  return {
    group: g,
    body,
    // what a tap should be tested against — the drum, the bronze, the link
    pickTargets() { return [hit, body, link]; },

    strike() {
      struck.push(clock);
      if (struck.length > 8) struck.shift();
      pose();
    },
    // total envelope still in the bell: 0 at rest, ~A0 just after one strike
    swinging() {
      let e = 0;
      for (const t0 of struck) if (clock >= t0) e += A0 * Math.exp(-(clock - t0) / TAU);
      return e;
    },
    angle() { return swing.rotation.x; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (struck.length && clock - struck[0] > 6 * TAU) struck.shift();
      pose();
    },
  };
}
