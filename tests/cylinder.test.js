import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCylinderChime, noteForSize, forceForRelOmega, CYL_SWING, CYL_WIND } from '../src/kit/cylinder.js';
import { createPendulum, integratePendulum } from '../src/kit/pendulum.js';
import { gustPhase } from '../src/audio/synths.js';

// The large hanging cylinder (task-cylinder-brief.md): a second pendulum
// (the clapper) whose torque reads a DIFFERENT phase/rate of the same wind
// than the cylinder's own — that decorrelation, not the period difference
// between them, is what makes the two drift in and out of phase under a
// steady wind (see cylinder.js's header comment: the period-ratio story in
// an earlier draft measured out false — 1:1, 2:1 and 1/phi all produced
// comparable strike statistics once the decorrelated gust reading was in
// place). The resulting strikes are a physical consequence of that
// decorrelation, not a scheduled event.
//
// Several tests below reconstruct the physics INDEPENDENTLY from documented
// formulas (same technique as tests/furin.test.js's "swing's wind phase
// stays locked" test) rather than reaching into src/kit/cylinder.js's
// private state — a wrong-but-plausible formula inside the real module
// cannot make an independent reproduction agree with it by accident. The
// reproduction includes THE WALL (see cylinder.js): a contact clamps the
// clapper's angle to the cylinder's own +/- GAP_ANGLE and reflects its
// velocity with RESTITUTION, so the clapper can never integrate through
// the bronze the way an unconstrained kick briefly could (code review
// caught that bug against the real module; this reproduction has to model
// the fix, not just the original contact detection, or it would silently
// stop matching the real module the moment a strong tap was involved).

function run(f, secs, t0 = 0, step = 1 / 60) {
  for (let i = 0; i * step < secs; i++) f.update(step, t0 + i * step);
  return t0 + secs;
}

// ---- an independent reproduction of the physics, duplicating cylinder.js's
// documented constants on purpose (same caveat furin.test.js accepts: if
// those constants ever change, this copy needs updating too) ----
const PHI = (1 + Math.sqrt(5)) / 2;
const GRAVITY = 9.8;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const RESTITUTION = 0.35;

