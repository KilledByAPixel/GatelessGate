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

// SWING TUNING — live, not frozen. Every number below used to be tuned
// to MATCH THE OLD MODEL: SWING_DAMPING's tau=1.8s reproduced the old
// superposed-impulse decay, TAP_PEAK=0.13 rad reproduced the old SWING_A0,
// SWING_MAX_FRAC=0.30 reproduced the old SWING_MAX position clamp. That was
// the wrong target — the old model is the BROKEN thing this pendulum
// replaced (Frank: "it kinda gets held in position weirdly"), so tuning the
// new, correct physics to sound like the old, wrong physics just re-imported
// the old physics's amplitudes wearing a real equation. Frank's actual
// complaint, once the pendulum shipped: "they don't really swing like I'd
// expect them to with gravity. They're very slow. Like they have a lot of
// dampening" — a 7.4-degree tap and a two-swing settle reads as heavily
// damped no matter how correct theta'' = -(g/L)sin(theta) - c*theta' +
// torque is underneath it.
//
// Exported as a mutable object, not individual consts, so
// dev/hanging-audition.html can write straight into it (SPATIAL's own
// pattern in src/audio/spatial.js — the object binding stays const, its
// fields don't) and hear the very next tap change, no reload. update() below
// re-reads `damping` every frame and tapKick() re-reads `tapPeak`/
// `maxOmegaFrac` every call, rather than baking them into the pendulum at
// construction, so a slider takes effect on an ALREADY-hanging chime, not
// just the next one built.
//
// STARTING POINTS, not final values — the brief is explicit that the owner
// settles these by eye/ear through the harness, the way the bell's own
// voice was settled after two guesses missed. Chosen to be UNAMBIGUOUSLY
// bigger/longer than the old numbers so the harness starts from "too much"
// rather than "still too little, is this even different":
//   tapPeak 0.13 -> 0.55 rad (~31.5 degrees) — over 4x the old kick; a solid,
//     visible arc on a full-force tap rather than a flinch.
//   damping tau 1.8s -> 4.5s (c = 2/4.5) — well over double the ring-out;
//     several visible swings before it settles rather than two.
//   maxOmegaFrac 0.30 -> 0.85 — has to clear the new tapPeak (see MAX_OMEGA's
//     own comment below) with real headroom for a couple of stacked taps,
//     not just barely avoid clipping the first one.
export const SWING = {
  tapPeak: 0.55,
  damping: 2 / 4.5,
  maxOmegaFrac: 0.85,
};

