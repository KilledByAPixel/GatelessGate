import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { WASH } from '../palette.js';
import { createPendulum, integratePendulum, kickPendulum, pendulumEnergy } from './pendulum.js';

// The large hanging cylinder (task-cylinder-brief.md): waist-high bronze,
// one note, struck by its OWN clapper rather than a paper sail or a
// neighbour. Frank: "those only play one single note, and occasionally, if
// they get knocked by the wind, they will play one of those notes."
//
// THE IDEA. A clapper hung inside a swinging cylinder is a SECOND pendulum
// with its own length and therefore its own natural period. Both are driven
// by the same wind (src/kit/pendulum.js, the same equation the fūrin swings
// by), but a different period means a different response to the same slow
// gust — so the two drift in and out of phase on their own. When their
// relative angle crosses the physical clearance between clapper and wall,
// they touch and the cylinder rings. No random number, no scheduled
// weather, no threshold hack — "occasionally, if they get knocked by the
// wind" falls out of the physics.
//
// TWO PENDULUMS, NOT A DOUBLE PENDULUM. A real clapper's own mount rides
// inside the swinging body, which would make this a true double pendulum —
// chaotic, and much harder to reason about or keep deterministic-by-
// construction. This models both as independent single pendulums hanging
// from (approximately) the same point instead: cylPend is the whole body,
// clapPend is the clapper, each obeying its own theta'' = -(g/L)sin(theta)
// - c*theta' + torque with no back-reaction between them. That is the
// simplification the brief asks for ("the two swing independently") and it
// is what keeps this file's physics as auditable as the fūrin's.
//
// Deterministic and Node-testable exactly like furin.js: no Math.random,
// the pendulums integrate on their own fixed substep and carry their own
// remainder, and the only audio import is gustPhase (a pure function, the
// sanctioned exception).
//
// The group's origin is the HANG POINT: all geometry below y=0, so a case
// positions it by where it hangs FROM — same contract as makeFurin.

const GRAVITY = 9.8;   // "book gravity" — see furin.js's own comment; reused, not reinvented
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// THE PERIOD RATIO. "Give the clapper a shorter length than the cylinder...
// it wants to be irrational-ish rather than a neat 2:1, or the two will
// lock in phase and either never ring or ring every swing." The golden
// ratio's reciprocal is the standard answer to "least lockable irrational" —
// it is the number worst-approximated by any rational, which is exactly
// KAM theory's condition for two coupled oscillators to resist settling
// into a repeating beat. 1/phi ~= 0.618: the clapper's period is that
// fraction of the cylinder's. Closed form, not a magic decimal.
const PHI = (1 + Math.sqrt(5)) / 2;
const PERIOD_RATIO = 1 / PHI;

// DAMPING (1/s), e-folding tau = 2/c (see furin.js's SWING_DAMPING comment
// for the derivation). The cylinder is a mass of bronze, heavier than a
// fūrin's tubes-and-tag (tau 1.8s) and heavier than the bonshō's own swing
// envelope (bell.js's TAU 1.35s is an impulse envelope, not this kind of
// damping, but it is the same "big and slow" object this cylinder answers
// to) — tau 3.5s settles noticeably slower. The clapper is lighter and rides
// inside the body rather than out in the open air, so it settles faster,
// tau 2.2s — still slower than a fūrin tube, since it is a solid knocker,
// not a paper tag.
const CYL_DAMPING = 2 / 3.5;
const CLAP_DAMPING = 2 / 2.2;

// WIND LEAN (rad): the equilibrium angle a full, steady gust settles each
// pendulum at (see furin.js's WIND_Z_LEAN for the same identity). Chosen by
// simulation, not eyeballed: swept against GAP_ANGLE below (see
// cylinder-report.md's tuning table) for a rate that reads as "occasionally,
// if knocked by the wind" — tens of strikes an hour, not one every few
// swings and not one a week. The clapper's own lean is larger than the
// cylinder's: it is the lighter of the two, so the same wind torque
// coefficient formula ((g/L)*lean) needs a bigger lean to move a comparably
// light mass enough to matter.
const WIND_LEAN_CYL = 0.07;
const WIND_LEAN_CLAP = 0.11;

