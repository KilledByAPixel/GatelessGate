// A driven, damped pendulum: theta'' = -(g/L) sin(theta) - c*theta' + torque.
// The physics every hanging thing in the kit swings by — furin.js's wind
// chime today, a hanging bronze cylinder in a later task — so it lives on
// its own rather than inside furin.js: same equation, different L/damping.
//
// Pure data + pure functions (createPendulum / stepPendulum / integratePendulum
// / kickPendulum / pendulumEnergy), no THREE import, matching the split
// src/sim/verlet.js already draws between physics core and scene glue.
//
// DETERMINISM. "Same steps, same state" is the project rule, and
// window.gate.step(n) depends on it. An integrator is deterministic only at
// a FIXED timestep — update(dt) callers (production's fixed-step
// accumulator, hand-rolled test loops) do not agree on how they chop up
// elapsed time. integratePendulum folds whatever dt it is handed into
// SUBSTEP-sized ticks and carries the leftover in p.acc across calls, so the
// pose depends only on total elapsed time and the sequence of kicks — never
// on how a caller framed it. (Two different chunkings of the same total
// elapsed time are NOT bit-identical — float addition is not associative —
// but they agree to a small tolerance; see tests/pendulum.test.js.)
//
// STABILITY. stepPendulum uses semi-implicit ("symplectic") Euler: velocity
// is updated from the CURRENT state first, then position is advanced using
// the NEW velocity. Explicit Euler — position from the OLD velocity — adds
// energy to an oscillator on every single step, so a knocked pendulum would
// slowly wind itself up over a long session and never truly settle; that
// failure would not show in a short test, only a long undriven run. Semi-
// implicit Euler does not have that failure mode: tests/pendulum.test.js
// runs a long, torque-free, displaced-start simulation and requires the
// swing's peak-to-peak amplitude to decay, never grow.
export const SUBSTEP = 1 / 240;

// length, g, damping are per-instance; theta/omega are the state. `clock`
// defaults to 0 (a pendulum's own local elapsed time) but a caller whose
// torqueAt needs to agree with some OTHER absolute clock it also reads
// (furin.js's strikes and tag flutter, for one) should seed it explicitly —
// see the "SEED, don't start at 0" block in furin.js's update() for why:
// two clocks that start apart stay apart forever, not just at the start.
export function createPendulum({ length, g, damping, theta = 0, omega = 0, clock = 0 }) {
  return { length, g, damping, theta, omega, acc: 0, clock };
}

// One fixed physics tick. `torque` is the driving torque for THIS substep —
// the caller evaluates it (typically at p.clock, so a wind function sees the
// pendulum's own elapsed time, not the caller's).
export function stepPendulum(p, torque) {
  const alpha = -(p.g / p.length) * Math.sin(p.theta) - p.damping * p.omega + torque;
  p.omega += alpha * SUBSTEP;      // velocity FIRST, from the current theta —
  p.theta += p.omega * SUBSTEP;    // then position, from the velocity just computed
  p.clock += SUBSTEP;
}

// Advance by `dt` seconds, in fixed SUBSTEP increments, carrying the
// remainder in p.acc. torqueAt(t) is called once per substep with p.clock —
// the pendulum's OWN running total of integrated time, seeded at 0 unless
// the caller set it otherwise (createPendulum's `clock` option). If nothing
// else on the caller's side reads a clock, p.clock=0-at-creation is fine and
// the running total IS the caller's elapsed time. If something else DOES —
// furin.js's strikes and tag flutter read a separately-tracked absolute
// simTime that torqueAt's gustPhase call must agree with — that something
// else's starting value has to be seeded into p.clock too, or the two drift
// apart by exactly the gap between "pendulum created" and "first update()",
// permanently, not just at the start (this was a real, shipped bug in
// furin.js — see its update() for the fix and the numbers). A chime whose
// update() is later skipped for a stretch — because it was not being
// rendered — simply resumes its own clock where it left off rather than
// jumping, which keeps it deterministic without the extra bookkeeping an
// exact absolute-time substep grid would need for no visible benefit.
export function integratePendulum(p, dt, torqueAt) {
  p.acc += dt;
  while (p.acc >= SUBSTEP) {
    stepPendulum(p, torqueAt(p.clock));
    p.acc -= SUBSTEP;
  }
}

// An instantaneous velocity change — what a knock physically is. Touches
// omega only: theta, and therefore the rendered pose, is UNCHANGED at the
// instant a kick lands, same as the real thing you just hit is still where
// it was the moment before your hand touched it.
export function kickPendulum(p, domega) {
  p.omega += domega;
}

// Mechanical energy relative to the bottom of the swing: 0 at rest, and
// strictly positive whenever the pendulum is displaced and/or moving. Not
// scaled to any particular visual amplitude — callers compare it to itself
// (before vs. after a kick, early vs. late in a decay).
export function pendulumEnergy(p) {
  return 0.5 * p.omega * p.omega + (p.g / p.length) * (1 - Math.cos(p.theta));
}
