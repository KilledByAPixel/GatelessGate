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
const NUDGE_TAU = 0.5;

export function makeFurin({ size = 0.17, tubes = 5, seed = 5, phase = null, couple = 0, onStrike = null } = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  const wood = toonMaterial({ color: WASH.dark, flat: true });
  const metal = toonMaterial({ color: WASH.stone });

  // the cap the tubes hang from
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * S, 0.55 * S, 0.1 * S, 8), wood);
  cap.name = 'cap';
  cap.position.y = -0.05 * S;
  swing.add(cap);

  // tubes in a ring; the longer the tube the deeper the note — index 0 is the
  // longest, matching the engine's degree mapping
  const state = [];
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = S * (1.7 - 0.14 * i);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * S, 0.055 * S, len, 6), metal);
    tube.name = 'tube';
    tube.position.set(Math.cos(angle) * 0.33 * S, -(0.18 * S + len / 2), Math.sin(angle) * 0.33 * S);
    swing.add(tube);
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
  const tagGeo = new THREE.PlaneGeometry(0.3 * S, 0.85 * S);
  tagGeo.translate(0, -0.425 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.position.y = -0.95 * S;
  swing.add(clapper, tag);

  // a forgiving invisible target: a tap wants the chime, not a particular
  // tube. Sized to end exactly at the hang point.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8 * S, 0.8 * S, 2.1 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.position.y = -1.05 * S;
  swing.add(hit);

  // a small per-instance offset so two chimes in one scene never move in step
  const off = phase === null ? hash1(3, seed) * 3 : phase;

  let clock = 0;
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;
  let nudgeAt = -Infinity;

  function fire(i, force) {
    strikes++;
    lastForce = force;
    if (onStrike) onStrike(i, force);
  }

  return {
    group: g,
    pickTargets() { return [hit, tag]; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const tt = clock + off;
      const v = gustPhase(tt);

      // sway follows the REAL gust — the visible cause stays honest
      // (before the first nudge this is exp(-Infinity) === 0, so it costs nothing)
      const nudge = Math.exp(-(clock - nudgeAt) / NUDGE_TAU) * 0.035;
      swing.rotation.z = v * 0.16 * windLevel + nudge;
      swing.rotation.x = gustPhase(clock * 0.7 + off + 11) * 0.09 * windLevel;
      tag.rotation.y = v * 0.25 * windLevel + 0;

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
    // weather — which tubes depends deterministically on when you tap
    ring(force = 0.75) {
      nudgeAt = clock;
      const k = Math.abs(Math.floor(clock * 3)) % state.length;
      fire(k, force);
      fire((k + 1) % state.length, force * 0.7);
    },
    hoverAt() { nudgeAt = clock; },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    lastForce() { return lastForce; },
    activity() { return chimeActivity(clock + off); },
  };
}
