import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { hash1 } from '../util/noise.js';
import { gustPhase, gustBuffet } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';
import { createPendulum, integratePendulum, kickPendulum, pendulumEnergy } from './pendulum.js';
import { clamp } from '../util/math.js';

// A wind chime: tubes hung in a ring under a wooden cap, a clapper, a paper
// tag. The VISUAL sway follows the real gust — it is the wind that visibly
// moves it — but the strikes are paced by the chime's own much slower weather
// (chimeActivity). Tying strikes to the audible gust made the soundscape
// breathe in lockstep, too quiet then constant; untied, the brain fills in the
// causality on its own. The wind still GATES it: a stilled scene is a silent
// chime.
//
// Deterministic. The strike weather is a closed form over simTime; the swing is
// a real pendulum with state (src/kit/pendulum.js) that integrates on a fixed
// substep and carries its own remainder, so the pose depends only on elapsed
// sim time and the sequence of taps, never on how update() gets called across
// frames. This is kit, not audio — the no-Math.random rule applies in full. The
// only audio import is gustPhase, a pure function (the sanctioned exception).
//
// The group's origin is the HANG POINT: all geometry below y=0, so a case
// positions it by where it hangs FROM.

// The chime's own weather: short flurries with regular breaks, active about a
// quarter of the time. Rates chosen NOT to track the gust envelope — waves near
// the gust's own period produced a long flurry followed by a long hole, which
// read as a bug.
//
// ONE EPOCH, NOT TWO PHASES. Both sines are zero AND rising at t = 0, so with
// no offset they add coherently on the way up and every session opened
// mid-flurry. It shows up on a fresh load and nowhere else, because simTime is
// global and never resets per case — arriving at a case any other way arrives
// at ordinary weather. Shifting the whole curve is a pure time translation, so
// the flurry/break/duty statistics are mathematically unchanged; giving each
// sine its OWN offset would rewrite the beat structure instead. gustPhase's own
// comment in src/audio/synths.js records that mistake being made and caught.
// The epoch is chosen by sweep so the opening thirty seconds carry the long-run
// duty.
const ACT_A = 0.031, ACT_B = 0.047;
const ACT_EPOCH = 31.65;
export function chimeActivity(t) {
  const s = t + ACT_EPOCH;
  const a = (Math.sin(2 * Math.PI * ACT_A * s) + Math.sin(2 * Math.PI * ACT_B * s)) / 2;
  return Math.max(0, Math.min(1, (a - 0.35) / 0.4));
}

const DENSITY = 0.85;      // Garden preset
const REFRACTORY = 0.45;   // a tube cannot restrike faster than this

// THE SWING. A driven, damped pendulum (src/kit/pendulum.js) — a furin is a
// light thing dragging a paper tag through the air, so it swings fast and
// settles fast; the bonshō in kit/bell.js is a heavier, slower thing.
//
// This replaced a model where the wind curve was read STRAIGHT INTO the
// rotation every frame — no inertia, no restoring force, nothing that could
// ever swing, only ever be positioned. A real pendulum fixes that: wind is a
// TORQUE the gravity term has to fight, so a steady wind settles the chime at a
// lean it arrives at by swinging past it first, and a tap is a velocity kick
// rather than a superposed decaying-sine term — see ring()/hoverAt() below.

// "Book gravity": src/sim/verlet.js's cloth already uses this number as its own
// tuning constant at this scene scale (not real gravity — the book's units are
// not metres), so the pendulum reuses it rather than the kit inventing a second
// "book gravity" that happens to differ for no reason.
const GRAVITY = 9.8;

// SWING TUNING — live, not frozen. A mutable object rather than individual
// consts so dev/hanging-audition.html can write straight into it and hear the
// very next tap change, no reload (SPATIAL's own pattern in
// src/audio/spatial.js — the binding stays const, its fields don't). update()
// re-reads `damping` every frame and tapKick() re-reads `tapPeak`/
// `maxOmegaFrac` every call, rather than baking them into the pendulum at
// construction, so a slider takes effect on an ALREADY-hanging chime.
//
// Starting points settled by eye and ear through the harness, not derived
// values. These once reproduced the amplitudes of the broken kinematic model
// above, which was the wrong target — a small tap and a two-swing settle reads
// as heavily damped no matter how correct the equation underneath it is.
//
// maxOmegaFrac is the one with a hard ceiling on it: it caps swing amplitude,
// and case 29 hangs four chimes close enough that a larger cap put the ring and
// its nearest single visibly through each other in counter-phase (see k29.js's
// own MAX-AMPLITUDE CHECK). This is the largest cap that still clears every
// case-29 neighbour with real margin at the saturated-burst peak it produces.
export const SWING = {
  tapPeak: 0.55,
  damping: 2 / 4.5,
  maxOmegaFrac: 0.65,
};

// The equilibrium lean (rad) a steady full gust settles the pendulum at, for
// the primary swing plane (Z) and the smaller off-axis wobble (X) — the same
// visual scale the old kinematic code drew directly, so a default fūrin still
// reads at its settled size, just arrived at by swinging now instead of being
// placed. Nothing frozen here to open up: wind lean is already live
// per-instance via setWindLevel().
const WIND_Z_LEAN = 0.16;
const WIND_X_LEAN = 0.09;

// HOW HARD THE TURBULENCE SHOVES IT, as a multiple of the steady lean above.
// gustPhase alone drives this pendulum far below its own natural frequency, so
// it could only ever lean, never swing — one direction change every few seconds
// in wind against a fraction of a second after a tap. gustBuffet
// (src/audio/synths.js) supplies the missing band.
//
// Mean zero, so the chime's resting lean is unchanged; this only decides how
// much it moves ABOUT that lean. It multiplies the same torque coefficient the
// lean does and is applied identically to the body and to the clapper, which is
// what keeps the clapper's wind invariant intact — see THE CLAPPER below.
//
// BOUNDED BY THE CLAPPER, not by taste. The body and the clapper have different
// natural frequencies, so a fast drive separates them in a way the slow breeze
// never could — push this hard enough and the wind starts ringing the chime,
// which is exactly the ambient pacing this file spends its header protecting.
// Swept over eighteen rigs (six seeds x three tube counts) for thirty simulated
// minutes each, the first wind contacts appear well above this level.
//
// Backing off costs nothing: the reversal rate — which is what actually reads
// as "swinging" — is flat across the whole usable range, because it is set by
// WHERE the drive's energy sits in frequency, not by how much of it there is.
// Less only shortens the throw.
//
// Live, like SWING, so the harness can dial it.
export const BUFFET = { level: 0.38 };

