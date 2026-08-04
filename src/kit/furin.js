import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';
import { createPendulum, integratePendulum, kickPendulum, pendulumEnergy } from './pendulum.js';

// A wind chime: tubes hung in a ring under a wooden cap, a clapper, a paper
// tag. The VISUAL sway follows the real gust — it is the wind that visibly
// moves it — but the strikes are paced by the chime's own much slower weather
// (chimeActivity). Frank auditioned strikes tied to the audible gust and the
// soundscape breathed in lockstep, too quiet then constant; untied, the brain
// fills in the causality on its own. The wind still GATES it: a stilled scene
// is a silent chime.
//
// Deterministic: the strike weather below is a closed form over the simTime
// handed to update(). The SWING is not closed-form any more — it is a real
// pendulum with its own state (src/kit/pendulum.js) — but it is still fully
// deterministic: the pendulum integrates on a fixed internal substep and
// carries its own remainder, so the pose depends only on total elapsed sim
// time and the sequence of taps, never on how update() gets called across
// frames. This is kit, not audio — the no-Math.random rule applies in full.
// The only audio import is gustPhase, a pure function (the sanctioned
// exception).
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

// THE SWING. A driven, damped pendulum (src/kit/pendulum.js) — a furin is a
// light thing dragging a paper tag through the air, so it swings fast and
// settles fast; the bonshō in kit/bell.js is a heavier, slower thing (a
// separate task will move it onto the same pendulum, at a much longer L and
// a much smaller damping — a tonne of bronze rings a long time).
//
// This replaced a model where the wind curve was read STRAIGHT INTO the
// rotation every frame — no inertia, no restoring force, nothing that could
// ever swing, only ever be positioned (Frank: "it kinda gets held in
// position weirdly"). Before that it was an exponential nudge with no
// oscillating term either, which leaned the chime toward a tap and eased it
// back without ever crossing centre. A real pendulum fixes both at once:
// wind becomes a TORQUE the gravity term has to fight, so a steady wind
// settles the chime at a lean it arrives at by swinging past it first, and a
// tap is a velocity kick rather than a superposed decaying-sine term — see
// ring()/hoverAt() below.

// "Book gravity": src/sim/verlet.js's cloth already uses 9.8 as its own
// tuning constant at this same scene scale (not real gravity — the book's
// units are not metres), so the pendulum reuses that number rather than the
// kit inventing a second "book gravity" that happens to differ for no
// reason.
const GRAVITY = 9.8;

// DAMPING (1/s): a furin is light and drags a paper tag, so it settles
// quickly. Chosen to land close to the old model's decay: for a lightly
// damped oscillator (theta'' + c*theta' + omega0^2*theta = 0) the envelope
// e-folds at tau = 2/c, and the old superposed-impulse model used tau=1.8s —
// c = 2/1.8 reproduces that same settle time under the new model, which is
// a useful reference point, not a hard requirement, since it is genuinely a
// different model now.
const SWING_DAMPING = 2 / 1.8;

// The equilibrium lean (rad) a steady full gust settles the pendulum at, for
// the primary swing plane (Z) and the smaller off-axis wobble (X) — same
// visual scale the old kinematic code drew directly, kept so a default
// fūrin still reads at the size Frank already approved, just arrived at by
// swinging now instead of being placed.
const WIND_Z_LEAN = 0.16;
const WIND_X_LEAN = 0.09;

// TAP_PEAK: the angle (rad) a full-force (1.0) tap swings the chime out to
// on its first arc, matching the old model's SWING_A0. A knock is a
// velocity kick, not a pose, so this gets converted to one per-instance
// below (peak ~= kick / omega0 for a lightly damped oscillator, since the
// kinetic energy at the kick converts to potential energy at the peak).
const TAP_PEAK = 0.13;

