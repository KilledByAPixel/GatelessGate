import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { hash1 } from '../util/noise.js';
import { gustPhase, gustBuffet } from '../audio/synths.js';
import { WASH } from '../palette.js';
import { createPendulum, integratePendulum, kickPendulum, pendulumEnergy } from './pendulum.js';
import { clamp } from '../util/math.js';

// The large hanging cylinder (task-cylinder-brief.md): waist-high bronze,
// one note, struck by its OWN clapper rather than a paper sail or a
// neighbour. Frank: "those only play one single note, and occasionally, if
// they get knocked by the wind, they will play one of those notes."
//
// THE IDEA, CORRECTED DURING BUILD. A clapper hung inside a swinging
// cylinder is a SECOND pendulum with its own length. The brief's story was
// that the period difference ALONE would make the two drift in and out of
// phase under a shared wind. Measured directly, that is false: with both
// pendulums reading the identical gustPhase(t), the relative angle tops out
// at 0.0399 rad against a 0.0878 rad gap — ZERO strikes over a simulated
// hour — and setting the period ratio to 1:1 (the exact thing the brief
// forbids) or a neat 2:1 changes essentially nothing (measured: 300-301
// strikes either way, cv ~0.65). The reason is quasi-static: gustPhase's own
// two frequencies are 10-25x slower than either pendulum's natural
// frequency, so BOTH pendulums nearly TRACK their equilibrium angle
// lean*gustPhase(t) regardless of period, and their difference is bounded by
// a constant (leanCyl-leanClap)*2 that never reaches GAP_ANGLE. Two
// UNCOUPLED pendulums (no back-reaction between them — see below) have
// nothing to phase-lock in the first place, so this was never a KAM-type
// resonance question.
//
// THE MECHANISM, TWICE. The first shipped mechanism was DECORRELATION: the
// clapper's torque read gustPhase at a different rate and offset from the
// body's (furin's old xPend trick), and the slow drift between the two
// equilibria is what crossed the contact gap. That design was LEVEL-
// triggered, and it is why Frank heard a soft metronome (2026-08-11, the
// hut chimes): whenever the gust ran high enough, the two decorrelated
// leans sat further apart than the gap for the whole plateau, the clapper
// rested against the wall, and the only thing metering the sound was
// REFRACTORY — measured before the fix: 1200-1430 strikes/hour at wind 1
// with a MEDIAN inter-strike gap of 0.52s (the refractory window itself)
// and runs of 13 back-to-back dings. "It keeps trying to ring it many
// times rather than one ring and then reducing the energy" — exactly.
//
// NOW: both pendulums read the SAME drive — gustPhase plus CYL_WIND.buffet
// of gustBuffet, at the same phase — the treatment furin.js got in the
// "hanging things swing in the wind" fix and this file then missed. With
// identical reads, a HELD gust level separates the equilibria by only
// (leanClap-leanCyl)*swell*|gust|, which tops out at 0.08 rad against a
// 0.176 rad gap: a steady wind, at ANY level, can no longer hold the
// clapper on the wall. What rings it is the TRANSIENT: the buffet band
// sits at the pendulums' own natural periods, the two lengths respond
// with different phase and amplitude, and an honest contact happens with
// real relative velocity — then RESTITUTION and damping spend that energy
// and it goes quiet, even if the wind stays up. Strikes cluster where the
// gust runs high (the lean difference biases the remaining margin), which
// is when a listener expects a chime to speak. No random number, no
// scheduled weather — "occasionally, if they get knocked by the wind"
// falls out of the frequency-response physics.
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

// THE PERIOD RATIO — COSMETIC, NOT THE MECHANISM. The brief asks for
// "shorter [clapper] length... irrational-ish rather than a neat 2:1, or the
// two will lock in phase." As the header comment above now says plainly:
// under this design (uncoupled pendulums, quasi-static response to a slow
// shared gust), the period ratio measurably does NOT change how often the
// cylinder rings — 1:1, 2:1 and 1/phi all produced 300-301 strikes/7200s
// with cv ~0.65 in direct comparison. There is no phase-locking here to
// avoid: with no back-reaction between cylPend and clapPend, "locking in
// phase" is not a thing two independent linear-ish oscillators driven by
// different signals can even do, so the KAM-theory framing in an earlier
// draft of this comment was wrong on its own terms, not just unconfirmed.
//
// Kept anyway, at 1/phi, for two real reasons rather than the disproved
// one: (1) it is what the brief literally asked for, and honouring it costs
// nothing; (2) it is not entirely inert — even though a tap now shoves the
// BODY rather than the clapper (BUG 1's fix, see tapKick() below), THE WALL
// still hands the clapper a velocity on every contact (RESTITUTION
// reflecting cylPend's own motion at the moment of impact), and L_clap's
// natural frequency is what governs how briskly the clapper swings back off
// the wall afterward and how much of an independent transient wobble it
// shows on top of the quasi-static wind tracking. 1/phi remains the
// closed-form choice for "shorter, not a neat fraction" if that secondary
// effect ever does matter more.
const PHI = (1 + Math.sqrt(5)) / 2;
const PERIOD_RATIO = 1 / PHI;

