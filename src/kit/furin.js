import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';

// A wind chime: tubes hung in a ring under a wooden cap, a clapper, a paper
// tag. The VISUAL sway follows the real gust — it is the wind that visibly
// moves it — but the strikes are paced by the chime's own much slower weather
// (chimeActivity). Frank auditioned strikes tied to the audible gust and the
// soundscape breathed in lockstep, too quiet then constant; untied, the brain
// fills in the causality on its own. The wind still GATES it: a stilled scene
// is a silent chime.
//
// Deterministic: closed forms over the simTime handed to update(). This is
// kit, not audio — the no-Math.random rule applies in full. The only audio
// import is gustPhase, a pure function (the sanctioned exception).
//
// The group's origin is the HANG POINT: all geometry below y=0, so a case
// positions it by where it hangs FROM.

// The chime's own weather: short spells with regular breaks. Measured over an
// hour: flurries 3-10 s (mean 8), breaks 16-33 s (mean 24), active ~26%. The
// first cut used ~111 s / ~70 s waves and Frank heard a 41 s flurry at load
// followed by an 89 s hole — it read as a bug. Rates chosen NOT to track the
// gust envelope.
const ACT_A = 0.031, ACT_B = 0.047;
export function chimeActivity(t) {
  const a = (Math.sin(2 * Math.PI * ACT_A * t) + Math.sin(2 * Math.PI * ACT_B * t)) / 2;
  return Math.max(0, Math.min(1, (a - 0.35) / 0.4));
}

const DENSITY = 0.85;      // Garden preset
const REFRACTORY = 0.45;   // a tube cannot restrike faster than this

