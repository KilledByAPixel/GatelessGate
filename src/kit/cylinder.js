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
// THE ACTUAL MECHANISM: the clapper's torque reads gustPhase at a DIFFERENT
// reading of the same gust (CLAP_GUST_RATE/CLAP_GUST_OFFSET, below) — the
// same decorrelation trick furin.js's xPend already uses to keep two things
// "driven by the same wind" from moving in lockstep. THAT is what makes the
// two drift in and out of phase; the period ratio does not meaningfully
// contribute to it under this design. It is kept anyway — see
// PERIOD_RATIO's own comment for why — but read as the brief's literal
// instruction honoured, not as the cause of the irregularity. When the
// relative angle crosses the physical clearance between clapper and wall,
// they touch and the cylinder rings. No random number, no scheduled
// weather, no threshold hack — "occasionally, if they get knocked by the
// wind" falls out of the decorrelated-gust-reading physics.
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
// e-folding derivation); both roughly doubled from the shipped values, same
// "much longer settle" direction furin.js's own retune took, keeping the
// cylinder's existing relationship to the clapper (body settles slower than
// its own clapper, both slower than any fūrin tube — a heavier object drags
// longer):
//   cylDamping tau 3.5s -> 7s (c = 2/7)
//   clapDamping tau 2.2s -> 4.5s (c = 2/4.5)
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
export const CYL_SWING = {
  cylDamping: 2 / 7,
  clapDamping: 2 / 4.5,
  tapKick: 2.2,
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
const WIND_LEAN_CYL = 0.07;
const WIND_LEAN_CLAP = 0.11;

// THE MECHANISM (see the header comment for how this was found: not what
// the brief predicted). The clapper's torque reads gustPhase at a DIFFERENT
// reading of the same gust — same trick furin.js's xPend uses (*0.7, +11)
// to keep two things driven by "the same wind" from moving in lockstep.
// This, not the period ratio, is what makes the two drift in and out of
// phase: remove it (feed both pendulums the identical gustPhase(t)) and
// strikes drop to ZERO over a full simulated hour, regardless of period
// ratio. Reused verbatim from furin.js rather than inventing new constants,
// since it is already a proven decorrelation in this exact codebase.
const CLAP_GUST_RATE = 0.7;
const CLAP_GUST_OFFSET = 11;

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

// FORCE NORMALISATION — A SOFT KNEE, not one reference. "Strike force should
// scale with the relative angular VELOCITY at contact" was always right;
// what was wrong (code review, on the first draft of BUG 1's fix) was a
// SINGLE linear reference doing that job for two regimes 20-40x apart in
// scale. FORCE_OMEGA_REF=0.08 was tuned against wind alone (the 90th
// percentile of wind-driven contact velocity was ~0.037 rad/s, observed max
// ~0.24 rad/s — cylinder-report.md and a fresh 7200s measurement agree) and
// a straight `clamp(|w|/REF, 0, 1)` saturates at 1 for ANY tap-scale contact
// (measured: a tap's re-strikes span roughly 0.02-2.9 rad/s as they decay,
// i.e. 25-3600% of REF) — every one of them pinned at maximum, so a
// genuinely decaying ring-down sounded like a machine hammering at full
// volume until it abruptly stopped, not a bell settling. Measured directly
// on a real tap decay (kick=2.2, still air): the OLD law's relOmega sequence
// 2.15, 0.02, 0.56, 1.42, 1.33, ... 0.06 rad/s reported force
// 1, 1(ish), 1, 1, 1, ... 1 — the underlying physics already diminuendos,
// the force law just couldn't see it.
//
// The fix keeps FORCE_OMEGA_REF exactly as wind-tuned it (below REF, force
// is still literally `(|w|/REF) * FORCE_KNEE_LEVEL` — same shape, same
// relative ordering among wind strikes as before, just scaled down by the
// KNEE_LEVEL factor to leave headroom above) and adds a SECOND segment above
// it, rising from FORCE_KNEE_LEVEL up to 1 as |w| climbs from REF to
// FORCE_OMEGA_CAP — a genuinely tap-scale reference (~2.5 rad/s, near the
// hardest contact velocity a full-force tap actually reaches; see
// tests/cylinder.test.js's own decay-sequence test) rather than a wind-scale
// one. A tap's whole ring-down now lands mostly in this upper segment and
// visibly, audibly tapers as it decays; wind's own dynamic range is
// preserved in SHAPE (still quiet-to-loud in the same relative order) at a
// deliberate, documented ~30% overall reduction from before — the honest
// cost of sharing one continuous, monotonic law across two regimes this far
// apart, rather than silently degrading one of them by picking a reference
// that only serves the other. `BRONZE.level` (audio/synths.js) may want
// revisiting now that typical wind strikes run quieter than the level it was
// last judged against — flagged there, not fixed here, since it needs ears,
// not arithmetic.
//
// Deliberately no floor, unlike furin's tapKick force: "a graze barely
// sounds" is the point, not a defect to pad away.
const FORCE_OMEGA_REF = 0.08;
const FORCE_KNEE_LEVEL = 0.7;
const FORCE_OMEGA_CAP = 2.5;

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
  // Clamped to the brief's own stated range: the formula is a straight
  // line and would happily extrapolate a `size` of, say, 3 into a note
  // many octaves off the family's register — code review flagged this as
  // unclamped. `makeCylinderChime` never passes an out-of-range size today,
  // but the function is exported and public, so it holds its own contract
  // rather than trusting every future caller to.
  const s = clamp(size, SIZE_MIN, SIZE_MAX);
  // -0 guard: at size===SIZE_MIN the raw round is 0, and negating a literal
  // 0 in JS produces -0 — harmless as a scale-degree offset (hz(-0) reads
  // identically to hz(0)) but a needless surprise for anything that
  // compares this against a plain 0 with strict equality.
  const steps = Math.round(NOTE_SPAN * (s - SIZE_MIN) / (SIZE_MAX - SIZE_MIN));
  return steps === 0 ? 0 : -steps;
}