// SWING TUNING — live, not frozen (task-swing-tune-brief.md, PROBLEM 2: the
// same "tuned to the model it replaced" mistake furin.js's own SWING made,
// the brief flags this file by name for the identical fix). Exported as a
// mutable object, SPATIAL's own pattern (src/audio/spatial.js) — the binding
// stays const, its fields don't — so dev/hanging-audition.html can write
// straight into it and hear the very next tap change, no reload; update()
// re-reads cylDamping/clapDamping every frame and tapKick() re-reads
// tapKick every call, so a slider reaches an already-hanging cylinder, not
// just the next one built.
//
// STARTING POINTS, not final values — the owner settles these by ear through
// the harness. Damping tau = 2/c (see furin.js's own SWING comment for the
// e-folding derivation). The cylinder's existing relationship to the clapper
// holds throughout (body settles slower than its own clapper, both slower
// than any fūrin tube — a heavier object drags longer).
//
// cylDamping went 3.5s -> 7s in the "open the swing up" pass, then back to
// 4.5s here. That is not a reversal of the reasoning, it is the second half
// of Frank's complaint about the ring-down: "every time it knocks, it
// doesn't sound less loud, it just keeps..." — the FORCE law (CYL_FORCE,
// below) answers the loudness half, and this answers the "keeps" half. A
// tap's re-strikes recur at the body's own half-period regardless of
// amplitude (measured: ~0.78s apart whatever the kick), so the settle time
// is the ONLY thing that decides how many there are: 18 strikes over 13.4s
// at tau=7, 13 over 8.9s at tau=5, 9 over 5.7s at tau=3.5. 4.5s keeps a
// visibly long swing — still well above the 3.5s this started at — while
// bringing the ring-down back to something that reads as settling rather
// than as a loop.
//   cylDamping tau 7s -> 4.5s (c = 2/4.5)
//   clapDamping tau 4.5s (unchanged)
//
// tapKick 6.0 -> 2.2 rad/s — BUG FIX, found in the owner's own live audition
// of this exact harness: "when I click on it, it also doesn't seem like it
// swings at all." tapKick() (below) used to kick the CLAPPER, sized against
// the CLAPPER's own natural frequency (omega0~6.65 rad/s at the default
// size) — that is backwards. A real tap is a shove on the CYLINDER; the
// cylinder swings, the clapper lags, and the two ring by their RELATIVE
// motion, exactly the mechanism a wind gust already uses (see the header
// comment). Kicking the striker directly is what you'd fake a ring WITHOUT
// motion with, which is precisely what the owner saw. tapKick() now kicks
// cylPend (the body), so 6.0 rad/s — tuned for the clapper's ~6.65 rad/s
// natural frequency — has to be re-derived against the BODY's own, much
// slower one (omega0~4.11 rad/s at size=0.8). 2.2 rad/s lands a full-force
// tap's peak swing at ~0.51 rad (~29 degrees, measured in
// tests/cylinder.test.js) — the same ballpark as a fūrin's own full-force
// tap (SWING.tapPeak=0.55 rad, measured peak ~0.53 rad), the owner's own
// named reference for "how this should feel."
//
// A FIRST DRAFT OF THIS FIX SHRANK THE SWING INSTEAD, TO 0.9 rad/s (~12
// degrees) — WRONG DIAGNOSIS, caught in review. GAP_ANGLE (~0.088 rad) is
// tiny next to any real swing, so once the body genuinely oscillates (not
// quasi-statically tracking a slow wind lean, but ringing down over several
// natural periods at cylDamping's tau=7s), the lagging clapper re-crosses
// that threshold roughly every half-period as it settles — a real,
// physically plausible "clapper clacking the wall on each swing until it
// settles" (verified: an edge-triggered rewrite of the contact check gave
// nearly the SAME strike count, so these are genuinely separate contacts,
// not one stuck level-check re-firing). Measured directly: the RATE of
// these re-strikes is the same ~0.78s (the body's own half-period)
// regardless of tapKick — 0.9 rad/s gives 8 strikes over 5.75s, 2.2 rad/s
// gives 17 over 12.6s, 3.0 rad/s gives 20 over 14.3s. Amplitude only changes
// how LONG the ring-down keeps crossing GAP_ANGLE, never how DENSE the
// strikes are, so shrinking the swing bought a shorter loop, not a quieter
// one — the wrong knob. The actual defect was that every one of those
// re-strikes reported force~1: FORCE_OMEGA_REF (below) was calibrated for
// wind-scale contact velocities, two orders of magnitude below a tap's, so
// it saturated at any tap-scale hit and couldn't tell a decaying settle from
// the original blow. Fixed there instead (FORCE NORMALISATION, below) — a
// real bell's re-strikes diminuendo, so the RIGHT fix teaches the force law
// to track a decaying swing, not shrink the swing until the flaw is out of
// earshot.
//
// tapKick 2.2 -> 1.0 — Frank's own retune, by eye, AFTER the force
// normalisation above landed. Not the rejected 0.9 draft coming back: that
// draft shrank the swing to hide a broken force law, and the objection was
// to the diagnosis, not the amplitude. With the law fixed, a smaller kick
// is just a smaller, properly-diminishing swing — a taste call, and his to
// make ("the tap kick, reduce that to one rad/s").
export const CYL_SWING = {
  cylDamping: 2 / 4.5,
  clapDamping: 2 / 4.5,
  tapKick: 1.0,
};