function reference({ size = 0.8, T0 = 0 } = {}) {
  const S = size;
  const CORD = 0.30 * S, CAP_H = 0.07 * S, BODY_LEN = 0.85 * S, BODY_R = 0.15 * S, CLAP_R = 0.06 * S;
  const CONTACT_Y = (CORD + CAP_H) + 0.65 * BODY_LEN;
  const L_cyl = CORD + 0.5 * BODY_LEN;
  const L_clap = L_cyl * (1 / PHI) * (1 / PHI);
  // CYL_WIND is read LIVE, the same reasoning the CYL_SWING damping below
  // already follows: the leans, the contact gap and the force scale are all
  // exported tunables now, and a hardcoded copy here would silently stop
  // matching the module the moment one of them moves. `swell` scales the
  // whole system together (see CYL_WIND in cylinder.js), so it has to land
  // on all three of them here exactly as it does there.
  const GAP_ANGLE = (((BODY_R - CLAP_R) * 0.9) / CONTACT_Y) * CYL_WIND.swell;
  const windCylTorque = (GRAVITY / L_cyl) * CYL_WIND.leanCyl * CYL_WIND.swell;
  const windClapTorque = (GRAVITY / L_clap) * CYL_WIND.leanClap * CYL_WIND.swell;
  // damping reads the real, LIVE CYL_SWING object rather than a hardcoded
  // copy — CYL_SWING.cylDamping/clapDamping are exported, mutable tunables
  // now (task-swing-tune-brief.md, the harness writes into them directly),
  // so a hardcoded literal here would silently stop matching the real module
  // the moment the starting value changes again (same reasoning furin.test.js
  // applies to SWING.damping).
  const cyl = createPendulum({ length: L_cyl, g: GRAVITY, damping: CYL_SWING.cylDamping, clock: T0 });
  const clap = createPendulum({ length: L_clap, g: GRAVITY, damping: CYL_SWING.clapDamping, clock: T0 });
  const REFRACTORY = 0.5;
  let lastStrikeAt = -Infinity;
  // Mirrors cylinder.js's own `elapsed = clock - prevClock` bookkeeping
  // exactly, rather than trusting the caller's `dt` argument directly. Found
  // by mutation-verifying the seeding test at a large T0: trusting a clean
  // literal `dt` (1/60) instead of re-deriving it via subtraction of two
  // large absolute floats (T0 + i*dt) — (T0 + (i-1)*dt) put this reference a
  // few ULPs off the real module's own arithmetic, and for the first ~10
  // strikes (near-zero theta/omega, where a threshold crossing is most
  // sensitive to a tiny timing difference) that was enough to land the
  // strike in an adjacent 1/60s frame — a real, bounded floating-point
  // artifact of comparing two different computation PATHS to the same
  // elapsed time, same as pendulum.js's own documented "not bit-identical,
  // but agree to a small tolerance" — not a bug in either module. Deriving
  // `elapsed` here the exact same way cylinder.js does eliminates it
  // entirely rather than just tolerating it: verified 0 diff, all strikes,
  // both T0=0 and T0=5237.4 (see cylinder-report.md's addendum).
  let prevT = T0;
  const strikes = [];
  return {
    L_cyl, L_clap, GAP_ANGLE, cyl, clap, strikes,
    step(_dt, t, windLevel = 1) {
      const elapsed = Math.max(0, t - prevT);
      prevT = t;
      integratePendulum(cyl, elapsed, (tt) => windCylTorque * gustPhase(tt) * windLevel);
      integratePendulum(clap, elapsed, (tt) => windClapTorque * gustPhase(tt * CYL_WIND.clapRate + 11) * windLevel);

      // same level+refractory gating cylinder.js uses now (no separate edge
      // flag needed — see its own comment for why THE WALL below makes that
      // redundant)
      const relTheta = cyl.theta - clap.theta;
      if (Math.abs(relTheta) > GAP_ANGLE && t - lastStrikeAt > REFRACTORY) {
        lastStrikeAt = t;
        strikes.push({ t, force: forceForRelOmega((cyl.omega - clap.omega) / CYL_WIND.swell) });
      }

      // THE WALL: must be reproduced here too, or this reference silently
      // stops matching the real module the moment a contact is hard enough
      // to have tunnelled without it (code review's finding).
      if (Math.abs(relTheta) > GAP_ANGLE) {
        clap.theta = clamp(clap.theta, cyl.theta - GAP_ANGLE, cyl.theta + GAP_ANGLE);
        const relOmega = clap.omega - cyl.omega;
        clap.omega = cyl.omega - RESTITUTION * relOmega;
      }
    },
  };
}

// Drives the real module and the reference in lockstep, mirroring the real
// module's own first-call seeding (elapsed=0 on the very first update()) so
// the two integrate on exactly the same schedule from the second call on.
function driveBoth({ size = 0.8, seed = 2, T0 = 0, dt = 1 / 60, secs = 3600, windLevel = 1 } = {}) {
  const realTimes = [], realForces = [], realNotes = [];
  let simNow = T0;
  const f = makeCylinderChime({
    size, seed, phase: 0,
    onStrike: (note, force) => { realTimes.push(simNow); realForces.push(force); realNotes.push(note); },
  });
  f.setWindLevel(windLevel);
  const ref = reference({ size, T0 });
  const steps = Math.round(secs / dt);
  for (let i = 0; i < steps; i++) {
    simNow = T0 + i * dt;
    f.update(dt, simNow);
    if (i > 0) ref.step(dt, simNow, windLevel);
  }
  return { f, realTimes, realForces, realNotes, ref };
}

test('the clapper and cylinder have different natural periods, related by the golden ratio, not a neat 2:1', () => {
  const f = makeCylinderChime({ seed: 1 });
  const { cyl, clap } = f.periods();
  assert.ok(Number.isFinite(cyl) && cyl > 0 && Number.isFinite(clap) && clap > 0);
  assert.ok(clap < cyl, `the brief requires a SHORTER clapper length: periods were cyl=${cyl}, clap=${clap}`);
  const ratio = clap / cyl;
  // THE ONLY MEANINGFUL CHECK HERE: pinned to 1/phi within 1e-9, which
  // already implies it is nowhere near 2:1 or 1:1 — a separate "not close
  // to 0.5 or 2" assertion would be dead code given this one (code review
  // caught an earlier draft carrying both). Kept as a straight regression
  // pin on the constant, honestly: measured directly (cylinder-report.md),
  // this ratio does NOT meaningfully change how often the cylinder rings
  // under this design (1:1 and 2:1 both produced comparable strike
  // statistics to 1/phi) — see cylinder.js's PERIOD_RATIO comment for why
  // it is kept anyway.
  assert.ok(Math.abs(ratio - 1 / PHI) < 1e-9, `ratio ${ratio} is not 1/phi`);
});