// THE CLAPPER, as a second pendulum. Until now it was a decoration: a disc
// parented into `body`, rigid with the tubes, unable to approach them at any
// angle. Every sound came from one of two places — the ambient weather loop, or
// ring() firing exactly one tube per tap. So a tap was one tone, always, on a
// five-tube ring where several notes at once is the whole point, and the swing
// it kicked off was silent.
//
// Now the clapper hangs on its own pendulum and the tubes are what stop it.
// A tap kicks the BODY only (a knock is a shove on the thing you touched);
// the clapper is left behind; the two cross the physical clearance between
// them and the tubes on the contact side ring together. As the swing decays
// the contacts recur, weaker each time — a real chime's ring-down, out of
// the same physics the bronze cylinder already rings by (kit/cylinder.js),
// not a scripted burst.
//
// THE INVARIANT THAT PROTECTS THE AMBIENT PACING. The chime's strike weather
// (chimeActivity, above) is settled, and this must not disturb it: the clapper
// is a TAP mechanism, and the weather stays the only thing that rings this
// chime in the wind. TWO independent things hold that, and it is worth knowing
// both, because the first alone is not as strong as it first looks:
//
//   1. EQUAL LEANS. The clapper reads the SAME gustPhase at the SAME
//      per-instance offset as the body, with its torque coefficient scaled
//      by its own (g/L) so both settle at the same equilibrium angle, and
//      update()'s seeding starts both AT that angle rather than hanging
//      straight down. In a steady wind the relative angle is therefore
//      exactly zero. But a gust is not steady, and the two have different
//      natural frequencies: the transient peaks at roughly half a five-ring's
//      clearance under full wind. Real margin, not a guarantee — a `windLevel`
//      well past 1 does put a single tube's clapper on the wood.
//   2. THE FORCE FLOOR. Those contacts close far too slowly to clear
//      CLAP_FORCE.minForce, so they never sound. Swept to 3x full wind, where
//      a single tube's relative angle reaches twice its own gap: still zero
//      audible contacts.
//
// Cases only ever pass 0..1, so in the book the first mechanism is never even
// tested. The second is what makes it safe for a dev harness (whose wind slider
// runs past 1) or a future case to push further without quietly doubling the
// chime's own pacing.
//
// Same "two independent pendulums, not a real double pendulum" simplification
// cylinder.js commits to, and for the same reason (a true double pendulum is
// chaotic and much harder to keep deterministic-by-construction): both hang
// from the group origin, and what gets RENDERED is their difference, applied
// to a pivot parented under the body — so on screen the clapper reads as
// hanging from the cap and swinging inside the ring, which is what it is.
const CLAP_RESTITUTION = 0.35;   // most of a contact's energy goes into the ring, not the rebound
// A contact cannot re-trigger every frame while the clapper is still resting
// against a tube. Sized well under the swing's own half-period so it never
// suppresses a genuine separate contact — it only stops one touch stuttering.
const CONTACT_REFRACTORY = 0.16;
// Which tubes a contact rings. The clapper touches the side of the ring it has
// swung toward; `dot` is each tube's own direction against the contact
// direction, so 1 is dead-on and 0 is side-on. This threshold rings the touched
// tube plus its two neighbours on a five-ring, or the touched tube alone on the
// opposite phase — a cluster that varies rather than a fixed chord, which is
// what a real chime does as the clapper wanders round the ring.
const CLUSTER_DOT = 0.1;

// A contact's force from the relative angular velocity at the moment of contact
// — a hard meeting rings loudly, a graze barely sounds. Unlike the bronze
// cylinder's own force law (kit/cylinder.js's forceForRelOmega, which has to
// serve wind contacts AND tap contacts on one curve, two regimes far apart),
// this one only ever sees taps: the invariant above means wind never produces a
// clapper contact at all. One regime, so one plain power curve.
//
// THE REFERENCE IS PER-INSTANCE, NOT A CONSTANT. A fixed cap in rad/s is wrong
// here for the same reason a fixed note would be: a small chime hangs on a
// short pendulum, so its natural frequency — and therefore every velocity it
// can ever reach — is higher. With one fixed cap, a small single pinned at full
// force for its first contacts while the default ring stayed in range — the
// exact saturation the cylinder's own force law had to be rewritten to escape.
// `capFrac` instead scales the reference by the instance's OWN full-force tap
// velocity (SWING.tapPeak * omega0), so every chime in the book, at every size,
// reports ~1 for a hard knock and fades from there.
//
// `gamma` below 1 keeps the tail of a long ring-down audible rather than
// letting it vanish while the tubes are still visibly moving.
//
// `minForce` is where a contact stops being a sound. Without it the ring-down
// runs as long as the swing stays above the (tiny) clearance between clapper
// and tube — dozens of contacts from a single tap, still going fifteen seconds
// later. That is a machine, not a chime. Below this the clapper still meets the
// tube (THE WALL still resolves it, so nothing passes through anything) but the
// touch is too soft to speak.
//
// Live, like SWING — dev/hanging-audition.html writes straight into it and
// clapForce() re-reads all of it on every contact.
export const CLAP_FORCE = {
  capFrac: 1.0,
  gamma: 0.7,
  minForce: 0.22,
};
export function clapForce(relOmega, capOmega) {
  const { capFrac, gamma } = CLAP_FORCE;
  const cap = capOmega * capFrac;
  if (!(cap > 0)) return 0;
  return Math.pow(clamp(Math.abs(relOmega) / cap, 0, 1), gamma);
}