// However hard or however often it gets mashed, a fūrin should still read as
// a fūrin and not a windmill. The old model capped the SUMMED pose
// (SWING_MAX); this model has no pose to sum — a tap only ever adds
// velocity — so the equivalent cap is on velocity: whatever hits land,
// omega never exceeds what a real chime's air drag would let it reach. 0.30
// is the fraction of a "one radian per unit omega0" swing that reproduces
// the old SWING_MAX almost exactly at default size (measured: an omega
// capped at 0.30*omega0 tops out around theta=0.30 rad on its first swing).
const SWING_MAX_FRAC = 0.30;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// scratch for reporting a struck tube's world position — shared across all
// furin instances and every fire(), so a strike costs no allocation
const WORLD = new THREE.Vector3();

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

  // The pendulum's LENGTH is the pivot-to-mass-centre distance, derived from
  // geometry already on this object rather than tuned as its own number: the
  // cord's own length (CORD, above) plus roughly six tenths of the way down
  // the tube/clapper cluster below it (the tubes run to about 0.9S and the
  // cap sits above them, so the swinging mass centres around six tenths of
  // that reach). A bigger `size` or a longer `cord` therefore swings slower
  // with nobody tuning a second number — that relationship is the physics,
  // per the brief, and not a free parameter.
  const PEND_L = CORD + 0.6 * S;
  const omega0 = Math.sqrt(GRAVITY / PEND_L);   // small-angle natural frequency
  // torque coefficients: at v=1, windLevel=1, the small-angle equilibrium
  // (g/L)*sin(theta_eq) = torque lands theta_eq at WIND_Z_LEAN / WIND_X_LEAN
  const windZTorque = (GRAVITY / PEND_L) * WIND_Z_LEAN;
  const windXTorque = (GRAVITY / PEND_L) * WIND_X_LEAN;
  const MAX_OMEGA = SWING_MAX_FRAC * omega0;
  // Z is the main swing plane a tap rings; X is the smaller off-axis wobble
  // the old code drove from a phase-shifted, slower copy of the same gust —
  // it never received taps before and does not gain them now.
  const zPend = createPendulum({ length: PEND_L, g: GRAVITY, damping: SWING_DAMPING });
  const xPend = createPendulum({ length: PEND_L, g: GRAVITY, damping: SWING_DAMPING });
  // a tap's velocity kick, scaled so a full-force tap peaks near TAP_PEAK
  // radians on its first swing (see TAP_PEAK above), then clamped so a
  // burst of taps saturates instead of spinning the chime past plausibility
  function tapKick(force) {
    kickPendulum(zPend, force * TAP_PEAK * omega0);
    zPend.omega = clamp(zPend.omega, -MAX_OMEGA, MAX_OMEGA);
  }

  // tubes in a ring; the longer the tube the deeper the note — index 0 is the
  // longest, matching the engine's degree mapping. Thickened from the first
  // pass (0.055S — a wire at this length-to-radius ratio) so they read as the
  // metal pipes a real furin hangs, not threads.
  const state = [];
  const sleeves = [];
  const single = tubes === 1;
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = S * (1.7 - 0.14 * i);
    // A lone tube hangs on the axis. A ring of one is not a ring — it is a
    // tube mysteriously offset from the cord holding it up.
    const rx = single ? 0 : Math.cos(angle) * 0.33 * S;
    const rz = single ? 0 : Math.sin(angle) * 0.33 * S;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * S, 0.075 * S, len, 6), metal);
    tube.name = 'tube';
    tube.position.set(rx, -(0.18 * S + len / 2), rz);
    body.add(tube);

    // A tube is a wire at this scale — far too thin to hit on a phone. Each
    // gets a forgiving invisible sleeve, and the sleeve is what says which
    // tube it is: one tap, one tube, one tone.
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.20 * S, 0.20 * S, len * 1.05, 6),
      new THREE.MeshBasicMaterial({ visible: false }));
    sleeve.name = 'tube-hit';
    sleeve.userData.noOutline = true;
    sleeve.userData.tube = i;
    sleeve.position.copy(tube.position);
    body.add(sleeve);
    sleeves.push(sleeve);

    state.push({
      r1: 0.61 + 0.083 * i, r2: 0.44 + 0.037 * i,       // the tube's excitation
      l1: 0.021 + 0.006 * i, l2: 0.034 + 0.004 * i,     // its slow local eddy
      p1: i * 2.17, p2: i * 3.71,
      last: -Infinity, prev: 0,
      mesh: tube,
    });
  }

  // the cap the tubes hang from — a shade deeper and more sharply tapered
  // than the first pass (0.1S, barely tapered), so it reads as a small roof
  // over the ring rather than a washer the tubes happen to hang from. Over a
  // single tube it shrinks to read as the knot the cord ties to, not a roof
  // over a ring that does not exist.
  const CAP_H = single ? 0.08 * S : 0.14 * S;
  const capR = single ? 0.16 * S : 0.46 * S;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR * 1.26, CAP_H, 8), wood);
  cap.name = 'cap';
  cap.position.y = -CAP_H / 2;                // top face stays AT the hang point
  body.add(cap);

  // the clapper among the tubes, and the paper tag that catches the wind.
  // For a ring, the clapper sits at the centre and every tube is offset
  // 0.33S clear of it. Code review caught that the single-tube variant left
  // the clapper on the SAME axis as the one tube it hangs on — a 0.16S disc
  // impaled on a 0.075S cylinder rather than hanging beside it where it
  // could plausibly strike it. Nudge the clapper (and the tag paired with
  // it) off-axis by enough to clear both radii with margin.
  const clapperR = 0.16 * S;
  const clapperOff = single ? clapperR + 0.075 * S + 0.065 * S : 0;
  const clapper = new THREE.Mesh(new THREE.CylinderGeometry(clapperR, clapperR, 0.03 * S, 8), wood);
  clapper.name = 'clapper';
  clapper.position.set(clapperOff, -0.9 * S, 0);
  // the tanzaku — a long narrow poem-strip, not the stubby rectangle the
  // first pass drew (0.3S x 0.85S, ratio ~2.8:1). Real ones run closer to
  // 4-5:1: narrower, and reaching further past the clapper.
  const tagGeo = new THREE.PlaneGeometry(0.22 * S, 1.0 * S);
  tagGeo.translate(0, -0.5 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.userData.tube = null;           // the whole chime, not any one tube
  tag.position.set(clapperOff, -0.95 * S, 0);
  body.add(clapper, tag);

  // a forgiving invisible target: a tap wants the chime, not a particular
  // tube. Sized to end exactly at the hang point. A single tube has no ring
  // to spread — its farthest reach is the offset clapper, not a 0.8S ring —
  // so the drum shrinks with it rather than leaving a wide empty halo of
  // "whole chime" around one thin tube.
  const hitR = single ? clapperOff + clapperR + 0.08 * S : 0.8 * S;
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitR, hitR, 2.1 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.userData.tube = null;           // the whole chime, not any one tube
  hit.position.y = -1.05 * S;
  body.add(hit);

  // a small per-instance offset so two chimes in one scene never move in step
  const off = phase === null ? hash1(3, seed) * 3 : phase;

  let clock = 0;
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;

  function fire(i, force) {
    strikes++;
    lastForce = force;
    if (onStrike) {
      // REUSED vector — the engine reads x/y/z synchronously. A caller that
      // wants to keep it must clone it.
      state[i].mesh.getWorldPosition(WORLD);
      onStrike(i, force, WORLD);
    }
  }

  return {
    group: g,
    // Every pickable surface. NOTE: array order here does NOT decide what a
    // single input.raycastFirst(camera, pickTargets()) call resolves to —
    // that calls THREE's ray.intersectObjects, which sorts by DISTANCE, and
    // the whole-chime drum is a convex hex prism that contains every sleeve,
    // so a ray reaching a sleeve always pierces the drum's nearer face first.
    // A prior version of this comment claimed "tubes first... more specific
    // wins," which a real THREE.Raycaster proved false (tests/furin.test.js,
    // 'a real ray aimed at a specific tube...'). Use pick() below, which
    // resolves this correctly by raycasting the sleeves in their own call
    // before falling back to the whole-chime targets.
    pickTargets() { return [...sleeves, hit, tag]; },
    // Two-stage pick, done here rather than by every case (kit reuse rule):
    // probe the tubes ALONE first — any hit there is unambiguous, a ray that
    // geometrically touches a sleeve — and only fall back to the forgiving
    // whole-chime targets (drum, tag) on a miss. Returns null on no touch,
    // or { tube } where tube is an index for a tube or null for the whole
    // chime grabbed at once (cap, tag).
    pick(camera, input) {
      const t = input.raycastFirst(camera, sleeves);
      if (t) return { tube: t.object.userData.tube };
      const w = input.raycastFirst(camera, [hit, tag]);
      return w ? { tube: null } : null;
    },

    update(dt, simTime) {
      const prevClock = clock;
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      // The pendulum advances by however much the CLOCK actually moved, not
      // by the dt argument — same "closed form over simTime" reasoning as
      // the rest of this file, extended to the one piece of state here that
      // is not closed-form. max(0, ...) guards the integrator against ever
      // seeing negative elapsed time from a caller that repeats or rewinds
      // simTime (both happen in tests); integratePendulum itself is what
      // folds this into the fixed substep that keeps it deterministic
      // regardless of how a caller chops it up (src/kit/pendulum.js).
      const elapsed = Math.max(0, clock - prevClock);
      const tt = clock + off;
      const v = gustPhase(tt);

      // wind is a TORQUE now, not a position — see THE SWING above. Each
      // axis reads gustPhase at its own (per-instance) phase offset so two
      // fūrin never sway in lockstep; X mirrors the old code's slower,
      // shifted copy of the same gust (never received taps before, still
      // does not).
      integratePendulum(zPend, elapsed, (t) => windZTorque * gustPhase(t + off) * windLevel);
      integratePendulum(xPend, elapsed, (t) => windXTorque * gustPhase(t * 0.7 + off + 11) * windLevel);
      swing.rotation.z = zPend.theta;
      swing.rotation.x = xPend.theta;
      // the tag keeps its own independent flutter in the wind, plus an echo
      // of the main swing (taps and wind-lean both show up in zPend.theta)
      tag.rotation.y = v * 0.25 * windLevel + zPend.theta * 0.6;

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

    // A tap sets it swinging and rings ONE tube. Naming a tube is how a case
    // says which one was touched (read hit.object.userData.tube); a null tube
    // is the whole chime grabbed at once, and picks deterministically by when.
    // The knock is a VELOCITY kick (tapKick, above) — what a real knock
    // physically is — not a pose superposed on top of one.
    ring(force = 0.75, tube = null) {
      tapKick(force);
      const k = Number.isInteger(tube)
        ? ((tube % state.length) + state.length) % state.length
        : Math.abs(Math.floor(clock * 3)) % state.length;
      fire(k, force);
    },
    // the pointer passing over: a nudge, not a knock — the same kick at a
    // fraction of the force, and no strike
    hoverAt() {
      tapKick(0.18);
    },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    lastForce() { return lastForce; },
    // mechanical energy still in the main swing: 0 at rest, positive
    // whenever it is displaced and/or moving (src/kit/pendulum.js)
    swingAmp() { return pendulumEnergy(zPend); },
    activity() { return chimeActivity(clock + off); },
  };
}