test('bigger cylinder = lower note AND slower swing, both derived from size', () => {
  const sizes = [0.6, 0.7, 0.8, 0.9, 1.0];
  const notes = sizes.map((s) => makeCylinderChime({ size: s }).note());
  const periods = sizes.map((s) => makeCylinderChime({ size: s }).periods().cyl);
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(notes[i] <= notes[i - 1], `note did not fall with size: ${notes}`);
    assert.ok(periods[i] > periods[i - 1], `swing did not slow with size: ${periods}`);
  }
  assert.ok(notes[0] > notes[notes.length - 1], `no real spread across the size range: ${notes}`);
  // the brief's own stated size range spans one octave of this book's
  // five-note scale end to end, by construction (noteForSize)
  assert.equal(noteForSize(0.6), 0);
  assert.equal(noteForSize(1.0), -5);
});

test('a HUNG cylinder gets a note of its own, not the clamp floor', () => {
  // The clamp's floor used to be 0.6 — the waist-high object's own smallest
  // size — but kit/chimes.js hangs cylinders from an eave at roughly a third
  // of that (0.23..0.48, sized from a world drop). Every one of them fell
  // under the floor and came back note 0, so two hung cylinders of visibly
  // different size sounded identical. A bound written for one caller must not
  // flatten another.
  const hung = [0.23, 0.30, 0.38, 0.48];
  const notes = hung.map(noteForSize);
  assert.ok(new Set(notes).size >= 3, `the hung band should span notes, got ${notes}`);
  for (let i = 1; i < hung.length; i++) {
    assert.ok(notes[i] <= notes[i - 1], `bigger must not sound higher: ${notes}`);
  }
  // Smaller than the floor-standing chime, so HIGHER than its note 0 — the
  // sign is the part a future re-tune could invert without noticing.
  assert.ok(Math.min(...notes) > 0, `a hung cylinder is small, so it rings high: ${notes}`);
  // and the floor-standing chime is untouched by the wider bound
  assert.equal(noteForSize(0.6), 0);
  assert.equal(noteForSize(1.0), -5);
});

test('no wind and no taps: the cylinder never strikes, and the swing genuinely does not move', () => {
  const f = makeCylinderChime({ seed: 1, phase: 0 });
  f.setWindLevel(0);
  run(f, 1200);
  assert.equal(f.strikes(), 0, 'struck in dead air');
  const swing = f.group.getObjectByName('swing');
  const clapperPivot = f.group.getObjectByName('clapper-pivot');
  // === not assert.equal: a gated rotation can legitimately land on -0 when
  // the (absent) gust would have been negative — strict equality still
  // treats -0 === 0, so this is just being explicit about the intent, same
  // caution furin.test.js takes
  assert.ok(swing.rotation.z === 0, 'the body swings in dead air');
  assert.ok(clapperPivot.rotation.z === 0, 'the clapper swings in dead air');
  assert.equal(f.swingAmp(), 0);
  assert.equal(f.clapperAmp(), 0);
});