// WIND LEAN (rad): the equilibrium angle a full, steady gust settles each
// pendulum at (see furin.js's WIND_Z_LEAN for the same identity). Chosen by
// simulation, not eyeballed: swept against GAP_ANGLE below (see
// cylinder-report.md's tuning table) for a rate that reads as "occasionally,
// if knocked by the wind" — tens of strikes an hour, not one every few
// swings and not one a week. The clapper's own lean is larger than the
// cylinder's: it is the lighter of the two, so the same wind torque
// coefficient formula ((g/L)*lean) needs a bigger lean to move a comparably
// light mass enough to matter.
// OPENED UP, and rebalanced against the strike rate. Frank, watching them:
// "make large bells swing farther, the sound is good but visually they should
// swing farther." Measured before this change, the book's four cylinders
// (k16, k17 x2, k28) all swung between -4.0 and +6.3 degrees over an hour —
// a lean you have to look for, on the heaviest objects in the book.
//
// The two numbers cannot move alone, and that is the whole difficulty. What
// RINGS this bell is the relative angle between cylinder and clapper passing
// GAP_ANGLE, and both angles scale with these leans — so simply making the
// swing bigger also makes it ring harder and more often, and the sound is the
// half Frank says is already right. Under the OLD decorrelated-reads design
// `clapRate` was the compensator for that; it is gone now (see THE
// MECHANISM, TWICE in the header) — both pendulums read the same drive, and
// the lean DIFFERENCE (0.04 rad here, times swell) is deliberately held
// under GAP_ANGLE so a steady gust can never park the clapper on the wall.
// The difference still matters: it is the bias that spends the contact
// margin at high gust, which is why wind strikes cluster where the ear
// expects them.
//
// Live and mutable, the same pattern CYL_SWING and CYL_FORCE already use, so
// dev/hanging-audition.html can dial them; read at construction, since the
// torque coefficients they feed are per-instance geometry.
// SO: `swell`, and it scales the WHOLE system rather than any one part of it.
// Both leans, the contact gap, and the tap kick, all by the same factor. The
// ringing is decided by the relative angle measured AGAINST that gap, and
// every one of those quantities is linear in the swell — so the bell swings
// two and a half times farther and rings at exactly the same moments, with
// exactly the same force, as it did before. Not "retuned to sound similar":
// the same system, drawn larger.
//
// The gap can move because NOBODY CAN SEE THE CLAPPER. It has no mesh at all
// (see the NO CLAPPER MESH note in makeCylinderChime) — it is pure physics
// inside an opaque bronze body, so its clearance is a free parameter in a way
// the fūrin's visible ring clapper is not. That is the one fact this whole
// change rests on.
//
// Two wrong turns are worth recording, because both look right on paper. The
// first scaled the leans alone and left the gap: the relative angle grew past
// the clearance, the clapper simply rested on the wall, and the bell rang at
// the refractory limit — 4500 strikes an hour against 1424, a rattle. The
// second tried to hold the ring rate by pushing `clapRate` back toward 1 to
// re-correlate the two gust readings; measured across 0.88 to 0.99 it moved
// the count by less than 5%, because once the relative angle is saturated the
// decorrelation is no longer what gates anything. Holding the DIFFERENCE of
// the two leans constant failed for the same reason: the dynamic part of the
// relative angle scales with the drive, not just the gap between equilibria.
// `buffet`: how much of gustBuffet — the fast, mean-zero band furin.js
// already reads, with features at the pendulums' own periods — rides on the
// slow gust. This is what makes the bronze visibly SWING in wind instead of
// quasi-statically leaning (measured before: one direction change every ~7s;
// Frank, of the hut chimes: "it doesn't really swing with the wind, it's
// held in place almost until I actually click"), and its transients are now
// the only thing that can ring the bell from wind. Level swept in
// scratch measurement across seeds, sizes and wind levels, then settled by
// ear in dev/hanging-audition.html like every other number here.
// buffet 0.5, from the sweep (an hour per config, wind 1): hung sizes land
// at 51-81 strikes/hr in gust-clustered pairs (median gap 42s, closest pair
// 0.8s — a ding and sometimes one more, then quiet), the floor bells at
// ~316/hr median 6.9s, and NOBODY's median sits at the refractory any more
// (the broken design's did: 0.52s). The fūrin's own 0.38 leaves the small
// hung cylinders nearly mute (2/hr) — shorter pendulums track the band too
// stiffly, so they need more of it.
export const CYL_WIND = {
  leanCyl: 0.07,
  leanClap: 0.11,
  swell: 2.0,
  buffet: 0.5,
};