// The clapper's torque reads gustPhase at a DIFFERENT reading of the same
// gust — same trick furin.js's xPend uses (*0.7, +11) to keep two things
// driven by "the same wind" from moving in lockstep. It matters more here
// than it does there: measured directly (see cylinder-report.md), feeding
// both pendulums the identical gustPhase(t) produces ZERO strikes over a
// full simulated hour, at any of the lean pairs tried. The reason is
// quasi-static: gustPhase's own frequencies (furin.js's GUST_A/GUST_B) are
// far slower than either pendulum's natural frequency, so each pendulum
// nearly TRACKS its equilibrium angle lean*gustPhase(t) rather than
// oscillating independently of it — and with the same gustPhase(t) driving
// both, their difference is just (leanCyl-leanClap)*gustPhase(t), bounded
// by a constant that never reaches GAP_ANGLE. Two different periods alone
// do not desynchronize two pendulums that are fed the identical signal; they
// need the identical signal's PHASE to differ too.
const CLAP_GUST_RATE = 0.7;
const CLAP_GUST_OFFSET = 11;

// REFRACTORY: a contact cannot re-trigger every frame while the pendulums
// are still overlapping past GAP_ANGLE — same purpose as furin's per-tube
// REFRACTORY, sized the same order of magnitude since it is answering the
// same question (how long can one touch plausibly still be "the same
// touch").
const REFRACTORY = 0.5;

// A tap is a shove: a velocity kick to the CLAPPER (not the body), so the
// very same relative-angle contact check that the wind uses is what fires
// the strike — "by the same mechanism," per the brief, not a separate
// play-the-sound-now path. Sized so a full-force tap crosses GAP_ANGLE
// (~0.098 rad) within a couple of frames: GAP_ANGLE / TAP_KICK ~= 0.04s.
const TAP_KICK = 2.5;
const MAX_CLAP_OMEGA = 3 * TAP_KICK;   // mashing taps saturates, as in furin.js

// UNDERSTOOD CONSEQUENCE: TAP_KICK sits roughly 30x FORCE_OMEGA_REF (below),
// so essentially any deliberate tap (ring()'s default force 0.75, even
// hoverAt's 0.25) reaches the wall fast enough to saturate the reported
// strike force at 1 — a tap always rings clearly, never as a graze. That
// reads as correct rather than as a bug: a tap is a deliberate touch, not
// weather, and furin.js's own ring() has the same character (it reports the
// CALLER's force directly, with no physics in between at all). The "hard
// meeting vs a graze" dynamic range this file's force law provides is real,
// it just lives almost entirely in the WIND-driven contacts, where relOmega
// naturally spans well below FORCE_OMEGA_REF up to it (see
// cylinder-report.md's measured distribution) — which is the case the
// brief's "a gust feels different from a breeze" is actually about.

// FORCE NORMALISATION. "Strike force should scale with the relative angular
// VELOCITY at contact." REF is chosen from the same tuning run: the 90th
// percentile of contact relative-velocity was ~0.037 rad/s and the observed
// max ~0.15 rad/s (cylinder-report.md) — 0.08 lands most wind strikes in the
// low-to-middle of the range with real headroom, so only a genuinely hard
// beat pins force at 1, and a graze (small relOmega) reports close to 0.
// Deliberately no floor, unlike furin's tapKick force: "a graze barely
// sounds" is the point, not a defect to pad away.
const FORCE_OMEGA_REF = 0.08;