test('a steady wind produces strikes that are IRREGULARLY spaced, not a metronome', () => {
  // THE ASSERTION MOST LIKELY TO BE FAKE, per the brief: a test that only
  // checks strikes happen would pass a periodic implementation. This one
  // measures the actual gap statistics — see the mutation-verify note in
  // cylinder-report.md, where forcing the two pendulums onto a single
  // shared periodic driver (rather than the decorrelated gustPhase reading)
  // was shown to fail these exact bounds.
  const { realTimes } = driveBoth({ seed: 3, T0: 5237.4, secs: 7200 });
  assert.ok(realTimes.length > 20, `too few strikes to judge spacing: ${realTimes.length}`);
  const gaps = realTimes.slice(1).map((t, i) => t - realTimes[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;   // coefficient of variation: 0 for a metronome
  assert.ok(cv > 0.3, `gaps read as regular, not weather: mean ${mean}, cv ${cv}`);
  const min = Math.min(...gaps), max = Math.max(...gaps);
  assert.ok(max > min * 3, `spread too narrow to read as irregular: min ${min}, max ${max}`);
});

test('strike force is the clamped relative angular velocity at contact — pinned against an independent reproduction', () => {
  const { realTimes, realForces, ref } = driveBoth({ seed: 4, T0: 0, secs: 5400 });
  assert.ok(realTimes.length > 10);
  assert.equal(realForces.length, ref.strikes.length, 'strike counts diverged from the reference');
  for (let i = 0; i < realForces.length; i++) {
    assert.ok(Math.abs(realTimes[i] - ref.strikes[i].t) < 1e-6, `strike ${i} timing diverged`);
    assert.ok(Math.abs(realForces[i] - ref.strikes[i].force) < 1e-9,
      `strike ${i} force ${realForces[i]} vs reference ${ref.strikes[i].force}`);
  }
  // and the law itself, unit-tested directly: monotonic, zero at zero,
  // clamped at 1 — a wrong-but-plausible formula (e.g. a floor, or an
  // inverted scale) fails at least one of these
  assert.equal(forceForRelOmega(0), 0);
  assert.ok(forceForRelOmega(0.02) < forceForRelOmega(0.06));
  assert.equal(forceForRelOmega(999), 1);
  assert.equal(forceForRelOmega(-0.5), forceForRelOmega(0.5), 'force should not care which side the contact came from');
});

test('the refractory period holds: no two strikes land closer together than it, wind or taps', () => {
  const { realTimes: windTimes } = driveBoth({ seed: 5, T0: 0, secs: 7200 });
  assert.ok(windTimes.length > 10);
  for (let i = 1; i < windTimes.length; i++) {
    assert.ok(windTimes[i] - windTimes[i - 1] >= 0.5 - 1e-6,
      `two wind strikes landed ${windTimes[i] - windTimes[i - 1]}s apart, under the 0.5s refractory`);
  }

  // A burst of ALTERNATING-sign taps, close together, under a fine timestep
  // so no contact edge is missed between frames. Sign matters: a mash of
  // same-sign taps (tried first) just pins the relative angle on one side
  // of GAP_ANGLE and never re-arms the edge detector at all — it passed
  // even with REFRACTORY hard-coded to 0 in src/, which means it was
  // testing edge-detection, not the refractory guard. Alternating the kick
  // direction genuinely drags the relative angle back and forth across the
  // threshold, so the refractory guard is the ONLY thing standing between
  // this loop and a strike on nearly every re-tap.
  const tapTimes = [];
  let simNow = 0;
  const f = makeCylinderChime({ seed: 6, phase: 0, onStrike: () => tapTimes.push(simNow) });
  f.setWindLevel(0);
  const dt = 1 / 240;
  let sign = 1;
  for (let i = 0; i * dt < 3; i++) {
    simNow = i * dt;
    if (i % 20 === 0) { f.ring(sign); sign = -sign; }   // alternating re-tap every ~0.083s
    f.update(dt, simNow);
  }
  assert.ok(tapTimes.length >= 1, 'mashing taps never rang it at all');
  for (let i = 1; i < tapTimes.length; i++) {
    assert.ok(tapTimes[i] - tapTimes[i - 1] >= 0.5 - 1e-6,
      `two tap strikes landed ${tapTimes[i] - tapTimes[i - 1]}s apart, under the 0.5s refractory`);
  }
  // this loop IS the real constraint — every one of potentially ~36 re-taps
  // (every ~0.083s for 3s) had a chance to fire, and mutation-verified
  // (cylinder-report.md addendum): setting REFRACTORY=0 makes the per-gap
  // check above fail directly. A separate "total count is below some bound"
  // assertion was tried here first and removed — 6 strikes in a 3s window
  // at a 0.5s refractory is not evidence of anything broken, it is what
  // correct spacing looks like, and the bound was tight enough to fail on
  // exactly that correct behaviour.
});

test('THE WALL: a hard tap never swings the clapper visibly past the cylinder wall', () => {
  // THE BUG code review found: MAX_CLAP_OMEGA (7.5 rad/s) against the
  // clapper's own natural frequency (omega0 ~= 6.65 rad/s) implies a peak
  // swing near 1.1 rad — more than 12x GAP_ANGLE (~0.088 rad). Before THE
  // WALL, a hard ring() rendered the clapper straight through the solid
  // bronze body to hang in open air on no visible cord: contact was
  // detected (a strike fired) but never physically resolved. This measures
  // the RENDERED relative angle every frame of a hard, repeated tap burst —
  // under still air, so wind can never explain a large swing — and pins it
  // to GAP_ANGLE with only a tiny float-tolerance margin.
  const f = makeCylinderChime({ seed: 12, phase: 0 });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  const clapperPivot = f.group.getObjectByName('clapper-pivot');
  const gap = f.gapAngle();
  let maxRel = 0;
  const dt = 1 / 240;
  for (let i = 0; i * dt < 4; i++) {
    const t = i * dt;
    if (i % 30 === 0) f.ring(1);   // repeated hard taps, worst case for tunnelling
    f.update(dt, t);
    maxRel = Math.max(maxRel, Math.abs(swing.rotation.z - clapperPivot.rotation.z));
  }
  assert.ok(f.strikes() > 0, 'the tap burst never rang it at all — test is not exercising contact');
  assert.ok(maxRel <= gap + 1e-6,
    `the clapper swung ${maxRel} rad relative to the body, past the ${gap} rad gap — it rendered through the bronze wall`);
});

test('a full-force tap swings the CYLINDER BODY a fūrin-comparable amount, and THE WALL still holds at CYL_SWING.tapKick', () => {
  // CHANGED (task-cylinder-fix-brief.md BUG 1). This test used to be titled
  // "CYL_SWING.tapKick is a real increase over the shipped-before value" and
  // pinned tapKick against the PRE-swing-tuning value (2.5 rad/s), because
  // tapKick() used to kick the CLAPPER directly, sized against the
  // clapper's own natural frequency. Now that a tap kicks the BODY
  // (cylPend) instead — the actual bug the owner found in a live audition:
  // "when I click on it, it also doesn't seem like it swings at all" — that
  // old comparison is meaningless: 6.0 rad/s against the clapper's
  // ~6.65 rad/s natural frequency and 2.2 rad/s against the body's own,
  // much slower ~4.11 rad/s are unrelated numbers answering unrelated
  // questions, and the raw-value pin failed the moment the target pendulum
  // changed. What still matters, and is pinned here instead: a full-force
  // tap measurably moves the BODY (not just the clapper — this is the
  // actual regression guard for BUG 1, nothing before this fix caught a
  // reversion to kicking the clapper), the resulting swing lands in a
  // fūrin-comparable range (a first draft of this fix shrank the swing
  // instead of fixing the force law that actually needed it — see
  // CYL_SWING.tapKick's own "A FIRST DRAFT..." comment for why that was the
  // wrong diagnosis, caught in review), and THE WALL still holds the
  // clapper inside GAP_ANGLE at whatever CYL_SWING.tapKick currently is, not
  // just "whatever the module shipped with."
  const f = makeCylinderChime({ seed: 13, phase: 0 });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  const clapperPivot = f.group.getObjectByName('clapper-pivot');

  const before = f.swingAmp();
  f.ring(1);
  const afterOneTap = f.swingAmp();
  assert.ok(afterOneTap > before,
    'a full-force tap added no energy to the BODY — this is BUG 1: a tap must move the cylinder, not (only) the clapper');

  const gap = f.gapAngle();
  let maxRel = 0, maxSwing = 0;
  for (let i = 0; i * (1 / 240) < 3; i++) {
    f.update(1 / 240, i / 240);
    maxRel = Math.max(maxRel, Math.abs(swing.rotation.z - clapperPivot.rotation.z));
    maxSwing = Math.max(maxSwing, Math.abs(swing.rotation.z));
  }
  assert.ok(maxRel <= gap + 1e-6,
    `at CYL_SWING.tapKick=${CYL_SWING.tapKick}, the clapper swung ${maxRel} rad relative to the body, past the ${gap} rad gap`);
  // A plausibility BAND, not a tight pin against today's exact number (today:
  // ~0.51 rad) — it has to survive the owner retuning CYL_SWING.tapKick by
  // ear through the harness, per that field's own "starting point, not
  // final" comment. Low end catches "barely moves" (a BUG 1 regression,
  // kicking the clapper again produces ~0 here under zero wind); high end
  // catches an implausible windmill (a mash-cap regression, or a raw kick
  // with no cap at all).
  assert.ok(maxSwing > 0.15,
    `a full-force tap swung the body only ${maxSwing} rad — reads as barely moving, the exact bug this fix addresses`);
  assert.ok(maxSwing < 1.2,
    `a full-force tap swung the body ${maxSwing} rad — an implausible near-horizontal fling for a waist-high bronze mass`);
});

test('a decaying tap ring-down reports DECREASING force, not a column of 1.00s', () => {
  // THE ACTUAL BUG code review caught: BUG 1's first fix draft shrank the
  // swing to hide a problem that was never the swing's size — every
  // re-strike in a decaying ring-down reported force~1 because
  // FORCE_OMEGA_REF (wind-scale) saturates almost immediately at any
  // tap-scale contact velocity, so a listener would hear a machine hammering
  // at full volume for several seconds, not a bell settling. This drives a
  // real tap at full amplitude in still air and asserts the reported force
  // sequence is not just "eventually quiet" (the old law already managed
  // that on its very last strike) but VISIBLY DECREASING across most of the
  // ring-down: strictly fewer than half the strikes may sit within 0.02 of
  // 1.0 (a wrong-but-plausible "fixed the peak, still saturates everywhere
  // else" implementation would fail this), and the sequence's own late
  // values must run meaningfully quieter than its early ones.
  // AT A REFERENCE KICK, not the shipped one. This test guards the FORCE
  // LAW, and the law's decay only shows across a long ring-down — several
  // natural periods of re-strikes. Frank's ear-tuned tapKick (1.0 rad/s as
  // of his harness pass) swings barely past GAP_ANGLE, giving half a dozen
  // mid-scale, phase-noisy contacts: too short a sequence to judge a
  // diminuendo, and not what this test is about. CYL_SWING is live-mutable
  // by design (the harness writes it), so the test borrows that: pin the
  // kick at the 2.2 the law was calibrated against, restore after.
  const kick0 = CYL_SWING.tapKick;
  CYL_SWING.tapKick = 2.2;
  const forces = [];
  try {
    const f = makeCylinderChime({
      seed: 20, phase: 0,
      onStrike: (note, force) => forces.push(force),
    });
    f.setWindLevel(0);
    f.ring(1);
    run(f, 20);
  } finally {
    CYL_SWING.tapKick = kick0;
  }
  assert.ok(forces.length >= 6, `too few re-strikes to judge a ring-down: ${forces.length}`);

  const saturated = forces.filter((v) => v > 0.98).length;
  assert.ok(saturated < forces.length / 2,
    `${saturated}/${forces.length} strikes still saturate near 1.0 — the force law isn't tracking the decay: ${forces}`);

  // The ring-down's own transient is not monotone strike-to-strike (the
  // physics has a quiet near-miss right after the tap and a stronger return
  // swing behind it), so a strict "every strike quieter than the last" pin
  // would be fighting the physics rather than the force law. Two robust
  // properties instead.
  //
  // FIRST: the last strike is meaningfully quieter than the loudest. The
  // threshold here was 0.75 — only -2.5dB — and that is exactly how a law
  // whose whole upper segment spanned 0.7 to 1.0 passed this test while
  // Frank heard "every time it knocks, it doesn't sound less loud." -7dB is
  // the difference between a fade and a technicality.
  const max = Math.max(...forces);
  const last = forces[forces.length - 1];
  assert.ok(last < max * 0.45,
    `the ring-down's last strike (${last}) isn't meaningfully quieter than its loudest (${max}) — no audible diminuendo: ${forces}`);

  // SECOND, and the one that actually catches a PLATEAU: compare the halves.
  // The old law's real shape was loud, then eleven strikes inside a 1.6dB
  // band, then a late drop — which satisfies any first-vs-last check while
  // sounding like a machine that stops rather than a bell that fades.
  //
  // The threshold is loose (0.85) on purpose. The first half always carries
  // the physics' own rebound — a near-miss contact a fraction of a second
  // after the tap, at a fraction of its velocity — which drags the early
  // mean DOWN and so works against this assertion rather than for it.
  // Measured both ways at seed 20: old law 0.909, this law 0.766. 0.85 sits
  // between them with margin on each side rather than splitting the
  // difference of two numbers that happen to be close.
  const mid = Math.floor(forces.length / 2);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const early = mean(forces.slice(0, mid)), late = mean(forces.slice(mid));
  assert.ok(late < early * 0.85,
    `the ring-down plateaus: first half averaged ${early.toFixed(3)}, second half ${late.toFixed(3)} — ${forces}`);
});

test('a tap rings through the SAME contact mechanism as the wind, not a bypass', () => {
  const hits = [];
  const f = makeCylinderChime({ seed: 7, phase: 0, onStrike: (note, force, pos) => hits.push({ note, force, pos }) });
  f.setWindLevel(0);
  f.ring(1);
  // THE TRAP: an implementation that has ring() call fire()/onStrike
  // directly (a "play it now" bypass) would show a strike here, before any
  // physics has run at all.
  assert.equal(hits.length, 0, 'ring() fired the strike immediately, bypassing the physics');
  // CHANGED (BUG 1's fix): a tap now kicks the BODY, not the clapper (see
  // cylinder.js's own CYL_SWING comment) — kickPendulum only ever touches
  // omega, never theta, so nothing here MOVES until update() runs, but the
  // ENERGY should already be on the body the instant ring() returns. This is
  // the mutation-catching half: reverting tapKick() to kick clapPend again
  // would leave swingAmp() at 0 here while clapperAmp() jumped instead.
  assert.ok(f.swingAmp() > 0, 'the tap did not add any energy to the BODY');

  // CHANGED (code review, task-cylinder-fix-brief.md follow-up): this used
  // to run a full second and assert EXACTLY one strike, worded "one tap
  // should ring once." That is no longer true of the component and was
  // never reliably true of this window either — the body's own re-strike
  // rate (its half-period, ~0.78s regardless of tapKick, see
  // CYL_SWING.tapKick's own comment) means a second, genuine strike
  // typically lands right around the 1s mark (measured: as close as 0.10s
  // vs 1.02s, a 2% margin), so the old assertion was one float-timing
  // accident from flipping to a false "bypass" failure on any retune. A
  // full-force tap DOES ring more than once as it settles (the dedicated
  // ring-down/diminuendo test above covers that shape); what this test is
  // actually guarding is narrower and doesn't need a wide window: contact
  // is physics-driven, not instant. 0.3s is comfortably shorter than the
  // ~0.78s re-strike interval yet long enough for the first, fast contact
  // (measured: lands within ~0.1s of a full-force tap) to have happened.
  run(f, 0.3);
  assert.equal(hits.length, 1, `the first strike after a tap should arrive from the physics within 0.3s, got ${hits.length}`);
  assert.equal(hits[0].note, f.note());
  assert.ok(hits[0].force > 0 && hits[0].force <= 1);
  assert.ok(Number.isFinite(hits[0].pos.x) && Number.isFinite(hits[0].pos.y) && Number.isFinite(hits[0].pos.z));
});

test('determinism: the same seed and the same call sequence give the identical strikes', () => {
  const a = [], b = [];
  const fa = makeCylinderChime({ seed: 9, onStrike: (note, force) => a.push({ note, force }) });
  const fb = makeCylinderChime({ seed: 9, onStrike: (note, force) => b.push({ note, force }) });
  run(fa, 3600);
  run(fb, 3600);
  assert.ok(a.length > 5, 'too quiet to judge determinism');
  assert.deepEqual(a, b, 'identical construction and identical calls diverged');
});

test("a cylinder built mid-session does not integrate the whole session on its first frame", () => {
  // Same fix furin.js shipped two commits ago, pinned here the same way:
  // build at a large, deliberately non-round simTime (T0=5000 exactly hits
  // integer periods of gustPhase's two frequencies — see furin.test.js's own
  // note on this trap) and confirm the FIRST update() call, at that same
  // simTime, produces zero motion rather than a session's worth in one step.
  const T0 = 5237.4;
  const f = makeCylinderChime({ seed: 10, phase: 0 });
  f.setWindLevel(1);
  f.update(1 / 60, T0);
  const swing = f.group.getObjectByName('swing');
  const clapperPivot = f.group.getObjectByName('clapper-pivot');
  assert.equal(swing.rotation.z, 0, 'the body moved on its very first frame — clock started at 0, not seeded');
  assert.equal(clapperPivot.rotation.z, 0, 'the clapper moved on its very first frame — clock started at 0, not seeded');

  // and the full reproduction (which starts its OWN reference pendulums'
  // clocks at T0 too) tracks it for a few thousand seconds afterward,
  // proving the seeding did not merely zero the first frame but kept both
  // internal clocks locked to the absolute one from then on. Code review
  // caught that a length-only check here is weak — the force test above
  // already does the tight element-wise comparison, but at T0=0, where
  // seeding is a no-op (clock starts at 0 either way), so it cannot tell a
  // correctly-seeded module from one that silently reverted to starting at
  // 0. Run the SAME element-wise comparison here, at this test's own
  // non-zero T0, so a seeding regression that only breaks the T0!=0 case
  // has somewhere to be caught.
  const { realTimes, realForces, ref } = driveBoth({ seed: 10, T0, secs: 3600 });
  assert.ok(realTimes.length > 0, 'seeded at T0, the reproduction should still ring under a steady wind');
  assert.equal(realTimes.length, ref.strikes.length, 'strike counts diverged from the reference');
  for (let i = 0; i < realTimes.length; i++) {
    assert.ok(Math.abs(realTimes[i] - ref.strikes[i].t) < 1e-6, `strike ${i} timing diverged at T0=${T0}`);
    assert.ok(Math.abs(realForces[i] - ref.strikes[i].force) < 1e-9, `strike ${i} force diverged at T0=${T0}`);
  }
});

test('hang point: every mesh hangs at or below the origin, at rest', () => {
  const f = makeCylinderChime({ seed: 3 });
  let top = -Infinity;
  f.group.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    top = Math.max(top, o.geometry.boundingBox.max.y + o.position.y);
  });
  assert.ok(top <= 0.001, `geometry pokes above the hang point: ${top}`);
});