// REFRACTORY: a contact cannot re-trigger every frame while the pendulums
// are still overlapping past GAP_ANGLE — same purpose as furin's per-tube
// REFRACTORY, sized the same order of magnitude since it is answering the
// same question (how long can one touch plausibly still be "the same
// touch").
const REFRACTORY = 0.5;

// THE WALL. Code review caught a real bug: nothing previously stopped the
// clapper's angle from sailing past GAP_ANGLE once contact was DETECTED —
// the strike fired, but clapPend.theta kept right on integrating outward, so
// a hard tap (the then-fixed MAX_CLAP_OMEGA=7.5 against omega0~6.65) swung the clapper
// disc roughly 1.1 rad against an ~0.09 rad gap: it rendered clean through
// the bronze wall and hung in open air on no visible cord. Contact was
// audible but never physically resolved.
//
// Fixed as a genuine (if simplified) collision: every update(), whenever
// the integrated relative angle exceeds GAP_ANGLE, clapPend.theta is
// clamped back to the wall (cylPend.theta +/- GAP_ANGLE) and its velocity
// relative to the wall is REFLECTED and reduced by RESTITUTION — an
// elastic-collision-off-an-effectively-infinite-mass-wall formula (the
// bronze body is far more massive than the wooden clapper, so its own
// velocity is left untouched by the bounce, same assumption real contact
// mechanics makes for a light object hitting a heavy one). RESTITUTION well
// under 1: most of the clapper's kinetic energy goes into the ring, not the
// rebound, so it settles back toward free swinging rather than bouncing
// indefinitely.
//
// This correction is UNCONDITIONAL — it runs every frame contact persists,
// refractory window or not. Refractory only gates the SOUND event; the
// bronze itself is solid regardless of whether this particular touch is
// allowed to make another noise.
const RESTITUTION = 0.35;

// A tap is a shove: a velocity kick to the CYLINDER BODY (cylPend), not the
// clapper — BUG FIX (owner's live audition, see CYL_SWING.tapKick's own
// comment above for the full story). The very same relative-angle contact
// check the wind uses is what fires the strike from there — "by the same
// mechanism," per the brief, not a separate play-the-sound-now path — the
// body swings, the clapper (at rest, feeling no torque of its own at
// theta=0) is momentarily left behind, and the two cross GAP_ANGLE from
// their RELATIVE motion exactly as a gust drives them together. Read LIVE
// inside tapKick() below (not captured at construction), same reasoning as
// furin.js's own tapKick().
//
// Mashing taps saturates, as in furin.js — and unlike the clapper (which
// THE WALL, below, bounds unconditionally regardless of its own velocity),
// nothing else stops the BODY itself from swinging arbitrarily far under a
// sustained mash: there is no wall for cylPend's own absolute angle, only
// for the clapper's angle relative to it. furin.js's own file documents why
// a velocity-only clamp does not actually solve this ("holding the
// throttle open" — each kick re-arms omega to the ceiling regardless of how
// far damping had pulled it down since the last one, measured there at 16+
// rad, several full rotations, from a sustained mash). tapKick() below uses
// the identical ENERGY cap furin.js's own tapKick() does, for the identical
// reason, sized as a fixed multiple of the LIVE tapKick so raising the kick
// from the harness raises its own cap with it rather than leaving a stale
// ceiling behind.
const MAX_CYL_OMEGA_MULT = 1.3;

