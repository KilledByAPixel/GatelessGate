import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPendulum, stepPendulum, integratePendulum, kickPendulum, pendulumEnergy, SUBSTEP,
} from '../src/kit/pendulum.js';

// The pure physics core every hanging thing in the kit swings by (furin.js's
// wind chime today). Scene-level behaviour — sizing L from an object's own
// geometry, picking a per-object damping, wiring taps to kicks — is tested
// in tests/furin.test.js; this file pins the physics itself.

test('a displaced pendulum with no torque crosses centre and decays monotonically to rest', () => {
  const p = createPendulum({ length: 0.5, g: 9.8, damping: 0.3, theta: 0.6 });
  const peaks = [];
  for (let i = 0; i < Math.round(30 / SUBSTEP); i++) {
    const prevOmega = p.omega;
    integratePendulum(p, SUBSTEP, () => 0);
    if (prevOmega !== 0 && Math.sign(prevOmega) !== Math.sign(p.omega)) peaks.push(Math.abs(p.theta));
  }
  assert.ok(peaks.length >= 10, `too few swings to judge a trend: ${peaks.length}`);
  for (let i = 1; i < peaks.length; i++) {
    assert.ok(peaks[i] <= peaks[i - 1] + 1e-9,
      `amplitude grew: peak ${i - 1}=${peaks[i - 1]} -> peak ${i}=${peaks[i]}`);
  }
  assert.ok(peaks[peaks.length - 1] < peaks[0] * 0.05, `never really settles: ${peaks[0]} -> ${peaks[peaks.length - 1]}`);
});

test('STABILITY, mutation-verified: explicit Euler (position from the OLD velocity) gains energy', () => {
  // THE FAILURE the brief warns about: explicit Euler updates position with
  // the velocity from BEFORE this step's force was applied, which on an
  // oscillator systematically overshoots every step and pumps energy in —
  // a knocked pendulum would wind itself up over a long session rather than
  // settle. Damping is 0 here specifically to isolate that numerical effect:
  // with the damping this file otherwise uses (tau ~1.8-3s), real physical
  // decay swamps the artifact within 30s and the mutation goes unnoticed —
  // that IS what happened on the first draft of this test, which is why
  // it's undamped. Proven by literally swapping the update order and
  // rerunning the same displaced-start, no-torque scenario as the test
  // above.
  function explicitEulerStep(p, torque) {
    const alpha = -(p.g / p.length) * Math.sin(p.theta) - p.damping * p.omega + torque;
    p.theta += p.omega * SUBSTEP;   // position from the OLD velocity — the bug
    p.omega += alpha * SUBSTEP;
    p.clock += SUBSTEP;
  }
  // DEMONSTRATION, not protection: explicitEulerStep is local to this test
  // and nothing in src/ can ever make this assertion fail — it is not a
  // regression guard. Its only job is proving the SCENARIO itself (this
  // damping, this length, this duration) is one where the bug would be
  // visible, so the real guard below (qLate) is trustworthy rather than
  // passing by accident because 30s was too short to show anything either
  // way.
  const p = createPendulum({ length: 0.5, g: 9.8, damping: 0, theta: 0.6 });
  const early = pendulumEnergy(p);
  for (let i = 0; i < Math.round(30 / SUBSTEP); i++) explicitEulerStep(p, 0);
  const late = pendulumEnergy(p);
  assert.ok(late > early * 3, `expected explicit Euler to visibly gain energy here as a sanity check on the test itself: ${early} -> ${late}`);

  // THE REAL GUARD: the shipped stepPendulum, imported from src/kit/pendulum.js,
  // stays bounded under the same conditions — this is the assertion a
  // regression in src/ can actually break.
  const q = createPendulum({ length: 0.5, g: 9.8, damping: 0, theta: 0.6 });
  const qEarly = pendulumEnergy(q);
  for (let i = 0; i < Math.round(30 / SUBSTEP); i++) stepPendulum(q, 0);
  const qLate = pendulumEnergy(q);
  assert.ok(qLate < qEarly * 1.5, `semi-implicit Euler gained energy over a long undriven, undamped run: ${qEarly} -> ${qLate}`);
});

test('a steady torque settles the pendulum at a non-zero equilibrium, ARRIVING there with overshoot', () => {
  // THE BUG this whole task fixes, at the physics level: the old furin code
  // read the wind curve directly into the rotation, so a steady wind's
  // "equilibrium" was reached with zero overshoot — it was just wherever the
  // curve pointed, every frame. A real pendulum swings PAST where it will
  // eventually rest before gravity and damping pull it back.
  const length = 0.3, g = 9.8, damping = 0.5, torque = 3.0;
  const eq = Math.asin(torque * length / g);   // small-angle-exact equilibrium
  const p = createPendulum({ length, g, damping });
  let maxTheta = 0;
  for (let i = 0; i < Math.round(20 / SUBSTEP); i++) {
    integratePendulum(p, SUBSTEP, () => torque);
    maxTheta = Math.max(maxTheta, p.theta);
  }
  assert.ok(Math.abs(p.theta - eq) < 0.01, `did not settle near equilibrium: ${p.theta} vs ${eq}`);
  assert.ok(maxTheta > eq * 1.3, `no overshoot — reads as positioned, not swung: peak ${maxTheta}, eq ${eq}`);
});