// NOTE FROM SIZE — the single-tube variant only. A tubes:1 chime always reports
// tube index 0, there being only one tube, so cases used to choose the pitch
// themselves regardless of geometry: three chimes of visibly different size
// could sound the same, or the same size sound different. That was the last
// place in the book where a case picked a note independent of the size that is
// supposed to imply it — audio.bell() already derives pitch from size, and
// cylinder.js's own noteForSize already does this for the bronze. Now the case
// asks for a `size` and the note follows.
//
// THE PHYSICS: a free-free bar's fundamental runs f ~ thickness/length^2.
// Modelled holding thickness CONSTANT — the tube geometry below scales diameter
// too, but only weakly and on purpose (DIAM_WEAK_EXP), and that cosmetic term is
// deliberately left OUT: the "note" reported to onStrike is a picked synth
// parameter, not a measurement taken off the mesh, so there is nothing to
// reconcile by making the model track a decoration. A length ratio r implies a
// frequency ratio of 1/r^2, and the book's scale is a fixed number of degrees
// per octave, so the shift is -2*NOTE_PER_OCTAVE*log2(r): the 2 is the square in
// f~1/L^2, and NOTE_PER_OCTAVE converts an octave of frequency into degrees. It
// checks out against the intended feel — an octave down is a tube root-2 longer,
// two octaves a tube twice as long.
//
// SIZE_REF is the book's long-standing furin default, so note 0 falls at the size
// cases have always used and one that never touches size sounds exactly as it
// always has. SIZE_MIN/MAX bound the exported function the way cylinder.js's own
// noteForSize bounds itself, so a caller outside the exercised range cannot
// extrapolate into an implausible octave.
const SIZE_REF = 0.17;
const SIZE_MIN = 0.08, SIZE_MAX = 0.34;
const NOTE_PER_OCTAVE = 5;
export function noteForSize(size) {
  const s = clamp(size, SIZE_MIN, SIZE_MAX);
  const steps = Math.round(2 * NOTE_PER_OCTAVE * Math.log2(SIZE_REF / s));
  return steps === 0 ? 0 : steps;   // -0 guard, same reasoning as cylinder.js's noteForSize
}

// The weak diameter term. The ring's own tube radius (in the loop below) scales
// fully with S; a SINGLE tube's radius instead scales at S^DIAM_WEAK_EXP —
// noticeably thicker on the biggest single than the smallest, never as
// dramatically as the length difference between them, so a set reads as matched
// rather than as one tube stretched. Picked by eye against the length exponent
// (1, i.e. length scales directly with S).
const DIAM_WEAK_EXP = 0.35;

// THE SINGLE-TUBE FŪRIN'S REAL SHAPE. A 風鈴 is a small BELL with the clapper
// hidden inside it and the tanzaku (poem-strip) hanging below on the clapper's
// own thread. What was here instead was a Western tubular chime — a long thin
// wire — with a tanzaku bolted to its side, because the single-tube variant
// started life as "the ring, with four tubes deleted" and inherited a clapper
// that had to be nudged off-axis to avoid being impaled on the one tube left.
//
// So the body goes short and wide, the clapper mesh goes away entirely —
// physics only, exactly as kit/cylinder.js does it, and for the same reason:
// nobody can see inside an opaque body, so rendering one is a draw call spent
// on something invisible that occasionally poked through a wall — and the
// tanzaku moves to where it belongs, hanging below the mouth.
//
// A RING IS UNCHANGED by all of this: five or three tubes around a visible
// clapper is what a wind chime looks like, and it was never the thing that
// looked wrong.
//
// The proportions are chosen so the whole assembly ends up the same DEPTH it
// was, because five other cases hang one of these under an eave or a gate with
// their own clearances (k4, k15, k22, k31, k34), and a component that suddenly
// reached deeper would poke through a veranda floor somewhere with nothing
// failing. Exported so tests can recover an instance's own size from its built
// geometry without retyping the number (tests/k29.test.js does exactly that to
// prove each single's NOTE follows the SIZE the case chose rather than a table
// the case kept).
export const SINGLE_BODY_LEN = 0.85;
// HOW FAR A CHIME REACHES BELOW ITS KNOT, in units of size, cord excluded:
// total drop is cordLength + FURIN_REACH x size. Case 29 derived its own figure
// by hand to hang three chimes clear of a gate's tie beam, and left it in a
// comment where the next caller could not find it.
//
// THE SINGLE'S FIGURE IS NOT THE FAMILY'S, a distinction case 29 never had to
// draw because it hung nothing but singles. Measured off the built geometry
// across the size range, the two forms are exactly flat and exactly different,
// a ring reaching about 6% deeper than a single. Promoting the single's number
// to a general bound put a ring through whatever was relying on it — caught by
// the first clearance test written against a beam. The bound has to be the
// worse of the two.
export const FURIN_REACH = 2.10;
const SINGLE_BODY_R = 0.20;      // x S (weakly, see DIAM_WEAK_EXP), was 0.075
const SINGLE_CLAP_FRAC = 0.70;   // clapper radius as a fraction of the body's, hidden inside it
const SINGLE_THREAD = 0.10;      // x S, the bit of cord between mouth and paper
const TANZAKU_LEN = 0.85;        // x S
const TANZAKU_WIDE = 1.5;        // x the body radius
// How far past the contact point the clapper's own pendulum reaches, as a
// fraction of the way to the centre of the paper hanging below it — see CLAP_L
// in makeFurin for why this is not simply the contact depth.
//
// SWEPT, on a full-force tap in still air: at zero the clapper rides the body
// and a tap makes one sound, and the knock count climbs steeply from there to a
// rattle at the top of the range. This puts a single in the same register as
// the five-tube ring — a handful of knocks over a few seconds — which holds the
// standing constraint that it is just supposed to be an ambient thing.
const CLAP_REACH = 0.15;