// FORCE NORMALISATION — TWO SEGMENTS MEETING AT THE WIND REFERENCE. "Strike
// force should scale with the relative angular VELOCITY at contact" was
// always right; what keeps going wrong is the SHAPE, because wind and a tap
// are two regimes about 150x apart in contact velocity and one naive curve
// always ends up serving only one of them.
//
// THE THREE DRAFTS, EACH MEASURED (full-force tap, seed 7, still air; the
// force law never feeds back into the pendulums, so one recorded relOmega
// sequence can be replayed through every candidate law and the comparison is
// exact rather than two runs that might have drifted apart):
//
//   |relOmega|   2.13 0.08 0.56 1.44 1.37 1.27 1.17 1.11 1.01 0.93 0.79
//                0.72 0.82 0.68 0.50 0.33 0.18 0.06     <- 34:1, a real decay
//
//   1. one linear reference at FORCE_OMEGA_REF (wind-tuned): seventeen of
//      eighteen strikes pinned at exactly 1. A machine hammering.
//   2. a knee from 0.7 up to 1: 0.95 0.69 0.76 0.87 0.86 ... 0.71 0.55 —
//      4.8dB peak-to-last, and strikes 5-16 inside a 1.6dB band. The whole
//      upper segment only SPANS 0.7-1.0, so a 34:1 velocity decay could not
//      express more than 3dB no matter what the pendulums did. Frank heard
//      exactly that: "every time it knocks, it doesn't sound less loud."
//   3. this one: 0.94 0.29 0.47 0.70 0.67 0.63 0.59 0.55 0.50 0.53 0.46
//      0.38 0.30 — 9.9dB peak-to-last, monotone apart from the physics' own
//      one-strike rebound, at CYL_SWING's shortened settle (13 strikes over
//      8.9s rather than 18 over 13.4s).
//
// The fix is that the knee had to come DOWN, not the segment above it get
// steeper: the knee level is the ceiling on wind AND the floor on the whole
// tap ring-down at once, so 0.7 left taps only the top 30% of the range to
// fade through. At 0.30 they have 70%.
//
// Wind is then held where Frank has already heard it by compressing BELOW
// the knee instead of running linearly to it: `kneeLevel * (w/REF)^windGamma`
// with windGamma < 1 is concave, so a typical light gust contact lands near
// the knee rather than near zero. Measured over a simulated hour at full
// wind, median wind force is 0.137 against the old law's 0.122 — slightly
// LOUDER, not quieter, which is why BRONZE.level needs no compensating
// change this time. What wind loses is its own internal dynamic range
// (p10-p90 goes 0.029-0.289 to 0.071-0.202): gusts read more uniform now.
// That is the honest cost, and it is the right side to pay it on — a chime
// answering the wind wants to be a steady texture, and a chime answering a
// hand wants to be an event that fades.
//
// Deliberately no floor above the knee, unlike furin's tapKick force: "a
// graze barely sounds" is the point, not a defect to pad away.
//
// CYL_FORCE — live, not frozen, same pattern as CYL_SWING above (mutable
// object, dev/hanging-audition.html writes straight into it,
// forceForRelOmega re-reads every field on every call so a slider reaches
// the very next strike). REF stays a plain const: it is the boundary BETWEEN
// the two regimes, the one number here that is a measurement of the wind
// rather than a judgment about loudness.
const FORCE_OMEGA_REF = 0.08;
export const CYL_FORCE = {
  kneeLevel: 0.30,   // force at the wind/tap boundary: wind's ceiling, the ring-down's floor
  windGamma: 0.45,   // <1 compresses wind upward toward the knee, so a light gust still sounds
  cap: 2.3,          // contact velocity that reports full force — a hard tap's own first contact
  tapGamma: 1.0,     // shape of the tap segment; >1 makes the ring-down fall away sooner
};

// NOTE FROM SIZE. "Size and pitch must move together... derive one from the
// other rather than letting a case set both and contradict itself." A
// bigger cylinder gets a LOWER note: NOTE_SPAN scale-degree steps spread
// across the brief's own stated size range (0.6-1.0, "waist-high"), so the
// full range of plausible sizes covers one octave of this book's five-note
// scale (NOTE_SPAN=5) end to end. Integer, because the engine's chime
// voices are addressed by scale degree, not raw Hz (see
// audio/engine.js's cylinderStrike).
// NOTE_REF is where note 0 sits and, with SIZE_MAX, sets the slope. SIZE_MIN is
// only the clamp's floor, and the two are SEPARATE because they were the same
// number and that was a bug: a hung cylinder is not a waist-high one.
//
// `hangChimes` picks a cylinder as one of its four kinds and sizes it from a
// world drop — 0.23 to 0.48, a third of the floor-standing object. Every one of
// those fell below the old floor of 0.6 and clamped to note 0, so two hung
// cylinders of visibly different size always sounded the same pitch (Frank:
// "they're coming out of different sizes, but the note is the same"). A bound
// written for one caller was silently flattening another.
//
// 0.2 covers what the kit actually builds and yields a 3-degree spread across
// the hung band — two chimes on one eave differ audibly without playing a tune.
// The floor-standing chime is untouched: 0.6 is still note 0 and 1.0 still -5,
// because those sit above the floor and read the same slope they always did.
const NOTE_REF = 0.6, SIZE_MIN = 0.2, SIZE_MAX = 1.0, NOTE_SPAN = 5;
export function noteForSize(size) {
  // Still clamped, for the reason code review gave: the formula is a straight
  // line and would happily extrapolate a `size` of, say, 3 into a note many
  // octaves off the family's register. The floor is now wide enough to admit
  // every size the kit builds, which is what a bound is supposed to be.
  const s = clamp(size, SIZE_MIN, SIZE_MAX);
  // -0 guard: at size===SIZE_MIN the raw round is 0, and negating a literal
  // 0 in JS produces -0 — harmless as a scale-degree offset (hz(-0) reads
  // identically to hz(0)) but a needless surprise for anything that
  // compares this against a plain 0 with strict equality.
  const steps = Math.round(NOTE_SPAN * (s - NOTE_REF) / (SIZE_MAX - NOTE_REF));
  return steps === 0 ? 0 : -steps;
}