test('a kick adds energy — peak amplitude after a kick exceeds the pre-kick amplitude', () => {
  const length = 0.25, g = 9.8, damping = 0.3;
  // let a displaced pendulum decay for a while so it has SOME motion but not
  // much, then compare its next peak with-kick vs without
  function settled() {
    const p = createPendulum({ length, g, damping, theta: 0.3 });
    for (let i = 0; i < Math.round(4 / SUBSTEP); i++) integratePendulum(p, SUBSTEP, () => 0);
    return p;
  }
  function peakOver(p, secs) {
    let peak = 0;
    for (let i = 0; i < Math.round(secs / SUBSTEP); i++) {
      integratePendulum(p, SUBSTEP, () => 0);
      peak = Math.max(peak, Math.abs(p.theta));
    }
    return peak;
  }
  const control = settled();
  const controlPeak = peakOver(control, 2);

  const kicked = settled();
  kickPendulum(kicked, 1.2);
  const kickedPeak = peakOver(kicked, 2);

  assert.ok(kickedPeak > controlPeak, `a kick did not add energy: ${controlPeak} -> ${kickedPeak}`);
});

test('a kick touches velocity only — theta is unchanged at the instant it lands', () => {
  const p = createPendulum({ length: 0.25, g: 9.8, damping: 0.3, theta: 0.05, omega: 0.1 });
  const before = p.theta;
  kickPendulum(p, 2.5);
  assert.equal(p.theta, before, 'the kick moved theta directly instead of only omega');
  assert.equal(p.omega, 2.6, 'the kick did not land on omega');
});

test('determinism: the same dt sequence twice gives the identical pose', () => {
  const mk = () => createPendulum({ length: 0.25, g: 9.8, damping: 0.4, theta: 0.4 });
  const torqueAt = (t) => 0.5 * Math.sin(1.3 * t);
  const a = mk(), b = mk();
  for (let i = 0; i < 400; i++) {
    integratePendulum(a, 1 / 60, torqueAt);
    integratePendulum(b, 1 / 60, torqueAt);
  }
  assert.equal(a.theta, b.theta, 'identical runs diverged');
  assert.equal(a.omega, b.omega, 'identical runs diverged');
});

test('determinism: a different dt subdivision totalling the same elapsed time agrees to a small tolerance', () => {
  // The fixed-substep guarantee: chop 10s of elapsed time into one big call
  // vs. ~600 JITTERY calls (a stand-in for real frame-time variance) and the
  // final pose should agree closely, because integratePendulum carries its
  // leftover time (p.acc) across calls instead of dropping it each time.
  const length = 0.25, g = 9.8, damping = 0.4, theta0 = 0.4;
  const torqueAt = (t) => 0.5 * Math.sin(1.3 * t);
  const TOTAL = 10.0;

  const ref = createPendulum({ length, g, damping, theta: theta0 });
  integratePendulum(ref, TOTAL, torqueAt);

  // a closed-form PRNG-free jitter so this stays inside the no-Math.random
  // rule and stays deterministic itself
  let seed = 1;
  const jitterDt = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return 1 / 60 + ((seed / 2147483648) - 0.5) * 0.01;   // 1/60s +/- up to 5ms
  };
  const chunked = createPendulum({ length, g, damping, theta: theta0 });
  let total = 0;
  while (total < TOTAL - 1e-6) {
    let d = jitterDt();
    if (total + d > TOTAL) d = TOTAL - total;
    integratePendulum(chunked, d, torqueAt);
    total += d;
  }

  const diff = Math.abs(ref.theta - chunked.theta);
  assert.ok(diff < 0.01, `chunking changed the pose by more than a small tolerance: ${diff}`);

  // MUTATION CHECK, inline: an integrator that does NOT carry the remainder
  // (starts a fresh local `acc = dt` each call instead of accumulating into
  // p.acc) diverges from the same reference by roughly 150x more on this
  // exact scenario (0.0006 vs 0.09, measured) — this test's 0.01 bound is
  // tight enough to catch that, not just loose enough to pass anything.
  function integrateWITHOUT_CARRY(p, dt, torqueAtFn) {
    let acc = dt;
    while (acc >= (1 / 240)) { stepPendulum(p, torqueAtFn(p.clock)); acc -= (1 / 240); }
  }
  const broken = createPendulum({ length, g, damping, theta: theta0 });
  seed = 1;
  let total2 = 0;
  while (total2 < TOTAL - 1e-6) {
    let d = jitterDt();
    if (total2 + d > TOTAL) d = TOTAL - total2;
    integrateWITHOUT_CARRY(broken, d, torqueAt);
    total2 += d;
  }
  const brokenDiff = Math.abs(ref.theta - broken.theta);
  assert.ok(brokenDiff > diff * 10, `the mutation should diverge much more than the real integrator: broken=${brokenDiff}, real=${diff}`);
});

test('energy never grows without input: a long free decay is non-increasing at every turning point', () => {
  const p = createPendulum({ length: 0.4, g: 9.8, damping: 0.2, theta: -0.8, omega: 0 });
  const energies = [];
  let prevOmega = 0;
  for (let i = 0; i < Math.round(40 / SUBSTEP); i++) {
    integratePendulum(p, SUBSTEP, () => 0);
    if (prevOmega !== 0 && Math.sign(prevOmega) !== Math.sign(p.omega)) energies.push(pendulumEnergy(p));
    prevOmega = p.omega;
  }
  assert.ok(energies.length >= 10, `too few samples: ${energies.length}`);
  for (let i = 1; i < energies.length; i++) {
    assert.ok(energies[i] <= energies[i - 1] + 1e-9, `energy grew: ${energies[i - 1]} -> ${energies[i]}`);
  }
});