// NOTE FROM SIZE. "Size and pitch must move together... derive one from the
// other rather than letting a case set both and contradict itself." A
// bigger cylinder gets a LOWER note: NOTE_SPAN scale-degree steps spread
// across the brief's own stated size range (0.6-1.0, "waist-high"), so the
// full range of plausible sizes covers one octave of this book's five-note
// scale (NOTE_SPAN=5) end to end. Integer, because the engine's chime
// voices are addressed by scale degree, not raw Hz (see
// audio/engine.js's cylinderStrike).
const SIZE_MIN = 0.6, SIZE_MAX = 1.0, NOTE_SPAN = 5;
export function noteForSize(size) {
  // -0 guard: at size===SIZE_MIN the raw round is 0, and negating a literal
  // 0 in JS produces -0 — harmless as a scale-degree offset (hz(-0) reads
  // identically to hz(0)) but a needless surprise for anything that
  // compares this against a plain 0 with strict equality.
  const steps = Math.round(NOTE_SPAN * (size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN));
  return steps === 0 ? 0 : -steps;
}

// Pure, exported so tests/cylinder.test.js can pin the scaling law itself
// (monotonic, clamped, zero at zero) independently of the physics that
// feeds it a relOmega.
export function forceForRelOmega(relOmega) {
  return clamp(Math.abs(relOmega) / FORCE_OMEGA_REF, 0, 1);
}

// scratch for reporting the struck body's world position — shared across
// every instance and every fire(), so a strike costs no allocation (same
// pattern as furin.js's WORLD)
const WORLD = new THREE.Vector3();