// Pure, exported so tests/cylinder.test.js can pin the scaling law itself
// (monotonic, clamped, zero at zero, and — the property that matters most
// after the soft-knee fix — a genuinely decaying sequence of |w| produces a
// genuinely decaying sequence of force, not a column of 1s) independently
// of the physics that feeds it a relOmega.
//
// TWO SEGMENTS, ONE CONTINUOUS CURVE (see FORCE NORMALISATION, above, for
// why one curve can't serve both wind and tap scales at once). Below
// FORCE_OMEGA_REF — wind's whole range — force rises to kneeLevel along a
// concave power curve, so a light gust contact still sounds. At and above
// it — a tap's whole ring-down — force runs from kneeLevel up to 1 as |w|
// climbs from REF to cap, then clamps. The two segments agree exactly at
// |w|=REF (both evaluate to kneeLevel there: (REF/REF)^windGamma is 1 for
// any windGamma, and the upper segment's own t is 0), so the curve is
// continuous — only its slope changes, which is the "knee." Every field is
// read fresh on every call (CYL_FORCE is live), so a harness slider reaches
// the very next strike.
export function forceForRelOmega(relOmega) {
  const w = Math.abs(relOmega);
  const { kneeLevel, windGamma, cap, tapGamma } = CYL_FORCE;
  if (w <= FORCE_OMEGA_REF) return kneeLevel * Math.pow(w / FORCE_OMEGA_REF, windGamma);
  const t = clamp((w - FORCE_OMEGA_REF) / (cap - FORCE_OMEGA_REF), 0, 1);
  return kneeLevel + (1 - kneeLevel) * Math.pow(t, tapGamma);
}

// scratch for reporting the struck body's world position — shared across
// every instance and every fire(), so a strike costs no allocation (same
// pattern as furin.js's WORLD)
const WORLD = new THREE.Vector3();

// HOW FAR IT REACHES BELOW ITS KNOT, in units of size, cord excluded — the
// cylinder's half of the pair furin.js's FURIN_REACH is the other of. Measured
// off built geometry at four sizes and exactly flat: 0.984, rounded up.
//
// The two families scale COMPLETELY differently — a fūrin is 2.1x its size
// tall, this is 0.98x — so the same `size` number means two different objects.
// Hanging both from one table with one size band is how the cylinders came out
// at half the apparent scale of everything beside them (Frank: "the cylinder
// ones are too small... maybe we're usually using small ones for some reason").
// The reason was this number, and the fix is to size both families from a world
// height and divide by their own reach.
export const CYL_REACH = 0.99;