test('pick targets exist and a real ray aimed at the body resolves to a hit', () => {
  const f = makeCylinderChime({ seed: 4 });
  f.group.position.set(0, 3, 0);
  f.group.updateMatrixWorld(true);
  assert.ok(f.pickTargets().length > 0);

  const body = f.group.getObjectByName('body');
  const world = body.getWorldPosition(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(world.x, world.y, world.z + 3);
  camera.lookAt(world);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(0, 0);
  const raycastFirst = (cam, objects) => {
    ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  };
  assert.ok(f.pick(camera, { raycastFirst }), 'a ray aimed straight at the body hit nothing');

  const miss = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  miss.position.set(world.x + 50, world.y + 50, world.z + 50);
  miss.lookAt(world.x + 50, world.y + 50, world.z + 49);   // looking away from the chime
  miss.updateMatrixWorld(true);
  assert.equal(f.pick(miss, { raycastFirst }), null, 'a ray aimed at nothing resolved to a hit');
});

test('two cylinders in one scene do not strike in step', () => {
  // Code review: an earlier draft recorded strikes() itself into the
  // compared arrays — [1,2,3,...,n], so assert.notDeepEqual reduced to "the
  // two ended with different TOTAL COUNTS," measuring no timing at all and
  // liable to fail spuriously the day two differently-seeded instances
  // happen to tie on count. Record actual strike TIMES instead (same
  // pattern furin.test.js's own "two chimes... do not strike in step" uses).
  const ta = [], tb = [];
  const a = makeCylinderChime({ seed: 1, onStrike: () => ta.push(simNow) });
  const b = makeCylinderChime({ seed: 2, onStrike: () => tb.push(simNow) });
  let simNow = 0;
  const dt = 1 / 60;
  for (let i = 0; i * dt < 3600; i++) {
    simNow = i * dt;
    a.update(dt, simNow);
    b.update(dt, simNow);
  }
  assert.ok(ta.length > 0 && tb.length > 0, 'too quiet to judge timing');
  assert.notDeepEqual(ta, tb, 'two differently-seeded cylinders struck at the identical times');
});
