import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';

// A furin: the small glass wind bell hung under an eave, with a clapper and a
// paper tag. It rings when the wind ACTUALLY gusts — the threshold is on the
// same envelope that drives the wind synth, so what you hear and what you see
// are the same weather. Decoration would have been a timer; this is causality.
//
// Everything is a closed form over the simTime handed to update(), so the pose
// and the ring history are identical every run: this is kit, not audio, and the
// determinism rule applies in full.
//
// The group's origin is the HANG POINT. All geometry lives below y=0, so a case
// positions it by where it should hang FROM.

export const RING_THRESHOLD = 0.45;   // measured: crests 13-30s apart, no dead air
const REARM = 0.05;                   // hysteresis, so a jittery crest can't double-fire
const MIN_WIND = 0.02;                // below this the chime is silent, not merely quiet
const NUDGE_TAU = 0.5;

export function makeFurin({ size = 0.17, seed = 5, color = WASH.stone, phase = null, onRing = null } = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  const glass = toonMaterial({ color });
  const dark = toonMaterial({ color: WASH.dark, flat: true });

  // the bell: a rounder, wider-mouthed profile than the bonsho's, crown at y=0
  // and mouth at -S, so the whole thing hangs from the origin
  const P = [
    [0.000, 0.10], [0.42, 0.06], [0.50, 0.00], [0.46, 0.16], [0.40, 0.36],
    [0.30, 0.58], [0.16, 0.80], [0.06, 0.94], [0.000, 1.00],
  ].map(([r, y]) => new THREE.Vector2(r * S, (y - 1) * S));
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 12), glass);
  body.name = 'body';
  swing.add(body);

  // the clapper, on its thread, hanging just inside the mouth
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * S, 0.012 * S, 0.62 * S, 4), dark);
  thread.name = 'thread';
  thread.position.y = -0.55 * S;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.10 * S, 8, 6), dark);
  clapper.name = 'clapper';
  clapper.position.y = -0.88 * S;
  swing.add(thread, clapper);

  // the paper tag below it — the part that actually catches the wind
  const tagGeo = new THREE.PlaneGeometry(0.34 * S, 0.9 * S);
  tagGeo.translate(0, -0.45 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.position.y = -0.95 * S;
  swing.add(tag);

  // a forgiving invisible target: a tap wants the chime, not a particular facet
  // Sized to end exactly at the hang point: the drum must cover the bell and the
  // tag without poking up through the eave it hangs from.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9 * S, 0.9 * S, 2.0 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.position.y = -1.0 * S;
  swing.add(hit);

  // A per-instance phase offset, so two chimes in one scene never ring together.
  // The gust is global; only where each chime sits in it differs.
  const off = phase === null ? hash1(3, seed) * 20 : phase;

  let clock = 0;
  let windLevel = 1;
  let rings = 0;
  let lastGain = 0;
  let armed = true;
  let nudgeAt = -Infinity;

  function fire(gain) {
    rings++;
    lastGain = gain;
    if (onRing) onRing(gain);
  }

  return {
    group: g,
    body,
    pickTargets() { return [hit, body, tag]; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const v = gustPhase(clock + off);

      // sway: the tag and bell lean with the breeze, on the same envelope
      // before the first nudge this is exp(-Infinity) === 0, so it costs nothing
      const nudge = Math.exp(-(clock - nudgeAt) / NUDGE_TAU) * 0.035;
      swing.rotation.z = v * 0.16 * windLevel + nudge;
      swing.rotation.x = gustPhase(clock * 0.7 + off + 11) * 0.09 * windLevel;
      tag.rotation.y = v * 0.25;

      if (v > RING_THRESHOLD) {
        if (armed && windLevel > MIN_WIND) {
          armed = false;
          // louder on a stronger crest, and scaled by the wind the case asked for
          const crest = (v - RING_THRESHOLD) / (1 - RING_THRESHOLD);
          fire(Math.min(1, windLevel) * (0.6 + 0.4 * crest));
        }
      } else if (v < RING_THRESHOLD - REARM) {
        armed = true;
      }
    },

    // a tap rings it whatever the weather is doing
    ring(gain = 0.75) { nudgeAt = clock; fire(gain); },
    hoverAt() { nudgeAt = clock; },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    rings() { return rings; },
    lastGain() { return lastGain; },
    gust() { return gustPhase(clock + off); },
  };
}