// The equilibrium lean (rad) a steady full gust settles the pendulum at, for
// the primary swing plane (Z) and the smaller off-axis wobble (X) — same
// visual scale the old kinematic code drew directly, kept so a default
// fūrin still reads at the size Frank already approved, just arrived at by
// swinging now instead of being placed. Not part of this task's "open it up"
// list (the brief names tap kick, damping, and the swing cap only) — wind
// lean is already live per-instance via setWindLevel(), so there is nothing
// frozen here to open.
const WIND_Z_LEAN = 0.16;
const WIND_X_LEAN = 0.09;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// NOTE FROM SIZE — the single-tube variant only (task-swing-tune-brief.md,
// PROBLEM 1: "In twenty nine, there are three wind chimes that play
// different sounds... but the actual size of them doesn't change"). A
// tubes:1 chime always reports tube index 0 — there is only one tube — so
// cases used to choose the pitch themselves regardless of geometry (k29.js
// substituted three explicit notes in onStrike, the last place in the book
// where a case picked a note independent of the size that's supposed to
// imply it: audio.bell() already takes a size and derives pitch, and
// src/kit/cylinder.js's own noteForSize already does this for the bronze
// cylinder). Now the case asks for a `size` and the note follows, the same
// rule everywhere else.
//
// THE PHYSICS: a free-free bar's fundamental runs f ~ thickness/length^2.
// Modelled here holding thickness CONSTANT — the actual tube geometry below
// scales diameter too, but only WEAKLY and on purpose (DIAM_WEAK_EXP), and
// that weak cosmetic term is deliberately left OUT of the pitch model: the
// "note" reported to onStrike is a picked synth parameter, not a
// measurement taken off the mesh, so there is nothing to reconcile by
// making the model track a decoration. A length ratio r therefore implies a
// frequency ratio of 1/r^2; the book's scale runs NOTE_PER_OCTAVE=5 degrees
// per octave (src/audio/tuning.js's SCALES are each five notes long,
// matching cylinder.js's own NOTE_SPAN comment), so a length ratio maps to
// a degree shift of -2*NOTE_PER_OCTAVE*log2(r) — the 2 is the square in
// f~1/L^2, NOTE_PER_OCTAVE converts an octave of frequency into degrees.
// Checks out against the brief's own worked example: r=1.41 (root-2) gives
// a 5-degree (one octave) shift, r=2 gives 10 degrees (two octaves) — "an
// octave down is a tube 1.41x longer, two octaves is 2x longer."
//
// SIZE_REF is the book's long-standing furin default — every staged chime
// used this size before this task — so note 0 falls at the size a case has
// always used, and a case that never touches size sounds exactly as it
// always has; SIZE_MIN/MAX bound the exported function the same way
// cylinder.js's own noteForSize bounds itself, so a future caller outside
// the sizes this task actually exercises can't extrapolate into an
// implausible octave.
const SIZE_REF = 0.17;
const SIZE_MIN = 0.08, SIZE_MAX = 0.34;
const NOTE_PER_OCTAVE = 5;
export function noteForSize(size) {
  const s = clamp(size, SIZE_MIN, SIZE_MAX);
  const steps = Math.round(2 * NOTE_PER_OCTAVE * Math.log2(SIZE_REF / s));
  return steps === 0 ? 0 : steps;   // -0 guard, same reasoning as cylinder.js's noteForSize
}