export function makeCylinderChime({
  size = 0.8, seed = 11, phase = null, onStrike = null,
  cord = 0.30,              // the hanging string, in units of size; 0 for none
  cordLength = null,        // ...or an absolute length in world units, which wins — see makeFurin's own comment
  color = WASH.stone,        // bronze — a case that wants this AS the seal can pass ACCENT
} = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'cylinder-chime';

  const wood = washMaterial({ color: WASH.dark, flat: true });
  const bronze = washMaterial({ color, flat: true });

  const swing = new THREE.Group();   // the whole body, pivoting at the hang point
  swing.name = 'swing';
  g.add(swing);

  const CORD = cordLength === null ? cord * S : Math.max(0, cordLength);
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
  hit.position.y = bodyTopY - BODY_LEN / 2;
  swing.add(hit);

  // THE CLAPPER. Its own pivot group, independent of `swing` — it does NOT
  // ride inside the body's rotation, because that would make this a real
  // (chaotic) double pendulum instead of the two-independent-pendulums
  // model this file commits to (see the header comment). It hangs at
  // CONTACT_Y below the SAME origin the body swings from.
  //
  // CONTACT_Y is a purely geometric choice — where the clapper's contact
  // with the wall is measured — kept deliberately separate from L_clap (the
  // pendulum length that sets the clapper's natural frequency, below).
  // Forcing them to be the same number was tried first: solving for a cord
  // length that puts a golden-ratio-period clapper deep enough in the tube
  // to look right has no positive solution (L_clap grows only 0.38x as fast
  // as CONTACT_Y needs to, for any cord length — see cylinder-report.md).
  // Two honestly-separate eyeballed numbers, the same spirit as furin.js's
  // own acknowledged COM fraction, beat one number that cannot satisfy both
  // jobs at once.
  const CONTACT_Y = (CORD + CAP_H) + 0.65 * BODY_LEN;   // 65% down the tube, well inside it
  const CLAP_R = 0.06 * S;   // physics-only now (GAP_LINEAR, below) — see the deletion note

  // NO CLAPPER MESH — deleted per the owner's own live audition: "there
  // might be something you're trying to hang inside the bronze cylinder,
  // because I can kind of see it go through the side when I click on it...
  // if it's inside of it, you're not gonna be able to see that, it's better
  // not have it at all." An earlier review had already flagged the mesh as
  // "permanently occluded by the opaque body at rest" (unlike furin's
  // clapper, visible in the open ring among the tubes, this one sits INSIDE
  // a solid, opaque bronze cylinder and — now that THE WALL, below, keeps
  // its swing bounded to GAP_ANGLE of the body's own rotation — can never
  // swing clear of the body's silhouette either) and excluded it from the
  // hull outline on those grounds, which only ever saved the hull's own
  // draw call, not the clapper's own. Deleting the mesh outright removes
  // both: the book was spending a draw rendering something nobody could
  // ever see, and the
  // thing occasionally visible poking through the wall (a rendering
  // artifact of a solid disc swinging inside a low-poly, unlined tube, not
  // a physics bug — THE WALL already keeps the underlying angle bounded)
  // goes with it.
  //
  // clapPend (below) is untouched — "the clapper pendulum is what decides
  // when the thing rings and must stay exactly as it is," the owner's own
  // words. clapperPivot survives too, as a bookkeeping node only: it has no
  // geometry of its own now (an empty THREE.Group costs nothing in the
  // draw-call count — tests/staging.test.js's own rule only counts meshes),
  // but update() still writes clapPend.theta into its rotation.z every
  // frame, which is what lets tests (and the harness) read the clapper's
  // pose via getObjectByName('clapper-pivot') without reaching into this
  // closure's private state — the same Node-testable-introspection contract
  // periods()/gapAngle() already give the physics.
  const clapperPivot = new THREE.Group();
  clapperPivot.name = 'clapper-pivot';
  g.add(clapperPivot);

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
  const GAP_ANGLE = (GAP_LINEAR / CONTACT_Y) * CYL_WIND.swell;

  // damping starts at CYL_SWING's current value but is re-read live every
  // update() (below), same reasoning as furin.js's own zPend/xPend.damping
  const cylPend = createPendulum({ length: L_cyl, g: GRAVITY, damping: CYL_SWING.cylDamping });
  const clapPend = createPendulum({ length: L_clap, g: GRAVITY, damping: CYL_SWING.clapDamping });
  // both leans, the gap below, and the tap kick all take CYL_WIND.swell —
  // see its own comment for why scaling the whole system together is what
  // makes a bigger swing sound identical rather than merely similar
  const windCylTorque = (GRAVITY / L_cyl) * CYL_WIND.leanCyl * CYL_WIND.swell;
  const windClapTorque = (GRAVITY / L_clap) * CYL_WIND.leanClap * CYL_WIND.swell;

  const note = noteForSize(S);

  // a small per-instance offset so two cylinders in one scene never move in
  // step — same role as furin's `off`
  const off = phase === null ? hash1(4, seed) * 3 : phase;

  let clock = null;        // null until the first update() — see the seeding below
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;
  let lastStrikeAt = -Infinity;

  // A tap's velocity kick — to cylPend, the BODY, per BUG 1's fix (see
  // CYL_SWING.tapKick's own comment for the sizing story). Shared by ring()
  // and hoverAt() below, same split furin.js uses. Both CYL_SWING.tapKick
  // and MAX_CYL_OMEGA_MULT are read LIVE, not captured at construction, so a
  // harness slider reaches an already-hanging cylinder.
  //
  // THE ENERGY CAP — identical technique to furin.js's own tapKick(), for
  // the identical reason (see MAX_CYL_OMEGA_MULT's own comment above): a
  // plain velocity clamp bounds one kick but not a sustained mash, since
  // each kick re-arms omega to the ceiling regardless of how far damping
  // had already pulled it down since the last one. Capping the pendulum's
  // total mechanical ENERGY to what one maximally-hard single tap could
  // reach means no amount of mashing, at any rate, can ever exceed that —
  // solved from the energy budget rather than a flat ceiling, so a kick
  // landing while the body is already swung out wide is capped harder than
  // one landing near the bottom (there is less "room" left to add).
  function tapKick(force) {
    // swell scales the kick with everything else, so a TAPPED bell swings
    // farther by the same factor the wind does and still rings identically —
    // the gap it rings against grew by the same amount (CYL_WIND.swell)
    const kick = CYL_SWING.tapKick * CYL_WIND.swell;
    const maxOmega = MAX_CYL_OMEGA_MULT * kick;
    kickPendulum(cylPend, force * kick);
    cylPend.omega = clamp(cylPend.omega, -maxOmega, maxOmega);
    const maxEnergy = 0.5 * maxOmega * maxOmega;
    if (pendulumEnergy(cylPend) > maxEnergy) {
      const pe = (GRAVITY / L_cyl) * (1 - Math.cos(cylPend.theta));
      const keAllowed = Math.max(0, maxEnergy - pe);
      const omegaAllowed = Math.sqrt(2 * keAllowed);
      const sign = cylPend.omega === 0 ? 1 : Math.sign(cylPend.omega);
      cylPend.omega = sign * Math.min(Math.abs(cylPend.omega), omegaAllowed);
    }
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

      // CYL_SWING.cylDamping/clapDamping read fresh every frame, not just at
      // construction — same reasoning as furin.js's own SWING.damping: a
      // harness slider dragged mid-scene has to reach an already-hanging
      // cylinder.
      cylPend.damping = CYL_SWING.cylDamping;
      clapPend.damping = CYL_SWING.clapDamping;

      // `t` in each callback is the PENDULUM's own p.clock, seeded above to
      // track this file's absolute `clock` (furin.js's same pattern, and
      // the same reason: torqueAt must read gustPhase at a clock that stays
      // locked to the one strikes/rendering read, not an independent
      // time-since-creation). `off` is the per-instance offset. BOTH
      // pendulums read the IDENTICAL drive — same phase, same buffet — so a
      // held gust level cannot separate their equilibria past the gap; only
      // their different lengths answering the fast band differently can
      // touch them (see THE MECHANISM, TWICE in the header). CYL_WIND.buffet
      // is read live inside the closure, so a harness slider reaches an
      // already-hanging bell mid-swing.
      const drive = (t) => gustPhase(t + off) + CYL_WIND.buffet * gustBuffet(t + off);
      integratePendulum(cylPend, elapsed, (t) => windCylTorque * drive(t) * windLevel);
      integratePendulum(clapPend, elapsed, (t) => windClapTorque * drive(t) * windLevel);

      // CONTACT. Read the raw integrated relative angle BEFORE any
      // correction — this is what actually happened this frame, and it is
      // what both the strike decision and THE WALL below react to.
      //
      // No separate "was below GAP_ANGLE last frame" edge flag is needed:
      // THE WALL (below) always leaves the relative angle at or under
      // GAP_ANGLE by the END of every frame that ran it, so "still
      // overlapping right now" already implies "still in the SAME contact,"
      // and REFRACTORY is what stops that from re-firing every frame on its
      // own — a level check, refractory-gated, rather than an edge check.
      // (A version of this file that kept the old edge flag would have had
      // to re-derive that invariant to know the flag was now redundant;
      // simpler to just not carry state that the wall already makes true.)
      const relTheta = cylPend.theta - clapPend.theta;
      if (Math.abs(relTheta) > GAP_ANGLE && clock - lastStrikeAt > REFRACTORY) {
        // Measured in UN-SWELLED units. CYL_WIND.swell scales every angle and
        // therefore every angular velocity in this system; the force law's own
        // thresholds (FORCE_OMEGA_REF, CYL_FORCE.cap) are absolute rad/s and
        // were calibrated by ear against the unscaled bell. Dividing here
        // rather than scaling those two keeps forceForRelOmega a pure function
        // with the meaning it was tuned to have — and without it a swelled
        // bell pins every contact at 1.0 and the ring-down stops diminuendo,
        // which is precisely the half Frank said was already right.
        fire(forceForRelOmega((cylPend.omega - clapPend.omega) / CYL_WIND.swell));
      }

      // THE WALL — see its own comment above (RESTITUTION). Unconditional:
      // the bronze is solid whether or not THIS touch is allowed to sound.
      if (Math.abs(relTheta) > GAP_ANGLE) {
        clapPend.theta = clamp(clapPend.theta, cylPend.theta - GAP_ANGLE, cylPend.theta + GAP_ANGLE);
        const relOmega = clapPend.omega - cylPend.omega;
        clapPend.omega = cylPend.omega - RESTITUTION * relOmega;
      }

      swing.rotation.z = cylPend.theta;
      clapperPivot.rotation.z = clapPend.theta;
    },

    // A tap: a shove to the CYLINDER BODY, the same mechanism a gust uses —
    // see CYL_SWING.tapKick's own comment for why this was the bug (it used
    // to shove the clapper instead, ringing the voice with nothing visibly
    // moving). Rings through the SAME contact check above on the next
    // update(), not a separate "play now" path.
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