// THE TANZAKU'S SPIN. A paper strip on a single thread twists rather than
// swings — the thread stores the twist and gives it back — so this is a
// TORSIONAL pendulum, reusing kit/pendulum.js with `g` standing in for
// torsional stiffness and `length` fixed at 1 (alpha = -stiffness*sin(theta)
// - damping*omega + torque).
//
// sin() rather than a linear spring on purpose: past a hard enough kick the
// restoring torque cannot hold it and the strip goes over the top and whirls
// before settling back into a twist. A linear spring can only ever oscillate.
//
// `stiffness` puts the natural period at a couple of seconds — slow enough to
// read as paper rather than a propeller.
//
// `kick` CANNOT BE DERIVED, and the arithmetic that looks like it can is a
// trap: 2*sqrt(stiffness) is the velocity that clears the top of the swing, but
// that is the UNDAMPED threshold, and the strip spends a while climbing, over
// which `damping` takes better than half its energy. Set from that formula with
// apparent margin, it never got over at all. Swept instead, for the spread that
// makes tap force legible rather than every tap looking the same: a light touch
// turns an eighth of a turn, a solid knock carries it round.
//
// `damping` is deliberately weak — a paper strip on a thread has very little to
// damp it, and a shorter tau bled off a twist before it could come back. The
// thread now gives the twist back several times before it settles.
//
// `wind` reads the fast buffet band as well as the slow breeze. The breeze
// alone crept the strip a quarter of the way round over twenty seconds and
// crept back, reversing once every fifteen seconds, which is not catching
// anything; reading both bands it reverses about once a second.
//
// THE STABILITY INVARIANT, which is not a matter of taste:
//
//     wind * (1 + buffet)  <  stiffness
//
// The restoring torsion is -stiffness*sin(theta), so it can only balance a
// drive whose magnitude is under `stiffness`. Above that there is NO
// equilibrium at any angle: the strip goes over the top and keeps accelerating,
// winding up forever — which is precisely the failure the "never winds up" test
// in tests/furin.test.js exists to catch.
//
// It has been violated twice. Once by a gain chosen for feel alone, which
// measured 41 turns of sweep — a pinwheel, not a poem-strip. Once more, subtly,
// by values that broke the inequality only when the slow gust and the fast
// buffet crested together: that survived until gustPhase gained an epoch, which
// reshuffled which coincidences occur, and it wound to seven turns on the first
// run. The values below hold the inequality with margin, so an equilibrium
// always exists and the peak lean is comfortably short of over-the-top.
// Anything raising `wind` or `buffet` has to check the inequality or the strip
// becomes a windmill.
//
// A TAP still can send it round, and should — `kick` is not bound by any of
// this. Only the wind is. The paper's looseness is `damping`, not the gain.
//
// Live, like SWING — the harness writes into it.
export const SPIN = {
  stiffness: 6.3,
  damping: 2 / 6.5,
  wind: 3.3,
  kick: 10.0,
  buffet: 0.80,     // x wind, on the fast band — what the paper actually catches
};

// scratch for reporting a struck tube's world position — shared across all
// furin instances and every fire(), so a strike costs no allocation
const WORLD = new THREE.Vector3();