// The weak diameter term Frank asked for: "probably the length, I guess.
// Maybe a little bit of both, just kinda scaling them up... a modest
// diameter scaling keeps them reading as a matched set" rather than "one
// tube stretched." The ring's own tube radius (0.075*S, in the loop below)
// scales fully with S; a SINGLE tube's radius instead scales at
// S^DIAM_WEAK_EXP — noticeably thicker on the biggest single than the
// smallest, never as dramatically as the length difference between them.
// 0.35 was picked by eye against the length exponent (1, i.e. length scales
// directly with S): at case 29's own 2x length spread (k29.js) it produces
// about a 1.27x diameter spread — "a little," not "the same amount."
const DIAM_WEAK_EXP = 0.35;

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
  // cord's own length (CORD, above) plus a fraction of the body hanging
  // below it. That fraction (0.6) is EYEBALLED, not computed — this file has
  // no density/mass model, only geometry, so there is no real centre-of-mass
  // to derive it from. What IS on this object: the cap sits right at the
  // cord's end (near y=0 in body-local space) and the tubes hang below it,
  // tube 0 (the longest) centred at y=-1.03S and bottoming out at -1.88S, so
  // the true centre of mass sits somewhere between those two extremes,
  // closer to the tubes since they are the heavier metal parts — 0.6 lands
  // in that range and reads right, which is as far as "derived" goes here.
  // (A prior version of this comment claimed "the tubes run to about 0.9S,"
  // which is actually the CLAPPER's y position, not the tubes' — fixed
  // because the next task hangs a bronze cylinder on this same module and
  // would otherwise copy the wrong basis onto an object where the number
  // matters more.) A bigger `size` or a longer `cord` still swings slower
  // with nobody tuning a second number — that relationship is the physics,
  // per the brief — the exact value of 0.6 just isn't derived beyond "eyeballed
  // to land inside the plausible range."
  const PEND_L = CORD + 0.6 * S;
  const omega0 = Math.sqrt(GRAVITY / PEND_L);   // small-angle natural frequency
  // torque coefficients: at v=1, windLevel=1, the small-angle equilibrium
  // (g/L)*sin(theta_eq) = torque lands theta_eq at WIND_Z_LEAN / WIND_X_LEAN
  const windZTorque = (GRAVITY / PEND_L) * WIND_Z_LEAN;
  const windXTorque = (GRAVITY / PEND_L) * WIND_X_LEAN;
  // Z is the main swing plane a tap rings; X is the smaller off-axis wobble
  // the old code drove from a phase-shifted, slower copy of the same gust —
  // it never received taps before and does not gain them now. damping is
  // read fresh every update() (below), not baked in here, so SWING.damping
  // is live even on an already-hanging chime.
  const zPend = createPendulum({ length: PEND_L, g: GRAVITY, damping: SWING.damping });
  const xPend = createPendulum({ length: PEND_L, g: GRAVITY, damping: SWING.damping });
  // a tap's velocity kick, scaled so a full-force tap peaks near
  // SWING.tapPeak radians on its first swing (peak ~= kick/omega0 for a
  // lightly damped oscillator, since the kick's kinetic energy converts
  // almost entirely to potential energy at the first peak), then clamped so
  // a burst of taps saturates instead of spinning the chime past
  // plausibility. Both SWING fields read LIVE (not captured at construction)
  // so a harness slider changes the very next tap. MAX_OMEGA has to clear
  // tapPeak*omega0 or it clips the very tap it is meant to only cap on a
  // MASHED burst — see SWING's own comment for why maxOmegaFrac (0.85) sits
  // well above tapPeak (0.55), not just above it.
  function tapKick(force) {
    const maxOmega = SWING.maxOmegaFrac * omega0;
    kickPendulum(zPend, force * SWING.tapPeak * omega0);
    zPend.omega = clamp(zPend.omega, -maxOmega, maxOmega);
  }

  // tubes in a ring; the longer the tube the deeper the note — index 0 is the
  // longest, matching the engine's degree mapping. Thickened from the first
  // pass (0.055S — a wire at this length-to-radius ratio) so they read as the
  // metal pipes a real furin hangs, not threads.
  const state = [];
  const sleeves = [];
  const single = tubes === 1;
  // Derived once, at build time — a single tube's note follows its size (see
  // noteForSize above); a ring keeps reporting its raw tube index, exactly
  // as before, since the ring's pitch is the engine's degree mapping over
  // that index, not a size-derived note (see the "check the ring" note in
  // this task's report for why that is a DIFFERENT, already-approved rule).
  const note = single ? noteForSize(S) : null;
  // Radius scales fully with S for a ring (unchanged); a single tube uses
  // the weak DIAM_WEAK_EXP term instead — see its own comment above for why
  // the pitch model above does not (and should not) track this. Computed
  // once, outside the loop, so the clapper-clearance offset below (which
  // needs the SAME number) cannot drift from what the tube mesh actually
  // uses — at S===SIZE_REF this equals the ring's own 0.075*S exactly (base
  // 1 to any exponent is 1), which is why the existing geometry tests at the
  // book's default size see no change.
  const singleTubeR = single ? 0.075 * SIZE_REF * Math.pow(S / SIZE_REF, DIAM_WEAK_EXP) : 0;
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = S * (1.7 - 0.14 * i);
    // A lone tube hangs on the axis. A ring of one is not a ring — it is a
    // tube mysteriously offset from the cord holding it up.
    const rx = single ? 0 : Math.cos(angle) * 0.33 * S;
    const rz = single ? 0 : Math.sin(angle) * 0.33 * S;
    const tubeR = single ? singleTubeR : 0.075 * S;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, len, 6), metal);
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
  // clearance uses the tube's OWN actual radius (singleTubeR), not a fixed
  // 0.075*S — the two coincide at S===SIZE_REF (see singleTubeR's comment)
  // but diverge at every other size now that a single tube's diameter scales
  // weakly rather than fully with S, and a hardcoded margin here would
  // silently stop clearing the tube at the small end of the size range,
  // where singleTubeR runs relatively THICKER than 0.075*S would predict.
  const clapperOff = single ? clapperR + singleTubeR + 0.065 * S : 0;
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

  let clock = null;         // null until the first update() — see the seeding below
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
      // A ring reports its raw tube index (0..tubes-1) — the engine adds it
      // straight to CHIME.degree, which is what makes a ring a five-note
      // cluster. A single tube instead reports its SIZE-DERIVED note (i is
      // always 0 here, the only tube there is) — this is the whole point of
      // noteForSize above: the case no longer has to know or substitute a
      // note, the kit already worked it out from the size the case chose.
      onStrike(single ? note : i, force, WORLD);
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
      if (clock === null) {
        // SEED, don't start at 0. simTime is main.js's GLOBAL clock and
        // never resets across koan entries (main.js: simTime keeps
        // accumulating from boot; tick() just adds STEP to it every frame,
        // koan enter/exit does not touch it) — so a fūrin built when the
        // reader is already deep into a session sees a large simTime on its
        // very first update(). Starting `clock` at 0 made that first call's
        // elapsed = simTime - 0, i.e. the ENTIRE session, integrated in one
        // frame at the fixed substep: measured at case 29's scale (4
        // instances x 2 pendulums each), 24ms at simTime=60s, 142ms at 600s,
        // 750ms at 3600s, unbounded — landing exactly on the ink dissolve, and
        // a multi-hour sitting with the book open is the normal case, not
        // the edge case. A chime that has just been built has not been
        // swinging; seeding `clock` to the incoming simTime makes THIS first
        // call's elapsed exactly 0 instead.
        //
        // Seeding zPend/xPend's own `.clock` to the SAME value locks the
        // pendulum's internal time base to this one: torqueAt below reads
        // gustPhase at the pendulum's own p.clock, and the strikes/tag below
        // read gustPhase at this `clock` — two different variables that must
        // agree, or the wind driving the SWING desyncs from the wind driving
        // the STRIKES and the tag's flutter. Before this fix they only
        // "agreed" as a side effect of the runaway catch-up above walking
        // p.clock up to meet `clock` in that one giant first frame; without
        // that crutch they would start apart and stay apart, permanently
        // offset by however far into the session the chime was built.
        // tests/furin.test.js, 'the swing's wind phase stays locked...'
        // pins this against an independent reproduction of the torque math.
        const seed = Number.isFinite(simTime) ? simTime : 0;
        clock = seed;
        zPend.clock = seed;
        xPend.clock = seed;
      }
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

      // SWING.damping is read fresh every frame, not just at construction —
      // a harness slider dragged mid-scene has to reach an already-hanging
      // chime, the same "no reload" promise bell-audition.html makes for the
      // bell voice.
      zPend.damping = SWING.damping;
      xPend.damping = SWING.damping;

      // wind is a TORQUE now, not a position — see THE SWING above. Each
      // axis reads gustPhase at its own (per-instance) phase offset so two
      // fūrin never sway in lockstep; X mirrors the old code's slower,
      // shifted copy of the same gust (never received taps before, still
      // does not). `t` here is the PENDULUM's own p.clock, seeded above to
      // track this file's absolute `clock` (to within one physics substep —
      // src/kit/pendulum.js's integratePendulum comment) rather than an
      // independent time-since-creation, which is what keeps this in phase
      // with `tt` below.
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
    // fraction of the force, and no strike. CHANGED CHARACTER under the
    // pendulum: the old model summed up to 8 superposed impulses, so
    // spamming hoverAt() topped out around 0.05 rad; this model has one
    // omega, and repeated hovers now saturate at SWING.maxOmegaFrac*omega0
    // rad (a live value, currently 0.85 — see SWING's own comment — the same
    // ceiling a full-force tap can reach). Latent today — no case calls
    // hoverAt() — flagged here so it is not discovered by surprise if one
    // starts to.
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
    // the size-derived note a single tube reports (null for a ring, which
    // reports raw tube index instead) — exposed for the harness and tests,
    // same role as cylinder.js's own note()
    note() { return note; },
    // the two swing planes' natural periods (seconds), read off the SAME
    // state the physics runs on — matching cylinder.js's own periods(),
    // added here for the harness ("the derived values shown live — period,
    // note, tube length")
    periods() {
      return {
        z: 2 * Math.PI * Math.sqrt(PEND_L / GRAVITY),
        x: 2 * Math.PI * Math.sqrt(PEND_L / GRAVITY),
      };
    },
    // every tube's built length, in build order (index 0 first) — the
    // harness reads this to show the size/length relationship live; a ring
    // has `tubes` entries, a single tube has one
    tubeLengths() { return state.map((_, i) => S * (1.7 - 0.14 * i)); },
  };
}