// Pure, exported so tests/cylinder.test.js can pin the scaling law itself
// (monotonic, clamped, zero at zero, and — the property that matters most
// after the soft-knee fix — a genuinely decaying sequence of |w| produces a
// genuinely decaying sequence of force, not a column of 1s) independently
// of the physics that feeds it a relOmega.
//
// TWO SEGMENTS, ONE CONTINUOUS CURVE (see FORCE NORMALISATION, above, for
// why one linear reference can't serve both wind and tap scales at once).
// Below FORCE_OMEGA_REF: identical shape to the original wind-only law
// (|w|/REF), scaled down by FORCE_KNEE_LEVEL so it never exceeds the knee.
// At and above FORCE_OMEGA_REF: rises linearly from FORCE_KNEE_LEVEL to 1 as
// |w| runs from REF to FORCE_OMEGA_CAP, then clamps — this is where a tap's
// whole ring-down lives, so this is the segment that actually diminuendos.
// The two segments agree exactly at |w|=REF (both evaluate to
// FORCE_KNEE_LEVEL there), so the curve has no discontinuity, only a change
// of slope — the "knee."
export function forceForRelOmega(relOmega) {
  const w = Math.abs(relOmega);
  if (w <= FORCE_OMEGA_REF) return (w / FORCE_OMEGA_REF) * FORCE_KNEE_LEVEL;
  const t = clamp((w - FORCE_OMEGA_REF) / (FORCE_OMEGA_CAP - FORCE_OMEGA_REF), 0, 1);
  return FORCE_KNEE_LEVEL + (1 - FORCE_KNEE_LEVEL) * t;
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
  // swing clear of the body's silhouette either) and marked it noOutline on
  // those grounds, which only ever saved the outline's own draw call, not
  // the clapper's own. Deleting the mesh outright removes both: the book
  // was spending a draw rendering something nobody could ever see, and the
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
  const GAP_ANGLE = GAP_LINEAR / CONTACT_Y;

  // damping starts at CYL_SWING's current value but is re-read live every
  // update() (below), same reasoning as furin.js's own zPend/xPend.damping
  const cylPend = createPendulum({ length: L_cyl, g: GRAVITY, damping: CYL_SWING.cylDamping });
  const clapPend = createPendulum({ length: L_clap, g: GRAVITY, damping: CYL_SWING.clapDamping });
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
    const maxOmega = MAX_CYL_OMEGA_MULT * CYL_SWING.tapKick;
    kickPendulum(cylPend, force * CYL_SWING.tapKick);
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
      // time-since-creation). `off` is the per-instance offset; the
      // clapper's extra `*CLAP_GUST_RATE, +CLAP_GUST_OFFSET` is the
      // different-reading-of-the-same-gust decorrelation explained above.
      integratePendulum(cylPend, elapsed, (t) => windCylTorque * gustPhase(t + off) * windLevel);
      integratePendulum(clapPend, elapsed,
        (t) => windClapTorque * gustPhase(t * CLAP_GUST_RATE + off + CLAP_GUST_OFFSET) * windLevel);

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
        fire(forceForRelOmega(cylPend.omega - clapPend.omega));
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