// THE SWING. A furin is a light thing dragging a paper tag through the air, so
// it swings fast and settles fast — the bonshō in kit/bell.js is the same model
// at period 1.9s and tau 1.35s, because it is a tonne of bronze.
//
// This replaced an exponential nudge with no oscillating term, which leaned the
// chime toward a tap and eased it back without ever crossing centre. Each tap
// is superposed as its own decaying impulse starting from zero, so a second tap
// while it is still moving adds energy without any snap in the pose.
const SWING_PERIOD = 0.85;
const SWING_TAU = 1.8;
const SWING_OMEGA = (2 * Math.PI) / SWING_PERIOD;
const SWING_A0 = 0.13;     // radians at full force
const SWING_MAX = 0.30;    // mashing taps still stays a wind chime

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function makeFurin({
  size = 0.17, tubes = 5, seed = 5, phase = null, couple = 0, onStrike = null,
  cord = 0.62,             // the hanging string, in units of size; 0 for none
} = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  const wood = toonMaterial({ color: WASH.dark, flat: true });
  const metal = toonMaterial({ color: WASH.stone });

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  // THE STRING IT HANGS BY. A furin is tied up under an eave, and without
  // the cord the cap simply floated at the hang point with nothing holding
  // it (Frank: 'the furin should have a string attached to the top of it,
  // and rotate around the string attach point'). The swing group already
  // pivots at y = 0, which IS the knot, so the cord hangs from the pivot
  // and the whole chime swings from its top end like the real thing.
  const CORD = cord * S;
  if (CORD > 0) {
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018 * S, 0.018 * S, CORD, 4), wood);
    line.name = 'cord';
    line.position.y = -CORD / 2;
    swing.add(line);
  }

  // and the chime itself hangs off the bottom of it
  const body = new THREE.Group();
  body.name = 'chime';
  body.position.y = -CORD;
  swing.add(body);

  // the cap the tubes hang from — a shade deeper and more sharply tapered
  // than the first pass (0.1S, barely tapered), so it reads as a small roof
  // over the ring rather than a washer the tubes happen to hang from
  const CAP_H = 0.14 * S;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46 * S, 0.58 * S, CAP_H, 8), wood);
  cap.name = 'cap';
  cap.position.y = -CAP_H / 2;                // top face stays AT the hang point
  body.add(cap);

  // tubes in a ring; the longer the tube the deeper the note — index 0 is the
  // longest, matching the engine's degree mapping. Thickened from the first
  // pass (0.055S — a wire at this length-to-radius ratio) so they read as the
  // metal pipes a real furin hangs, not threads.
  const state = [];
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = S * (1.7 - 0.14 * i);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * S, 0.075 * S, len, 6), metal);
    tube.name = 'tube';
    tube.position.set(Math.cos(angle) * 0.33 * S, -(0.18 * S + len / 2), Math.sin(angle) * 0.33 * S);
    body.add(tube);
    state.push({
      r1: 0.61 + 0.083 * i, r2: 0.44 + 0.037 * i,       // the tube's excitation
      l1: 0.021 + 0.006 * i, l2: 0.034 + 0.004 * i,     // its slow local eddy
      p1: i * 2.17, p2: i * 3.71,
      last: -Infinity, prev: 0,
    });
  }

  // the clapper among the tubes, and the paper tag that catches the wind
  const clapper = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * S, 0.16 * S, 0.03 * S, 8), wood);
  clapper.name = 'clapper';
  clapper.position.y = -0.9 * S;
  // the tanzaku — a long narrow poem-strip, not the stubby rectangle the
  // first pass drew (0.3S x 0.85S, ratio ~2.8:1). Real ones run closer to
  // 4-5:1: narrower, and reaching further past the clapper.
  const tagGeo = new THREE.PlaneGeometry(0.22 * S, 1.0 * S);
  tagGeo.translate(0, -0.5 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.position.y = -0.95 * S;
  body.add(clapper, tag);

  // a forgiving invisible target: a tap wants the chime, not a particular
  // tube. Sized to end exactly at the hang point.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8 * S, 0.8 * S, 2.1 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.position.y = -1.05 * S;
  body.add(hit);

  // a small per-instance offset so two chimes in one scene never move in step
  const off = phase === null ? hash1(3, seed) * 3 : phase;

  let clock = 0;
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;
  const knocked = [];        // { t0, force } of taps still moving it

  function fire(i, force) {
    strikes++;
    lastForce = force;
    if (onStrike) onStrike(i, force);
  }

  // where the tap's swing has the chime right now, on top of the wind's lean
  function swingPose() {
    let a = 0;
    for (const k of knocked) {
      const t = clock - k.t0;
      if (t < 0) continue;
      a += k.force * SWING_A0 * Math.exp(-t / SWING_TAU) * Math.sin(SWING_OMEGA * t);
    }
    return clamp(a, -SWING_MAX, SWING_MAX);
  }

  // total energy still in the swing: 0 at rest, ~SWING_A0 just after one tap
  function swingAmp() {
    let e = 0;
    for (const k of knocked) if (clock >= k.t0) e += k.force * SWING_A0 * Math.exp(-(clock - k.t0) / SWING_TAU);
    return e;
  }

  return {
    group: g,
    pickTargets() { return [hit, tag]; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const tt = clock + off;
      const v = gustPhase(tt);

      // sway follows the REAL gust — the visible cause stays honest — and the
      // tap's swing superposes on top of it as a separate, oscillating term
      while (knocked.length && clock - knocked[0].t0 > 6 * SWING_TAU) knocked.shift();
      const tapped = swingPose();
      swing.rotation.z = v * 0.16 * windLevel + tapped;
      swing.rotation.x = gustPhase(clock * 0.7 + off + 11) * 0.09 * windLevel;
      tag.rotation.y = v * 0.25 * windLevel + tapped * 0.6;

      // strikes follow the chime's own weather, gated by the wind existing
      const act = chimeActivity(tt);
      const gate = Math.min(1, Math.max(0, windLevel));
      for (let i = 0; i < state.length; i++) {
        const tb = state[i];
        const local = (Math.sin(2 * Math.PI * tb.l1 * (tt + tb.p1 * 7))
                     + Math.sin(2 * Math.PI * tb.l2 * (tt + tb.p2 * 5))) / 2;
        const free = act * (0.45 + 0.55 * (0.5 + 0.5 * local));
        const felt = gate * (couple * Math.max(0, v) + (1 - couple) * free);
        const thr = 1 - 0.92 * felt * DENSITY;
        const e = (Math.sin(2 * Math.PI * tb.r1 * (tt + tb.p1))
                 + Math.sin(2 * Math.PI * tb.r2 * (tt + tb.p2))) / 2;
        if (tb.prev <= thr && e > thr && clock - tb.last > REFRACTORY) {
          tb.last = clock;
          fire(i, Math.min(1, 0.45 + 0.7 * felt));
        }
        tb.prev = e;
      }
    },

    // a tap knocks the clapper through two adjacent tubes, whatever the
    // weather, and sets it swinging — which tubes depends deterministically
    // on when you tap
    ring(force = 0.75) {
      knocked.push({ t0: clock, force });
      if (knocked.length > 8) knocked.shift();
      const k = Math.abs(Math.floor(clock * 3)) % state.length;
      fire(k, force);
      fire((k + 1) % state.length, force * 0.7);
    },
    // the pointer passing over: a nudge, not a knock — the same impulse at a
    // fraction of the force, and no strike
    hoverAt() {
      knocked.push({ t0: clock, force: 0.18 });
      if (knocked.length > 8) knocked.shift();
    },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    lastForce() { return lastForce; },
    swingAmp() { return swingAmp(); },
    activity() { return chimeActivity(clock + off); },
  };
}
