import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCylinderChime, noteForSize, forceForRelOmega } from '../src/kit/cylinder.js';
import { createPendulum, integratePendulum } from '../src/kit/pendulum.js';
import { gustPhase } from '../src/audio/synths.js';

// The large hanging cylinder (task-cylinder-brief.md): a second pendulum (the
// clapper) with a shorter, golden-ratio-related period than the cylinder's
// own, so the two drift in and out of phase under a steady wind and the
// resulting strikes are a physical consequence, not a scheduled event.
//
// Several tests below reconstruct the physics INDEPENDENTLY from documented
// formulas (same technique as tests/furin.test.js's "swing's wind phase
// stays locked" test) rather than reaching into src/kit/cylinder.js's
// private state — a wrong-but-plausible formula inside the real module
// cannot make an independent reproduction agree with it by accident.

function run(f, secs, t0 = 0, step = 1 / 60) {
  for (let i = 0; i * step < secs; i++) f.update(step, t0 + i * step);
  return t0 + secs;
}

// ---- an independent reproduction of the physics, duplicating cylinder.js's
// documented constants on purpose (same caveat furin.test.js accepts: if
// those constants ever change, this copy needs updating too) ----
const PHI = (1 + Math.sqrt(5)) / 2;
const GRAVITY = 9.8;
function reference({ size = 0.8, T0 = 0 } = {}) {
  const S = size;
  const CORD = 0.30 * S, CAP_H = 0.07 * S, BODY_LEN = 0.85 * S, BODY_R = 0.15 * S, CLAP_R = 0.06 * S;
  const CONTACT_Y = (CORD + CAP_H) + 0.65 * BODY_LEN;
  const L_cyl = CORD + 0.5 * BODY_LEN;
  const L_clap = L_cyl * (1 / PHI) * (1 / PHI);
  const GAP_ANGLE = ((BODY_R - CLAP_R) * 0.9) / CONTACT_Y;
  const windCylTorque = (GRAVITY / L_cyl) * 0.07;
  const windClapTorque = (GRAVITY / L_clap) * 0.11;
  const cyl = createPendulum({ length: L_cyl, g: GRAVITY, damping: 2 / 3.5, clock: T0 });
  const clap = createPendulum({ length: L_clap, g: GRAVITY, damping: 2 / 2.2, clock: T0 });
  const REFRACTORY = 0.5;
  let lastAbsRel = 0, lastStrikeAt = -Infinity;
  const strikes = [];
  return {
    L_cyl, L_clap, GAP_ANGLE, cyl, clap, strikes,
    step(dt, t, windLevel = 1) {
      integratePendulum(cyl, dt, (tt) => windCylTorque * gustPhase(tt) * windLevel);
      integratePendulum(clap, dt, (tt) => windClapTorque * gustPhase(tt * 0.7 + 11) * windLevel);
      const absRel = Math.abs(cyl.theta - clap.theta);
      if (lastAbsRel <= GAP_ANGLE && absRel > GAP_ANGLE && t - lastStrikeAt > REFRACTORY) {
        lastStrikeAt = t;
        strikes.push({ t, force: forceForRelOmega(cyl.omega - clap.omega) });
      }
      lastAbsRel = absRel;
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
  assert.ok(Math.abs(ratio - 1 / PHI) < 1e-9, `ratio ${ratio} is not 1/phi`);
  // guards against the exact trap the brief warns about: a neat 2:1 (or 1:2)
  // ratio locks the two pendulums in phase, so this pins the ratio is
  // nowhere near either
  assert.ok(Math.abs(ratio - 0.5) > 0.05 && Math.abs(ratio - 2) > 0.05, `ratio ${ratio} is suspiciously close to 2:1`);
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

test('MUTATION-VERIFY scaffold: a single shared periodic driver (no decorrelation) fails the spacing test above', () => {
  // Reproduces the exact mutant described in cylinder.js's own comment on
  // CLAP_GUST_RATE/CLAP_GUST_OFFSET: drive BOTH pendulums from the identical
  // gustPhase(t) (no *0.7, no +11). This is not exercising src/ — it is
  // proof the STATISTIC above is discriminating, run inline so it can never
  // silently rot out of sync with the real test.
  const S = 0.8;
  const CORD = 0.30 * S, CAP_H = 0.07 * S, BODY_LEN = 0.85 * S, BODY_R = 0.15 * S, CLAP_R = 0.06 * S;
  const CONTACT_Y = (CORD + CAP_H) + 0.65 * BODY_LEN;
  const L_cyl = CORD + 0.5 * BODY_LEN;
  const L_clap = L_cyl * (1 / PHI) * (1 / PHI);
  const GAP_ANGLE = ((BODY_R - CLAP_R) * 0.9) / CONTACT_Y;
  const cyl = createPendulum({ length: L_cyl, g: GRAVITY, damping: 2 / 3.5 });
  const clap = createPendulum({ length: L_clap, g: GRAVITY, damping: 2 / 2.2 });
  const windCylTorque = (GRAVITY / L_cyl) * 0.07;
  const windClapTorque = (GRAVITY / L_clap) * 0.11;
  const dt = 1 / 60, secs = 7200;
  let lastAbsRel = 0, lastStrikeAt = -Infinity;
  const times = [];
  for (let i = 0; i * dt < secs; i++) {
    const t = i * dt;
    integratePendulum(cyl, dt, (tt) => windCylTorque * gustPhase(tt));
    integratePendulum(clap, dt, (tt) => windClapTorque * gustPhase(tt));   // MUTANT: identical signal
    const absRel = Math.abs(cyl.theta - clap.theta);
    if (lastAbsRel <= GAP_ANGLE && absRel > GAP_ANGLE && t - lastStrikeAt > 0.5) { lastStrikeAt = t; times.push(t); }
    lastAbsRel = absRel;
  }
  // this mutant does not merely become "regular" — it goes silent, which
  // the count check in the real test (`length > 20`) already catches; kept
  // here as evidence for the report rather than a src/ regression guard
  assert.ok(times.length < 20, `expected the undecorrelated mutant to under-strike, got ${times.length}`);
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
  // and it is a REAL constraint, not one that just happens never to bind:
  // the alternating mash crosses the gap far more often than 0.5s apart, so
  // without the guard this would fire on nearly every re-tap
  assert.ok(tapTimes.length < 3 / 0.5, 'refractory did not suppress anything — every crossing rang');
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
  assert.ok(f.clapperAmp() > 0, 'the tap did not add any energy to the clapper');

  run(f, 1);   // a second's worth of frames for the kicked clapper to reach the wall
  assert.equal(hits.length, 1, `one tap should ring once, got ${hits.length}`);
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
  // internal clocks locked to the absolute one from then on
  const { realTimes, ref } = driveBoth({ seed: 10, T0, secs: 3600 });
  assert.ok(realTimes.length > 0, 'seeded at T0, the reproduction should still ring under a steady wind');
  assert.equal(realTimes.length, ref.strikes.length);
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
  const ta = [], tb = [];
  const a = makeCylinderChime({ seed: 1, onStrike: () => ta.push(a.strikes()) });
  const b = makeCylinderChime({ seed: 2, onStrike: () => tb.push(b.strikes()) });
  run(a, 3600);
  run(b, 3600);
  assert.ok(ta.length > 0 && tb.length > 0);
  assert.notDeepEqual(ta, tb);
});