export function makeFurin({
  size = 0.17, tubes = 5, seed = 5, phase = null, couple = 0, onStrike = null,
  cord = 0.62,             // the hanging string, in units of size; 0 for none
  // ...or an ABSOLUTE length, in world units, which wins when given. With cord
  // measured in units of size, a small chime gets a proportionally short
  // string, so the smallest of a set hung from one beam is pinned tightest to
  // it exactly when it should hang furthest to balance the group. A
  // size-relative cord is still right for a chime hung ALONE (it keeps the
  // whole object one shape at any size); an absolute one is right whenever a
  // case is composing several, because then the hang depth is a fact about the
  // beam, not about the chime.
  cordLength = null,
} = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  const wood = washMaterial({ color: WASH.dark, flat: true });
  const metal = washMaterial({ color: WASH.stone });

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  // THE STRING IT HANGS BY. A furin is tied up under an eave, and without the
  // cord the cap simply floated at the hang point with nothing holding it. The
  // swing group already pivots at y = 0, which IS the knot, so the cord hangs
  // from the pivot and the whole chime swings from its top end like the real
  // thing.
  const CORD = cordLength === null ? cord * S : Math.max(0, cordLength);
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
  // MASHED burst — see SWING's own comment for why maxOmegaFrac sits
  // meaningfully above tapPeak, not just above it.
  //
  // THE ENERGY CAP, below, because A VELOCITY CLAMP ALONE DOES NOT HOLD THE
  // PROMISE ABOVE. It bounds omega at the INSTANT of a kick, not the pendulum's
  // accumulated motion, so a sustained mash — taps landing every frame or two,
  // with real elapsed time and real theta motion in between — re-arms omega to
  // the ceiling on every kick regardless of how far gravity had fought it down
  // since the last one. That is holding the throttle open, not capping a burst:
  // measured, a few seconds of frame-rate tapping drove the swing through
  // multiple full rotations. A literal windmill, and exactly what this file
  // claimed could not happen.
  //
  // So the bounded quantity is mechanical ENERGY, not velocity. maxEnergy is
  // what a single maximally-hard tap from rest reaches, and capping total energy
  // there on every kick means no amount of mashing, at any rate, can exceed what
  // one perfect tap already could. Velocity is still what gets adjusted — never
  // theta, since a kick is a velocity event per kickPendulum's own contract —
  // just solved from the energy budget rather than a flat ceiling: what is
  // allowed is whatever is left after the pose's own potential energy at the
  // CURRENT theta, so a kick landing while already swung out wide is capped
  // harder than one landing near the bottom. Which is the physical picture:
  // there is less room left to add.
  function tapKick(force) {
    // The paper takes the knock too, and its own restoring torque is weak
    // enough that a solid one sends it over the top and spinning (see SPIN).
    // `spin` is declared further down this closure — legal because tapKick is
    // only ever CALLED from ring()/hoverAt() on the returned object, long
    // after the whole body has run.
    if (spin) kickPendulum(spin, force * SPIN.kick);
    const maxOmega = SWING.maxOmegaFrac * omega0;
    kickPendulum(zPend, force * SWING.tapPeak * omega0);
    zPend.omega = clamp(zPend.omega, -maxOmega, maxOmega);
    const maxEnergy = 0.5 * maxOmega * maxOmega;
    if (pendulumEnergy(zPend) > maxEnergy) {
      const pe = (GRAVITY / PEND_L) * (1 - Math.cos(zPend.theta));
      const keAllowed = Math.max(0, maxEnergy - pe);
      const omegaAllowed = Math.sqrt(2 * keAllowed);
      const sign = zPend.omega === 0 ? 1 : Math.sign(zPend.omega);
      zPend.omega = sign * Math.min(Math.abs(zPend.omega), omegaAllowed);
    }
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
  // Radius scales fully with S for a ring (unchanged); a single body uses
  // the weak DIAM_WEAK_EXP term instead — see its own comment above for why
  // the pitch model above does not (and should not) track this. Computed
  // once, outside the loop, because the hidden clapper's own radius and the
  // tanzaku's width are both derived from it and must not drift from what
  // the mesh actually uses.
  const singleTubeR = single ? SINGLE_BODY_R * SIZE_REF * Math.pow(S / SIZE_REF, DIAM_WEAK_EXP) : 0;
  const singleLen = SINGLE_BODY_LEN * S;
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = single ? singleLen : S * (1.7 - 0.14 * i);
    // A lone body hangs on the axis. A ring of one is not a ring — it is a
    // tube mysteriously offset from the cord holding it up.
    const rx = single ? 0 : Math.cos(angle) * 0.33 * S;
    const rz = single ? 0 : Math.sin(angle) * 0.33 * S;
    const tubeR = single ? singleTubeR : 0.075 * S;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, len, 6), metal);
    tube.name = 'tube';
    tube.position.set(rx, -(0.18 * S + len / 2), rz);
    body.add(tube);

    // A ring's tube is a wire at this scale — far too thin to hit on a
    // phone. Each gets a forgiving invisible sleeve, and the sleeve is what
    // says which tube it is: one tap, one tube, one tone. A single body is
    // already wide enough to hit, so its sleeve only has to be a little
    // proud of it rather than five times its width.
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(
        single ? singleTubeR * 1.6 : 0.20 * S,
        single ? singleTubeR * 1.6 : 0.20 * S, len * 1.05, 6),
      new THREE.MeshBasicMaterial({ visible: false }));
    sleeve.name = 'tube-hit';
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

  // the cap the tubes hang from — deeper and more sharply tapered than the
  // first pass, which was barely tapered at all, so it reads as a small roof
  // over the ring rather than a washer the tubes happen to hang from. Over a
  // single tube it shrinks to read as the knot the cord ties to, not a roof
  // over a ring that does not exist.
  const CAP_H = single ? 0.08 * S : 0.14 * S;
  const capR = single ? 0.16 * S : 0.46 * S;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR * 1.26, CAP_H, 8), wood);
  cap.name = 'cap';
  cap.position.y = -CAP_H / 2;                // top face stays AT the hang point
  body.add(cap);

  // THE NECK, single only. A tube's top sits below where a single's knot
  // reaches, so there was clear air between the knot and the bell it is
  // supposedly holding up and the bell read as floating. A ring does not want
  // this: its tubes hang on threads from a roof and the daylight under the cap
  // is the point.
  //
  // Slimmer than the tube so it reads as something the bell hangs FROM rather
  // than as part of the bell, and it closes the gap by construction — both ends
  // come off TUBE_TOP and CAP_H, so moving either one keeps them joined.
  if (single) {
    const TUBE_TOP = 0.18 * S;
    const neckLen = TUBE_TOP - CAP_H;
    if (neckLen > 0) {
      const neckR = Math.min(capR * 0.55, singleTubeR * 0.42);
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(neckR, neckR, neckLen, 6), wood);
      neck.name = 'neck';
      neck.position.y = -(CAP_H + neckLen / 2);
      body.add(neck);
    }
  }

  // THE CLAPPER. A ring's is a visible disc hanging at the centre with every
  // tube 0.33S clear of it — that reads correctly and stays. A single's is
  // INSIDE the body and has no mesh at all: nobody can see into an opaque bell,
  // so drawing one spends a draw call on something invisible that (as
  // kit/cylinder.js found the same way) occasionally pokes through a wall. The
  // version before this hung the disc out to the side to avoid being impaled on
  // the one tube, and read as connected to nothing.
  const clapperR = single ? SINGLE_CLAP_FRAC * singleTubeR : 0.16 * S;
  // The clapper's pivot, parented under the body rather than fixed in it — see
  // THE CLAPPER at the top of this file. Parenting it here, at the cap, means
  // its local rotation IS the clapper's angle relative to the body, which is
  // exactly the quantity the contact check works in; and on screen a ring's
  // disc reads as hanging from the cap and swinging among the tubes, which is
  // what a fūrin's clapper does. It survives on a single as a bookkeeping node
  // with no geometry (an empty Group costs no draw call) so tests and the
  // harness can read the clapper's pose without reaching into this closure.
  // (The physics models both as pendulums from the group origin, so the
  // render's pivot sits one cord-length below where the model's does. At the
  // cord lengths this kit uses — a tenth of a unit — that displacement is
  // smaller than the clapper disc itself, and paying for it would mean a real
  // double pendulum.)
  const clapperPivot = new THREE.Group();
  clapperPivot.name = 'clapper-pivot';
  body.add(clapperPivot);
  if (!single) {
    const clapper = new THREE.Mesh(new THREE.CylinderGeometry(clapperR, clapperR, 0.03 * S, 8), wood);
    clapper.name = 'clapper';
    clapper.position.set(0, -0.9 * S, 0);
    clapperPivot.add(clapper);
  }

  // THE TANZAKU — the poem-strip. On a ring it hangs beside the clapper as
  // it always has. On a single it hangs BELOW THE MOUTH on its own short
  // thread, which is where a real 風鈴's is: the paper is what the wind
  // catches, and it hangs off the clapper's own string through the bell.
  // Long and narrow (about 4:1) — real ones are not the stubby rectangle an
  // early pass drew.
  const bodyBottom = 0.18 * S + (single ? singleLen : S * 1.7);
  const THREAD = SINGLE_THREAD * S;
  const tagW = single ? TANZAKU_WIDE * singleTubeR : 0.22 * S;
  const tagH = single ? TANZAKU_LEN * S : 1.0 * S;
  const tagGeo = new THREE.PlaneGeometry(tagW, tagH);
  tagGeo.translate(0, -tagH / 2, 0);
  const tag = new THREE.Mesh(tagGeo, washMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.tube = null;           // the whole chime, not any one tube
  // A single's paper turns on its own thread (SPIN, above) — so it needs a
  // pivot of its own, hung at the mouth, with the paper below it. A ring's
  // keeps the flutter it has always had and needs no pivot.
  let spinPivot = null;
  if (single) {
    const thread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012 * S, 0.012 * S, THREAD, 4), wood);
    thread.name = 'tag-thread';
    thread.position.y = -(bodyBottom + THREAD / 2);
    body.add(thread);
    spinPivot = new THREE.Group();
    spinPivot.name = 'spin-pivot';
    spinPivot.position.y = -(bodyBottom + THREAD);
    body.add(spinPivot);
    spinPivot.add(tag);
  } else {
    tag.position.set(0, -0.95 * S, 0);
    clapperPivot.add(tag);
  }

  // THE CLAPPER'S OWN PHYSICS. Its pendulum length is the real hang depth,
  // so it swings a little slower than the body whose own length stops at the
  // assembly's centre of mass — the lag that makes a tap ring at all. A
  // single's clapper hangs 65% of the way down the inside of the bell, the
  // same fraction kit/cylinder.js uses for the same reason (deep enough to
  // be well inside, high enough that the contact angle stays sane).
  const CONTACT_Y = CORD + (single ? 0.18 * S + 0.65 * singleLen : 0.9 * S);
  // How far the clapper has to travel, in a straight line, before it touches
  // metal. A ring's tubes stand off the axis with the clapper centred between
  // them; a single's clapper sits INSIDE the body, so its clearance is the
  // wall's own radius less its own. The allowance below is the same one
  // kit/cylinder.js makes for a body drawn with no modelled wall thickness:
  // measuring against the outer radius slightly OVERSTATES the gap, never
  // understates it, so it can never report a touch that could not happen.
  const CONTACT_CLEAR = single
    ? (singleTubeR - clapperR) * 0.9
    : 0.33 * S - clapperR - 0.075 * S;
  const GAP_ANGLE = CONTACT_CLEAR / CONTACT_Y;
  // WHERE IT TOUCHES vs HOW FAST IT SWINGS are two different numbers — the same
  // split kit/cylinder.js draws between its own CONTACT_Y and L_clap, and the
  // single-tube fūrin needs it for a reason that only appeared when the body
  // took its real proportions. Shortening a 1.7S pipe to a 0.85S bell also
  // shortened the clapper's hang, which brought its period close enough to the
  // body's that it simply RODE the body instead of lagging behind it: measured,
  // a full-force tap on a size-0.18 single went from ten knocks to zero.
  //
  // The physics that was missing is the paper. A fūrin's clapper hangs on a
  // slack thread with the tanzaku's own weight below it — the thing does not
  // pivot at the bell's mouth, it swings about a centre of mass that sits
  // well past it, which is exactly why a real one is so easily set going.
  // So the clapper's pendulum reaches to the middle of the paper, roughly
  // twice the body's own length, and lags properly again. (A ring has no
  // paper below it — its tag hangs beside the clapper — so its clapper
  // swings about where it hangs, unchanged.)
  const CLAP_L = single
    ? CONTACT_Y + CLAP_REACH * (CORD + bodyBottom + THREAD + 0.5 * tagH - CONTACT_Y)
    : CONTACT_Y;
  const clapZ = createPendulum({ length: CLAP_L, g: GRAVITY, damping: SWING.damping });
  const clapX = createPendulum({ length: CLAP_L, g: GRAVITY, damping: SWING.damping });
  // The tanzaku's twist (SPIN, above): a torsional pendulum reusing the same
  // integrator, with `g` standing in for stiffness and `length` fixed at 1 so
  // alpha reads -stiffness*sin(theta) - damping*omega + torque. Only a single
  // has one — a ring's tag keeps the flutter it already had.
  const spin = single
    ? createPendulum({ length: 1, g: SPIN.stiffness, damping: SPIN.damping })
    : null;
  // The torque coefficients are scaled by the clapper's OWN g/L against the
  // SAME lean the body uses, which is what makes the equilibrium angles
  // identical and the steady-wind relative angle exactly zero — the
  // invariant in THE CLAPPER, above, that keeps the approved ambient pacing
  // untouched. Getting this wrong (reusing the body's coefficient rather
  // than its lean) would leave the clapper permanently resting against a
  // tube in any wind at all.
  const windClapZTorque = (GRAVITY / CLAP_L) * WIND_Z_LEAN;
  const windClapXTorque = (GRAVITY / CLAP_L) * WIND_X_LEAN;
  // Each tube's own direction around the ring, unit length, for deciding
  // which of them a contact rings. A single tube has no ring direction —
  // its clapper always arrives from the same side — so it gets none and the
  // cluster logic short-circuits for it.
  const tubeDirs = single ? null : state.map((tb) => {
    const x = tb.mesh.position.x, z = tb.mesh.position.z;
    const r = Math.hypot(x, z) || 1;
    return { x: x / r, z: z / r };
  });

  // a forgiving invisible target: a tap wants the chime, not a particular
  // tube. Sized to end exactly at the hang point. A single has no ring to
  // spread, so its drum shrinks to the bell and the paper below it rather
  // than leaving a wide empty halo of "whole chime" around one small body —
  // and it must reach the paper, which is the part of a fūrin a reader's
  // eye actually goes for.
  const hitR = single ? Math.max(singleTubeR, tagW / 2) + 0.09 * S : 0.8 * S;
  const hitH = single ? bodyBottom + THREAD + tagH : 2.1 * S;
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(hitR, hitR, hitH, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.tube = null;           // the whole chime, not any one tube
  hit.position.y = single ? -hitH / 2 : -1.05 * S;
  body.add(hit);

  // a small per-instance offset so two chimes in one scene never move in step
  const off = phase === null ? hash1(3, seed) * 3 : phase;

  let clock = null;         // null until the first update() — see the seeding below
  let windLevel = 1;
  let strikes = 0;
  let contacts = 0;
  let lastForce = 0;
  let lastContactAt = -Infinity;

  function fire(i, force) {
    strikes++;
    lastForce = force;
    // A clapper contact holds off the weather's own next strike on the same
    // tube, the same way one weather strike holds off the next: the tube is
    // already ringing, and the weather has no idea a hand just touched it.
    if (clock !== null) state[i].last = clock;
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

  // One contact, several tubes: the clapper touches the side of the ring it has
  // swung toward, and everything on that side speaks. `dirX`/`dirZ` is the
  // contact direction in the ring's own plane; each tube's force falls off with
  // how square-on it was struck. Several notes at once is the whole point of a
  // multi-tube ring — and the cluster VARIES, because the contact direction
  // wanders with the swing rather than being a fixed chord.
  function fireCluster(dirX, dirZ, force) {
    if (!tubeDirs) { fire(0, force); return; }
    let best = -Infinity, bestI = 0, any = false;
    for (let i = 0; i < tubeDirs.length; i++) {
      const dot = tubeDirs[i].x * dirX + tubeDirs[i].z * dirZ;
      if (dot > best) { best = dot; bestI = i; }
      if (dot <= CLUSTER_DOT) continue;
      any = true;
      fire(i, force * (0.55 + 0.45 * dot));
    }
    // A ring wide enough to leave a gap in every direction (a two-tube ring
    // struck square between them) would otherwise swallow the contact silently.
    // Ring the nearest tube instead: a touch always sounds.
    if (!any) fire(bestI, force * 0.55);
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
        // the clapper's two pendulums seed identically, and MUST: they read
        // the same gustPhase at the same offsets as the body's, and the
        // steady-wind-relative-angle-is-zero invariant is exactly the claim
        // that those four torque signals stay in step. A missed seed here
        // would leave the clapper permanently leaning against a tube.
        clapZ.clock = seed;
        clapX.clock = seed;
        if (spin) spin.clock = seed;

        // ...AND START AT THE LEAN, not hanging straight down. A chime that
        // has been hanging under a gate all afternoon is already leaning
        // wherever the wind has it; starting every pendulum at theta=0 makes
        // the whole set snap from vertical to its lean over the first second
        // of a case — during the ink dissolve, which is when the reader is
        // looking straight at it.
        //
        // It is also the one thing that could break the clapper's wind
        // invariant (THE CLAPPER, top of file). Both pendulums start from
        // rest but respond at different natural frequencies, so the startup
        // transient separates them by more than the steady state ever does:
        // measured, a five-ring built at simTime 3600 rang one clapper
        // contact it should never have rung. Seeding both to the SAME
        // equilibrium angle — which is the same number, because the leans
        // are equal by construction — starts the relative angle at exactly
        // zero and there is no transient to separate.
        //
        // theta_eq solves (g/L) sin(theta) = torque; the torque
        // coefficients above are themselves (g/L)*lean, so the g/L cancels
        // and the equilibrium is just asin(lean * gust * windLevel). Clamped
        // because a windLevel past 1/lean has no real asin — the pendulum
        // simply starts at its horizontal extreme there, which is the
        // correct limit of "leaning as far as it can."
        // The buffet is part of the drive, so it is part of the equilibrium
        // this seeds to — otherwise the chime starts at the breeze's lean and
        // is immediately shoved off it, reintroducing the startup snap in
        // miniature.
        const drive = (phase) => gustPhase(phase) + BUFFET.level * gustBuffet(phase);
        // `|| 0` collapses NEGATIVE ZERO. windLevel 0 is still air, so the
        // equilibrium is zero — but `lean * drive * 0` is -0 whenever drive is
        // negative, asin(-0) is -0, and that -0 rides all the way out to
        // swing.rotation.z. Node's strict assert distinguishes -0 from 0, so a
        // stilled chime tested for "at rest" failed on a sign that means
        // nothing. It only surfaced once gustPhase stopped being exactly 0 at
        // t = 0; the seeding was always capable of producing it.
        const eq = (lean, phase) => Math.asin(clamp(lean * drive(phase) * windLevel, -1, 1)) || 0;
        zPend.theta = clapZ.theta = eq(WIND_Z_LEAN, seed + off);
        xPend.theta = clapX.theta = eq(WIND_X_LEAN, seed * 0.7 + off + 11);
        // ...and the paper starts at its own twist, for the same reason. Its
        // restoring term is stiffness*sin(theta), so equilibrium solves
        // sin(theta) = torque/stiffness. Loosened as it now is, a full gust
        // holds it most of a radian round: unseeded, every single-tube chime
        // in the book would visibly wind up from flat over its first second.
        if (spin) {
          const sp = seed * 0.43 + off + 5;
          const tq = SPIN.wind * windLevel * (gustPhase(sp) + SPIN.buffet * gustBuffet(sp));
          spin.theta = Math.asin(clamp(tq / SPIN.stiffness, -1, 1));
        }
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
      clapZ.damping = SWING.damping;
      clapX.damping = SWING.damping;
      if (spin) { spin.damping = SPIN.damping; spin.g = SPIN.stiffness; }

      // wind is a TORQUE now, not a position — see THE SWING above. Each
      // axis reads gustPhase at its own (per-instance) phase offset so two
      // fūrin never sway in lockstep; X mirrors the old code's slower,
      // shifted copy of the same gust (never received taps before, still
      // does not). `t` here is the PENDULUM's own p.clock, seeded above to
      // track this file's absolute `clock` (to within one physics substep —
      // src/kit/pendulum.js's integratePendulum comment) rather than an
      // independent time-since-creation, which is what keeps this in phase
      // with `tt` below.
      // `drive` is the breeze plus the buffeting on it (BUFFET, above). Both
      // planes and BOTH pendulums read the identical expression at the
      // identical offsets, which is the whole basis of the clapper invariant.
      const driveZ = (t) => gustPhase(t + off) + BUFFET.level * gustBuffet(t + off);
      const driveX = (t) => gustPhase(t * 0.7 + off + 11) + BUFFET.level * gustBuffet(t * 0.7 + off + 11);
      integratePendulum(zPend, elapsed, (t) => windZTorque * driveZ(t) * windLevel);
      integratePendulum(xPend, elapsed, (t) => windXTorque * driveX(t) * windLevel);
      // The clapper reads the SAME gust at the SAME offsets — that identity
      // is what holds the steady-wind relative angle at zero and keeps the
      // approved ambient pacing out of this mechanism entirely (THE CLAPPER,
      // top of file). Only the torque COEFFICIENT differs, and only because
      // its own g/L does.
      integratePendulum(clapZ, elapsed, (t) => windClapZTorque * driveZ(t) * windLevel);
      integratePendulum(clapX, elapsed, (t) => windClapXTorque * driveX(t) * windLevel);
      // The paper turns on its thread. Its own reading of the gust (a third
      // rate, a third offset) so it never twists in step with either swing
      // plane — a strip that turned exactly when the chime swung would read
      // as one rigid object, which is the opposite of what hanging paper
      // does.
      if (spin) {
        integratePendulum(spin, elapsed, (t) => SPIN.wind * windLevel * (
          gustPhase(t * 0.43 + off + 5)
          + SPIN.buffet * gustBuffet(t * 0.43 + off + 5)));
      }

      // CONTACT. How far the clapper has swung toward metal, and from which
      // side. Symmetric in both variants now, and it only became so when the
      // single took its real shape: a clapper hanging BESIDE a lone tube
      // could close the gap on one sign of relZ only — the other swung it
      // away into open air — which needed its own signed special case here.
      // A clapper INSIDE a bell reaches the wall in every direction, exactly
      // as a ring's reaches the tube ring. One rule.
      //
      // this instance's own full-force tap velocity — the reference every
      // contact's force is measured against, read live so a harness slider
      // on SWING.tapPeak moves it too (see CLAP_FORCE's own comment for why
      // it must not be a constant in rad/s)
      const capOmega = SWING.tapPeak * omega0;
      const relZ = zPend.theta - clapZ.theta;
      const relX = xPend.theta - clapX.theta;
      const m = Math.hypot(relZ, relX);
      const uz = m > 1e-9 ? relZ / m : 0;
      const ux = m > 1e-9 ? relX / m : 0;
      if (m > GAP_ANGLE) {
        if (clock - lastContactAt > CONTACT_REFRACTORY) {
          lastContactAt = clock;
          // The radial closing speed — how hard the two actually met, not
          // how fast either is travelling. Sideways drift along the wall
          // rings nothing.
          const closing = (zPend.omega - clapZ.omega) * uz + (xPend.omega - clapX.omega) * ux;
          const force = clapForce(closing, capOmega);
          // Below minForce the two still MET — the wall below resolves it
          // either way — but too softly to speak. This is what ends a
          // ring-down; see CLAP_FORCE's own comment.
          if (force >= CLAP_FORCE.minForce) {
            contacts++;
            // +theta_z carries a hanging point toward +x and +theta_x
            // carries it toward -z (THREE's own rotation conventions), so a
            // body leading in +relZ leaves the clapper on the -x side: the
            // contact direction is the negation of the first, the plain
            // value of the second.
            fireCluster(-uz, ux, force);
          }
        }
        // THE WALL. Unconditional, refractory or not — the tube is solid
        // whether or not this particular touch is allowed to sound. Clamp
        // the clapper back to the surface and reflect whatever part of its
        // velocity was still driving into it, most of the energy going into
        // the ring rather than the rebound (CLAP_RESTITUTION). Without this
        // the clapper integrates straight on through the tubes it just rang,
        // which at a full-force tap's amplitudes is a disc visibly passing
        // through metal.
        clapZ.theta = zPend.theta - GAP_ANGLE * uz;
        clapX.theta = xPend.theta - GAP_ANGLE * ux;
        const vn = -((clapZ.omega - zPend.omega) * uz + (clapX.omega - xPend.omega) * ux);
        if (vn > 0) {
          const k = (1 + CLAP_RESTITUTION) * vn;
          clapZ.omega += k * uz;
          clapX.omega += k * ux;
        }
      }

      swing.rotation.z = zPend.theta;
      swing.rotation.x = xPend.theta;
      // the clapper's pivot is parented under the body, so its LOCAL
      // rotation is the relative angle the physics above works in
      clapperPivot.rotation.z = clapZ.theta - zPend.theta;
      clapperPivot.rotation.x = clapX.theta - xPend.theta;
      if (spin) spinPivot.rotation.y = spin.theta;
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
      // The hand IS the first contact. Without this the clapper's own first
      // meeting lands about a thirtieth of a second later — the body has
      // barely moved, so it arrives at nearly full force — and the tap reads
      // as a flam rather than a knock. Charging it to the refractory makes
      // the physics pick up where the hand left off instead of doubling it.
      if (clock !== null) lastContactAt = clock;
      if (Number.isInteger(tube)) {
        fire(((tube % state.length) + state.length) % state.length, force);
        return;
      }
      // The whole chime grabbed at once. This used to pick ONE tube by the
      // clock, so a tap on a five-tube ring made a single sound — but a hand
      // closing on a ring brushes everything on the side it came from, so it
      // rings a cluster. -x, because that is the side the clapper is about to
      // arrive from too: tapKick() kicks zPend positive, the body leads toward
      // +x, and the clapper is left behind on the other side. The hand and the
      // physics agree, and the ring-down carries on from the same place the
      // first sound came from.
      fireCluster(-1, 0, force);
    },
    // the pointer passing over: a nudge, not a knock — the same kick at a
    // fraction of the force, and no strike. CHANGED CHARACTER under the
    // pendulum: the old model summed up to 8 superposed impulses, so spamming
    // hoverAt() topped out around 0.05 rad; this model has one omega, and
    // repeated hovers now saturate at SWING.maxOmegaFrac*omega0 rad (a live
    // value, currently 0.65 — see SWING's own comment, which records 0.85 as
    // the draft code review rejected — the same ceiling a full-force tap can
    // reach). Latent today — no case calls hoverAt() — flagged here so it is
    // not discovered by surprise if one starts to.
    hoverAt() {
      tapKick(0.18);
    },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    // clapper contacts, as distinct from strikes: one contact rings a
    // CLUSTER, so strikes climbs faster than this does. Exposed for the same
    // reason cylinder.js exposes its own introspection — tests and the
    // harness need to see the mechanism without reaching into the closure.
    contacts() { return contacts; },
    gapAngle() { return GAP_ANGLE; },
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
    // has `tubes` entries, a single tube has one. Same branch as the build
    // itself: a single's body is singleLen (0.85·S), and reporting the ring
    // formula for it overstated the length by exactly 2× in the harness.
    tubeLengths() { return state.map((_, i) => (single ? singleLen : S * (1.7 - 0.14 * i))); },
  };
}