export function makeCylinderChime({
  size = 0.8, seed = 11, phase = null, onStrike = null,
  cord = 0.30,              // the hanging string, in units of size; 0 for none
  color = WASH.stone,        // bronze — a case that wants this AS the seal can pass ACCENT
} = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'cylinder-chime';

  const wood = toonMaterial({ color: WASH.dark, flat: true });
  const bronze = toonMaterial({ color, flat: true });

  const swing = new THREE.Group();   // the whole body, pivoting at the hang point
  swing.name = 'swing';
  g.add(swing);

  const CORD = cord * S;
  if (CORD > 0) {
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02 * S, 0.02 * S, CORD, 4), wood);
    line.name = 'cord';
    line.position.y = -CORD / 2;
    swing.add(line);
  }

  // a small loop the cord ties to — the same tapered-cap vocabulary as
  // furin.js's cap, shrunk to read as a fitting rather than a roof, since
  // there is no ring of tubes here for it to cover
  const CAP_H = 0.07 * S, CAP_R = 0.14 * S;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R, CAP_R * 1.2, CAP_H, 8), wood);
  cap.name = 'cap';
  cap.position.y = -CORD - CAP_H / 2;
  swing.add(cap);

  // THE BODY. A single tapered cylinder — a waist-high bronze tube, mouth
  // wider than crown the way a bonshō's IS (bell.js's lathe profile does
  // the same flare with many more control points; this stays to the
  // brief's "keep it simple," one mesh, two radii). Top radius sits under
  // the cap's own footprint so the join reads as continuous metal.
  const BODY_LEN = 0.85 * S, BODY_R = 0.15 * S;
  const bodyTopY = -CORD - CAP_H;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(BODY_R * 0.82, BODY_R, BODY_LEN, 10), bronze);
  body.name = 'body';
  body.position.y = bodyTopY - BODY_LEN / 2;
  swing.add(body);

  // a forgiving invisible target sized around the body, wider than the
  // bronze itself so a tap on a phone still lands
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(BODY_R * 1.6, BODY_R * 1.6, BODY_LEN * 1.15, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'cylinder-hit';
  hit.userData.noOutline = true;
  hit.position.y = bodyTopY - BODY_LEN / 2;
  swing.add(hit);

  // THE CLAPPER. Its own pivot group, independent of `swing` — it does NOT
  // ride inside the body's rotation, because that would make this a real
  // (chaotic) double pendulum instead of the two-independent-pendulums
  // model this file commits to (see the header comment). It hangs at
  // CONTACT_Y below the SAME origin the body swings from.
  //
  // CONTACT_Y is a purely geometric choice — where the clapper visually
  // sits and where contact is measured — kept deliberately separate from
  // L_clap (the pendulum length that sets the clapper's natural frequency,
  // below). Forcing them to be the same number was tried first: solving for
  // a cord length that puts a golden-ratio-period clapper deep enough in
  // the tube to look right has no positive solution (L_clap grows only
  // 0.38x as fast as CONTACT_Y needs to, for any cord length — see
  // cylinder-report.md). Two honestly-separate eyeballed numbers, the same
  // spirit as furin.js's own acknowledged COM fraction, beat one number
  // that cannot satisfy both jobs at once.
  const CONTACT_Y = (CORD + CAP_H) + 0.65 * BODY_LEN;   // 65% down the tube, well inside it
  const CLAP_R = 0.06 * S;
  const clapperPivot = new THREE.Group();
  clapperPivot.name = 'clapper-pivot';
  g.add(clapperPivot);
  const clapper = new THREE.Mesh(new THREE.CylinderGeometry(CLAP_R, CLAP_R, 0.03 * S, 8), wood);
  clapper.name = 'clapper';
  clapper.position.y = -CONTACT_Y;
  clapperPivot.add(clapper);

  // THE PHYSICS LENGTHS. L_cyl is a real derivation, not an eyeball: a
  // uniform cylinder's own centre of mass sits at exactly half its length,
  // so cord-to-COM is CORD + 0.5*BODY_LEN with nothing tuned. L_clap is a
  // free frequency knob (see CONTACT_Y's comment above for why it is not
  // also the render depth), set by PERIOD_RATIO so the two natural periods
  // differ by the golden ratio.
  const L_cyl = CORD + 0.5 * BODY_LEN;
  const L_clap = L_cyl * PERIOD_RATIO * PERIOD_RATIO;   // period ratio squared -> length ratio

  // GAP_ANGLE: the clapper's own radius plus the body's, projected to an
  // angle at the clapper's contact depth. The body mesh has no modelled
  // wall thickness (it is solid, low-poly), so clearance is measured
  // against its own outer radius directly — simple, and it slightly
  // OVERSTATES the true bronze-lined gap, never understates it, so it never
  // reports a touch that could not physically happen.
  const GAP_LINEAR = (BODY_R - CLAP_R) * 0.9;
  const GAP_ANGLE = GAP_LINEAR / CONTACT_Y;

  const cylPend = createPendulum({ length: L_cyl, g: GRAVITY, damping: CYL_DAMPING });
  const clapPend = createPendulum({ length: L_clap, g: GRAVITY, damping: CLAP_DAMPING });
  const windCylTorque = (GRAVITY / L_cyl) * WIND_LEAN_CYL;
  const windClapTorque = (GRAVITY / L_clap) * WIND_LEAN_CLAP;

  const note = noteForSize(S);

  // a small per-instance offset so two cylinders in one scene never move in
  // step — same role as furin's `off`
  const off = phase === null ? hash1(4, seed) * 3 : phase;

  let clock = null;        // null until the first update() — see the seeding below
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;
  let lastAbsRel = 0;       // for edge-detecting a fresh contact, not a continuing overlap
  let lastStrikeAt = -Infinity;

  // A tap's velocity kick — see TAP_KICK's own comment for the sizing.
  // Shared by ring() and hoverAt() below, same split furin.js uses.
  function tapKick(force) {
    kickPendulum(clapPend, force * TAP_KICK);
    clapPend.omega = clamp(clapPend.omega, -MAX_CLAP_OMEGA, MAX_CLAP_OMEGA);
  }

  function fire(force) {
    strikes++;
    lastForce = force;
    lastStrikeAt = clock;
    if (onStrike) {
      body.getWorldPosition(WORLD);
      onStrike(note, force, WORLD);
    }
  }

  return {
    group: g,
    pickTargets() { return [hit, body]; },
    // A single voice, so there is nothing to disambiguate the way furin's
    // per-tube pick() does — any hit on the drum or the bronze itself rings
    // the one note this instance has.
    pick(camera, input) {
      return input.raycastFirst(camera, [hit, body]) ? true : null;
    },

    update(dt, simTime) {
      if (clock === null) {
        // SEED, don't start at 0 — the fix furin.js shipped two commits ago
        // for the same reason: simTime is main.js's GLOBAL clock and never
        // resets across koan entries, so a cylinder built deep into a
        // session would otherwise integrate the ENTIRE elapsed session on
        // its first frame at the fixed 1/240 substep (measured on furin at
        // case 29's scale: 575ms at simTime=3600s, landing on the page-turn
        // dissolve). Seeding both pendulums' OWN .clock to the same value
        // is not optional either — see pendulum.js's comment on why a
        // skipped seed there desyncs the torque forever, not just at the
        // start.
        const seed0 = Number.isFinite(simTime) ? simTime : 0;
        clock = seed0;
        cylPend.clock = seed0;
        clapPend.clock = seed0;
      }
      const prevClock = clock;
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const elapsed = Math.max(0, clock - prevClock);

      // `t` in each callback is the PENDULUM's own p.clock, seeded above to
      // track this file's absolute `clock` (furin.js's same pattern, and
      // the same reason: torqueAt must read gustPhase at a clock that stays
      // locked to the one strikes/rendering read, not an independent
      // time-since-creation). `off` is the per-instance offset; the
      // clapper's extra `*CLAP_GUST_RATE, +CLAP_GUST_OFFSET` is the
      // different-reading-of-the-same-gust decorrelation explained above.
      integratePendulum(cylPend, elapsed, (t) => windCylTorque * gustPhase(t + off) * windLevel);
      integratePendulum(clapPend, elapsed,
        (t) => windClapTorque * gustPhase(t * CLAP_GUST_RATE + off + CLAP_GUST_OFFSET) * windLevel);
      swing.rotation.z = cylPend.theta;
      clapperPivot.rotation.z = clapPend.theta;

      // CONTACT: a fresh crossing of GAP_ANGLE, not a continuing overlap —
      // edge-detected on the real integrated angle (unlike furin's
      // synthetic-oscillator threshold, this one is the actual physical
      // relative angle, so a plain rising-edge check is exact, not a
      // stand-in for one).
      const relTheta = cylPend.theta - clapPend.theta;
      const absRel = Math.abs(relTheta);
      if (lastAbsRel <= GAP_ANGLE && absRel > GAP_ANGLE && clock - lastStrikeAt > REFRACTORY) {
        fire(forceForRelOmega(cylPend.omega - clapPend.omega));
      }
      lastAbsRel = absRel;
    },

    // A tap: a shove to the CLAPPER, the same mechanism a gust uses — see
    // TAP_KICK's own comment. Rings through the SAME contact check above on
    // the next update(), not a separate "play now" path.
    ring(force = 0.75) { tapKick(force); },
    // the pointer passing over: a nudge, not a knock — same shape as
    // furin's hoverAt(), a fraction of a tap's force through the same path
    hoverAt() { tapKick(0.25); },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    lastForce() { return lastForce; },
    note() { return note; },
    // mechanical energy still in each pendulum: 0 at rest — exposed for the
    // same reason furin's swingAmp() is, debug/tests reading "is this thing
    // actually moving" without reaching into private state
    swingAmp() { return pendulumEnergy(cylPend); },
    clapperAmp() { return pendulumEnergy(clapPend); },
    // Node-testable introspection: the two natural periods (seconds) and the
    // contact threshold, read off the SAME state the physics runs on rather
    // than recomputed from copied constants — see tests/cylinder.test.js.
    periods() {
      return {
        cyl: 2 * Math.PI * Math.sqrt(L_cyl / GRAVITY),
        clap: 2 * Math.PI * Math.sqrt(L_clap / GRAVITY),
      };
    },
    gapAngle() { return GAP_ANGLE; },
  };
}
