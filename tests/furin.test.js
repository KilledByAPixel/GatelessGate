import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFurin, chimeActivity, noteForSize, SWING } from '../src/kit/furin.js';
import { createPendulum, integratePendulum } from '../src/kit/pendulum.js';
import { gustPhase } from '../src/audio/synths.js';

// drive the component across sim time; returns the end time so runs can chain
function run(f, secs, t0 = 0, step = 1 / 60) {
  for (let i = 0; i * step < secs; i++) f.update(step, t0 + i * step);
  return t0 + secs;
}

test('chimeActivity is paced weather: bounded, mostly off, real flurries', () => {
  let on = 0, n = 0, peak = 0;
  for (let t = 0; t < 3600; t += 0.25) {
    const v = chimeActivity(t);
    assert.ok(v >= 0 && v <= 1, `out of range at ${t}: ${v}`);
    n++; if (v > 0) on++; peak = Math.max(peak, v);
  }
  assert.ok(on / n > 0.15 && on / n < 0.4, `active fraction ${on / n}`);
  assert.ok(peak > 0.8, `flurries never build: peak ${peak}`);
});

test('strikes arrive deterministically, in range, and are counted', () => {
  const hits = [];
  const f = makeFurin({ seed: 1, phase: 0, onStrike: (i, force) => hits.push({ i, force }) });
  const again = [];
  const g = makeFurin({ seed: 1, phase: 0, onStrike: (i, force) => again.push({ i, force }) });
  run(f, 600); run(g, 600);
  assert.ok(hits.length > 20, `too quiet: ${hits.length} strikes in 10 min`);
  assert.deepEqual(hits, again, 'not deterministic');
  for (const h of hits) {
    assert.ok(Number.isInteger(h.i) && h.i >= 0 && h.i < 5);
    assert.ok(h.force > 0 && h.force <= 1);
  }
  assert.equal(f.strikes(), hits.length);
});

test('flurries cluster and silences really happen', () => {
  const at = [];
  const f = makeFurin({ seed: 1, phase: 0, onStrike: () => {} });
  let prev = 0;
  for (let i = 0; i * (1 / 60) < 900; i++) {
    const t = i / 60;
    f.update(1 / 60, t);
    if (f.strikes() > prev) { at.push(t); prev = f.strikes(); }
  }
  assert.ok(at.length > 10);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(Math.max(...gaps) > 25, `never falls silent: max gap ${Math.max(...gaps)}`);
  assert.ok(gaps.some((g) => g < 2), 'strikes never cluster into a flurry');
});

test('no wind, no chime — and it comes back with the wind', () => {
  const f = makeFurin({ seed: 1, phase: 0 });
  f.setWindLevel(0);
  let t = run(f, 600);
  assert.equal(f.strikes(), 0, 'struck in dead air');
  const tag = f.group.getObjectByName('tag');
  const swing = f.group.getObjectByName('swing');
  // === not assert.equal: strict assert distinguishes -0 from 0, and a gated
  // rotation legitimately lands on -0 when the gust is negative. Still is still.
  assert.ok(tag.rotation.y === 0, 'the tag swivels in dead air');
  assert.ok(swing.rotation.z === 0, 'the swing sways in dead air');
  f.setWindLevel(1);
  run(f, 600, t);
  assert.ok(f.strikes() > 0, 'never came back');
});

test('two chimes in one scene do not strike in step', () => {
  const ta = [], tb = [];
  const a = makeFurin({ seed: 1, onStrike: () => ta.push(a.strikes()) });
  const b = makeFurin({ seed: 2, onStrike: () => tb.push(b.strikes()) });
  const record = (f, arr) => {
    let prev = 0;
    for (let i = 0; i * (1 / 60) < 600; i++) {
      const t = i / 60;
      f.update(1 / 60, t);
      if (f.strikes() > prev) { arr.push(t); prev = f.strikes(); }
    }
  };
  const xa = [], xb = [];
  record(a, xa); record(b, xb);
  assert.ok(xa.length > 0 && xb.length > 0);
  assert.notDeepEqual(xa, xb);
});

test('hang point: every mesh hangs below the origin', () => {
  const f = makeFurin({ seed: 3 });
  let top = -Infinity;
  f.group.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    top = Math.max(top, o.geometry.boundingBox.max.y + o.position.y);
  });
  assert.ok(top <= 0.001, `geometry pokes above the hang point: ${top}`);
});

test('a tap rings ONE tube, not a burst across the whole ring', () => {
  // THE BUG, pinned. ring() used to fire tube k AND k+1 on every tap: Frank
  // — "just hitting, like, one of them, hitting this one thing causes a
  // whole bunch of sounds." One tap now rings exactly one tube.
  const hits = [];
  const f = makeFurin({ seed: 1, onStrike: (i, force) => hits.push([i, force]) });
  f.setWindLevel(0);
  f.ring();
  assert.equal(hits.length, 1, `one tap rang ${hits.length} tubes`);
  assert.ok(f.pickTargets().length > 0);
});

test('a tap rings ONE tube — the one you touched', () => {
  // Frank: "just hitting, like, one of them, hitting this one thing causes a
  // whole bunch of sounds." ring() fired tube k AND k+1, and the only pick
  // target was a drum around the whole ring, so there was no way to touch a
  // single tube even if it had wanted to.
  const hits = [];
  const f = makeFurin({ seed: 4, phase: 0, onStrike: (i, force) => hits.push({ i, force }) });
  f.setWindLevel(0);
  run(f, 1);
  f.ring(0.8, 3);
  assert.equal(hits.length, 1, `one tap rang ${hits.length} tubes`);
  assert.equal(hits[0].i, 3, 'it rang a tube other than the one named');
});

test('every tube is its own pick target, in index order', () => {
  const f = makeFurin({ seed: 4, tubes: 5, onStrike: () => {} });
  const targets = f.pickTargets();
  const tubes = targets.filter((o) => Number.isInteger(o.userData.tube));
  assert.equal(tubes.length, 5, 'not one target per tube');
  assert.deepEqual(tubes.map((o) => o.userData.tube), [0, 1, 2, 3, 4], 'out of index order');
  // the forgiving whole-chime targets are still there and still say "no tube"
  const whole = targets.filter((o) => o.userData.tube === null);
  assert.equal(whole.length, 2, 'the drum and the tanzaku should still be pickable');
});

test('a strike reports where the struck tube is, so it can be placed in space', () => {
  const seen = [];
  const f = makeFurin({ seed: 4, phase: 0, onStrike: (i, force, pos) => seen.push({ i, x: pos.x, y: pos.y, z: pos.z }) });
  f.group.position.set(10, 3, -4);
  f.group.updateMatrixWorld(true);
  f.setWindLevel(0);
  run(f, 1);
  f.ring(0.8, 0);
  f.ring(0.8, 2);
  assert.equal(seen.length, 2);
  // MINOR gap closed: a bug reporting tube i+1's position instead of tube
  // i's would still pass every check below (it's still finite, still near
  // x=10, still below the hang point, still different from its neighbour),
  // so pin the actual index each position was reported for.
  assert.equal(seen[0].i, 0, `rang tube ${seen[0].i}, not the one named`);
  assert.equal(seen[1].i, 2, `rang tube ${seen[1].i}, not the one named`);
  for (const s of seen) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
    // the chime hangs at x=10, and every tube is within its own small radius
    assert.ok(Math.abs(s.x - 10) < 1, `tube ${s.i} is nowhere near the chime: x=${s.x}`);
    assert.ok(s.y < 3, 'tubes hang BELOW the hang point');
  }
  assert.notEqual(seen[0].x === seen[1].x && seen[0].z === seen[1].z, true,
    'two different tubes report the same position');
});

test('a single-tube chime is one tube on a cord, with no ring', () => {
  const one = makeFurin({ tubes: 1, seed: 8, onStrike: () => {} });
  const tubes = [];
  one.group.traverse((o) => { if (o.name === 'tube') tubes.push(o); });
  assert.equal(tubes.length, 1);
  // on the axis, not offset onto a ring that isn't there
  assert.ok(Math.abs(tubes[0].position.x) < 1e-9 && Math.abs(tubes[0].position.z) < 1e-9,
    'the lone tube is still placed on a ring');
  assert.equal(one.pickTargets().filter((o) => Number.isInteger(o.userData.tube)).length, 1);
  // and it still swings and rings like any other
  one.setWindLevel(0);
  one.ring(1, 0);
  assert.ok(one.swingAmp() > 0);
});

test('the single tube does not run straight through the clapper', () => {
  // Code review: the lone tube sits on the axis (x=z=0, above) and the
  // clapper was ALSO built on the axis regardless of tube count — so a
  // single-tube chime had its clapper disc impaled on its own tube rather
  // than hanging beside it where it could plausibly strike it. Checked as
  // a real cylinder-vs-disc clearance: the clapper's centre must clear the
  // tube's radius by more than the clapper's own radius.
  const S = 0.17;
  const one = makeFurin({ tubes: 1, size: S, seed: 8 });
  const tube = one.group.getObjectByName('tube');
  const clapper = one.group.getObjectByName('clapper');
  tube.geometry.computeBoundingSphere();
  clapper.geometry.computeBoundingSphere();
  const tubeR = 0.075 * S;                     // the tube's own cylinder radius
  const clapperR = clapper.geometry.boundingSphere.radius;
  const dx = tube.position.x - clapper.position.x;
  const dz = tube.position.z - clapper.position.z;
  const gap = Math.hypot(dx, dz);
  assert.ok(gap > tubeR + clapperR,
    `clapper interpenetrates the tube: centres ${gap} apart, need > ${tubeR + clapperR}`);
});

test('the clapper still clears the tube across the whole size range, not just the book default', () => {
  // task-swing-tune-brief.md, PROBLEM 1: a single tube's diameter now scales
  // WEAKLY with size (DIAM_WEAK_EXP in furin.js) rather than in lockstep
  // with everything else, which is exactly the kind of change that could
  // silently break a fixed clearance margin computed against the OLD
  // lockstep formula (0.075*size) at any size other than the one it was
  // measured at. The test above only proves this at size=0.17 (the book
  // default, where the weak formula and the lockstep formula happen to
  // agree by construction — see singleTubeR's own comment in furin.js). This
  // checks the geometry directly (not a formula copied from src/) across the
  // sizes this task actually stages (case 29: 0.09, 0.12, 0.18) plus the
  // extremes noteForSize itself clamps to, so a wrong-but-plausible fix that
  // re-hardcodes 0.075*size somewhere in the clapper-offset math would show
  // up as a real, measured collision at the sizes that formula gets wrong.
  //
  // MUTATION-VERIFIED that a bare "clearance > 0" bound is NOT enough here:
  // re-hardcoding clapperOff's own margin term to the old 0.075*S (instead of
  // the real singleTubeR) still leaves clearance barely POSITIVE at every
  // size in this list (as low as ~10% of the tube+clapper radii, down from
  // ~24% with the real fix) — a strict `>` catches nothing. Requiring at
  // least 15% of (tubeR+clapperR) as real margin sits between those two
  // measured numbers, so it fails on the reintroduced bug and passes on the
  // fix, rather than merely failing on an outright interpenetration.
  const MIN_MARGIN_FRAC = 0.15;
  for (const S of [0.08, 0.09, 0.12, 0.18, 0.24, 0.34]) {
    const one = makeFurin({ tubes: 1, size: S, seed: 8 });
    const tube = one.group.getObjectByName('tube');
    const clapper = one.group.getObjectByName('clapper');
    const tubeR = tube.geometry.parameters.radiusTop;
    clapper.geometry.computeBoundingSphere();
    const clapperR = clapper.geometry.boundingSphere.radius;
    const dx = tube.position.x - clapper.position.x;
    const dz = tube.position.z - clapper.position.z;
    const gap = Math.hypot(dx, dz);
    const needed = (tubeR + clapperR) * (1 + MIN_MARGIN_FRAC);
    assert.ok(gap > needed,
      `size ${S}: clapper clearance too thin (or interpenetrating): centres ${gap} apart, need > ${needed} (${MIN_MARGIN_FRAC * 100}% margin over ${tubeR + clapperR})`);
  }
});

test('a bigger single-tube furin sounds a LOWER note, and the length ratio matches the free-free-bar model', () => {
  // task-swing-tune-brief.md, PROBLEM 1: "the physics is a free-free bar:
  // f ~ thickness/length^2... an octave down is a tube 1.41x longer, two
  // octaves is 2x longer." noteForSize is the pure function that formula
  // lives in (furin.js) — pinned directly here, on its documented contract,
  // not on the internal log2 expression, so a mutant that gets the SIGN
  // right but the SCALE wrong (a plausible off-by-a-constant-factor bug)
  // still gets caught by the length-ratio check below.
  assert.equal(noteForSize(0.17), 0, 'the book default should sound exactly as it always has');
  assert.ok(noteForSize(0.24) < noteForSize(0.17), 'a bigger tube should sound LOWER, not higher');
  assert.ok(noteForSize(0.12) > noteForSize(0.17), 'a smaller tube should sound HIGHER, not lower');

  // root-2 longer -> one octave (5 degrees) lower; twice as long -> two
  // octaves (10 degrees) lower. SIZE_REF=0.17 is exported implicitly via
  // noteForSize(0.17)===0 above, so root(2)*0.17 and 2*0.17 exercise the
  // formula at exactly the brief's own worked ratios.
  const oneOctaveDown = noteForSize(0.17 * Math.SQRT2);
  const twoOctavesDown = noteForSize(0.17 * 2);
  assert.equal(oneOctaveDown, -5, `root-2-longer should read one octave (5 degrees) lower, got ${oneOctaveDown}`);
  assert.equal(twoOctavesDown, -10, `2x-longer should read two octaves (10 degrees) lower, got ${twoOctavesDown}`);

  // and the inverse: a tube built at exactly the note-implied size actually
  // measures out to the length ratio the note implies, within a tolerance
  // justified by noteForSize's own rounding to an integer degree (each
  // degree step covers a length ratio of about 2^(1/10) ~ 1.0718, so a
  // ratio measured off REAL geometry should land within that same relative
  // step of the theoretical root-2 / 2x targets, not exactly on them, since
  // rounding to the nearest degree is lossy by design)
  const lenAt = (size) => {
    const f = makeFurin({ tubes: 1, size, seed: 1 });
    return f.group.getObjectByName('tube').geometry.parameters.height;
  };
  const ratio1oct = lenAt(0.17 * Math.SQRT2) / lenAt(0.17);
  const ratio2oct = lenAt(0.17 * 2) / lenAt(0.17);
  assert.ok(Math.abs(ratio1oct - Math.SQRT2) < 0.08, `one-octave length ratio ${ratio1oct} strayed too far from root-2`);
  assert.ok(Math.abs(ratio2oct - 2) < 0.08, `two-octave length ratio ${ratio2oct} strayed too far from 2x`);
});

test('a real ray aimed at a specific tube resolves to that tube, not the whole-chime drum', () => {
  // THE TRAP a reviewer caught in the shipped comment: pickTargets() was
  // documented "tubes first, so a tap landing on both a tube and the
  // forgiving drum resolves to the tube — the more specific target wins."
  // False. input.raycastFirst calls THREE's ray.intersectObjects, which
  // SORTS BY DISTANCE — array order is discarded. The whole-chime drum is
  // a convex hex prism (circumradius 0.8S) that contains every sleeve
  // (reach at most 0.53S), so any ray that touches a sleeve pierces the
  // drum's nearer face first. A single combined raycast over
  // pickTargets() therefore ALWAYS resolves to the drum, never a tube —
  // demonstrated below with the exact raycasting logic src/input.js uses.
  const f = makeFurin({ seed: 4, tubes: 5, onStrike: () => {} });
  f.group.updateMatrixWorld(true);

  const sleeve2 = f.pickTargets().find((o) => o.userData.tube === 2);
  const world = sleeve2.getWorldPosition(new THREE.Vector3());

  // a camera parked outside the chime, aimed dead-centre at that tube
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(world.x, world.y, world.z + 3);
  camera.lookAt(world);
  camera.updateMatrixWorld(true);

  const ndc = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  // the actual algorithm in src/input.js's raycastFirst — same sort order
  const raycastFirst = (cam, objects) => {
    ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects(objects, false);
    return hits.length ? hits[0] : null;
  };

  // pins the trap itself: the naive combined call never names a tube
  const naive = raycastFirst(camera, f.pickTargets());
  assert.ok(naive, 'the naive combined raycast hit nothing at all');
  assert.equal(naive.object.userData.tube, null,
    'the naive combined raycast is expected to land on the drum, not a tube — ' +
    'if this ever fires, the trap this test exists to document is gone');

  // the fix: furin resolves its own picking, sleeves probed before the
  // forgiving whole-chime targets, so the real hit test wins
  const picked = f.pick(camera, { raycastFirst });
  assert.ok(picked, 'a ray aimed straight at tube 2 hit nothing');
  assert.equal(picked.tube, 2, `resolved to tube ${picked.tube}, not the one aimed at`);
});

test('a knocked chime SWINGS — it crosses centre, it does not just lean back', () => {
  // THE BUG, pinned, TWICE now. First it was exp(-(t - nudgeAt) / 0.5) * 0.035:
  // an exponential decay with no oscillating term, so the chime leaned toward
  // the tap and eased back without ever passing through the middle. That was
  // replaced by a real superposed-impulse pendulum term (poseTerm), which DID
  // cross centre — but the WIND lean was still read straight off the gust
  // curve every frame with no inertia at all, which is what Frank was
  // actually pointing at: "it kinda gets held in position weirdly." This test
  // predates that second fix and still exercises the tap in isolation (wind
  // off), so its assertions carry over unchanged onto the new model — a real
  // driven pendulum (src/kit/pendulum.js) with taps as velocity kicks
  // (ring()/tapKick) rather than a decaying-sine term superposed on a
  // kinematic lean. Frank: "it has, like, a weird dampening on its rotation.
  // It doesn't swing back and forth, like, I would expect it to."
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  run(f, 1);                       // settle
  f.ring(1);
  const zs = [];
  for (let i = 0; i < 60 * 5; i++) { f.update(1 / 60, 1 + i / 60); zs.push(swing.rotation.z); }

  const signs = zs.filter((z) => Math.abs(z) > 1e-5).map((z) => Math.sign(z));
  const crossings = signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
  assert.ok(crossings >= 3, `it leans, it does not swing: ${crossings} centre crossings in 5s`);

  // and it dies down rather than ringing forever — but SWING.damping was
  // opened up (task-swing-tune-brief.md, PROBLEM 2: "a much longer settle")
  // from tau=1.8s to tau=4.5s specifically so it lingers through several
  // audible swings instead of two, so the old late<early*0.2 bound (tuned
  // for the SHORT settle) now fails on correct behaviour — measured ratio at
  // the new damping is ~0.395 (see swing-tune-report.md). 0.5 leaves real
  // margin above that while still catching a damping mutation: doubling
  // SWING.damping's tau (halving the coefficient) measured ~0.79, and
  // near-zero damping measured ~0.997 — both comfortably fail this bound,
  // so it is discriminating a real regression, not just loose enough to pass
  // anything. The genuinely tight "does it monotonically settle" property is
  // pinned separately, below, on the energy itself rather than a ratio of
  // two 1-second windows.
  const early = Math.max(...zs.slice(0, 60).map(Math.abs));
  const late = Math.max(...zs.slice(-60).map(Math.abs));
  assert.ok(late < early * 0.5, `the swing does not settle: ${early} -> ${late}`);
  // Bracketed, not just floored: `early > 0.02` alone left TAP_PEAK's actual
  // value essentially unpinned — dropping the omega0 factor in tapKick
  // (furin.js) gives a peak of ~0.019 rad, which is BELOW 0.02 and so was
  // caught, but only by a margin that was luck rather than coverage (any
  // slightly less broken mutant would have slipped through). SWING.tapPeak
  // was raised from 0.13 to 0.55 rad (task-swing-tune-brief.md, PROBLEM 2 —
  // "a much larger tap kick"); measured at the new value, force=1:
  // early ~0.528 rad. 0.45-0.60 brackets that with headroom on both sides
  // without being so loose it stops meaning anything, and would still catch
  // a future change back toward the old 0.13 (which would land near 0.115).
  assert.ok(early > 0.45 && early < 0.60, `the tap's first swing is not near SWING.tapPeak: ${early} rad`);
});

test('the swing SETTLES: mechanical energy decays monotonically once a tap stops feeding it', () => {
  // "Worth pinning... the swing still settles — energy decays monotonically
  // with no input" (task-swing-tune-brief.md's Tests section). The early/
  // late ratio test above is a coarse, two-window version of this claim;
  // this pins the tight version directly on pendulumEnergy() (src/kit/
  // pendulum.js), sampled every real frame for 15s after a single tap in
  // still air — semi-implicit Euler with damping and no driving torque
  // should never let mechanical energy tick UP between frames.
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  run(f, 1);
  f.ring(1);
  let prev = f.swingAmp();
  assert.ok(prev > 0, 'the tap added no energy to settle from');
  let violations = 0;
  for (let i = 0; i < 60 * 15; i++) {
    f.update(1 / 60, 1 + i / 60);
    const e = f.swingAmp();
    // float tolerance only — this is not "roughly decreasing," it is a real
    // physical invariant of a damped, undriven oscillator under semi-implicit
    // Euler (see pendulum.js's own STABILITY discussion)
    if (e > prev + 1e-9) violations++;
    prev = e;
  }
  assert.equal(violations, 0, `mechanical energy increased between frames ${violations} times with no input`);
  assert.ok(prev < 0.05, `still ringing after 15s in still air: energy=${prev}`);
});

test('wind actually drives the swing, not just the strikes', () => {
  // Mutation-caught gap: every OTHER test in this file either turns wind off
  // (isolating the tap) or only checks strikes()/activity() for wind's
  // effect. Zeroing out the wind torque entirely (windZTorque -> 0) — i.e.
  // wiring the pendulum up but never actually feeding it the gust, the
  // easiest way to half-do this task — passed all 17 ORIGINAL tests and 15
  // of the 17 in this rewritten file. Only this test catches it: a steady
  // wind must eventually swing the chime out past a small threshold, not
  // leave it sitting at theta=0 forever. (The overshoot/equilibrium shape of
  // that response is pinned precisely on the pure core, with a real constant
  // torque, in tests/pendulum.test.js — gustPhase's own slow drift here would
  // make an exact equilibrium/overshoot assertion flaky at the furin level.)
  const f = makeFurin({ seed: 6, phase: 0, onStrike: () => {} });
  const swing = f.group.getObjectByName('swing');
  f.setWindLevel(1);
  let sawMotion = false;
  for (let i = 0; i < 60 * 10 && !sawMotion; i++) {
    f.update(1 / 60, i / 60);
    if (Math.abs(swing.rotation.z) > 0.01) sawMotion = true;
  }
  assert.ok(sawMotion, 'wind never visibly moves the chime');
});

test("the swing's wind phase stays locked to the absolute clock, even for a chime built mid-session", () => {
  // CODE REVIEW CAUGHT a real bug: simTime is main.js's GLOBAL clock and
  // never resets across koan entries, so a fūrin built when the reader is
  // already deep into a session used to see a large simTime on its very
  // first update() — and starting `clock` at 0 meant that first call's
  // elapsed was the ENTIRE session, integrated in one frame (measured: 24ms
  // at simTime=60s -> 750ms at 3600s, for case 29's 4 instances x 2
  // pendulums each, landing exactly on the ink dissolve). Fixed by SEEDING
  // `clock` — and, just as importantly, zPend/xPend's own internal `.clock`
  // — from the first real simTime rather than starting both at 0.
  //
  // That second half matters on its own: torqueAt reads gustPhase at the
  // PENDULUM's own p.clock, while the strikes and tag.rotation.y read
  // gustPhase at this file's `clock`. Before the fix those two only agreed
  // as a side effect of the runaway catch-up walking p.clock up to meet
  // `clock` in that one giant first frame; fixing ONLY the outer `clock`
  // seed (elapsed=0 on frame one) without ALSO seeding zPend.clock would
  // leave the pendulum's own clock parked at 0 while the file's `clock`
  // jumps straight to simTime — desynced forever after, not just at the
  // start, since nothing ever makes them catch up again.
  //
  // Verified against an INDEPENDENT reproduction of the torque math (same
  // shape as the raycastFirst reproduction test above): a bare pendulum,
  // built with the same L/g/damping furin.js derives from `size`/`cord`,
  // driven by the SAME public gustPhase evaluated at true absolute time
  // (T0 + elapsed), starting from rest at the same simTime the real fūrin
  // is built at. T0 is deliberately NOT a round number — gustPhase's two
  // frequencies (0.043, 0.071) both happen to hit exact integer periods at
  // T0=5000 (5000*0.043=215, 5000*0.071=355), which made an earlier draft
  // of this test pass even with the fix reverted, silently.
  const T0 = 5237.4;
  const SIZE = 0.17, CORD_FRAC = 0.62, PHASE = 0.37;
  const f = makeFurin({ size: SIZE, cord: CORD_FRAC, phase: PHASE, seed: 9, onStrike: () => {} });
  f.setWindLevel(1);

  // reproduces furin.js's own L = cord*size + 0.6*size, omega0 = sqrt(g/L),
  // and windZTorque = (g/L)*WIND_Z_LEAN (WIND_Z_LEAN=0.16, g=9.8 — both
  // named constants in furin.js, duplicated here on purpose so this test
  // does not import furin.js's private state, only its documented formulas).
  // damping is the one exception: SWING.damping is a LIVE, exported tunable
  // now (task-swing-tune-brief.md — the harness writes into it directly), so
  // a hardcoded copy here would silently stop matching the real module the
  // moment the starting value changes again; importing the real SWING object
  // is the public, documented way to read it.
  const L = CORD_FRAC * SIZE + 0.6 * SIZE;
  const G = 9.8;
  const torqueCoeff = (G / L) * 0.16;
  const reference = createPendulum({ length: L, g: G, damping: SWING.damping });

  const N = 180;   // 3 simulated seconds
  for (let i = 0; i < N; i++) {
    f.update(1 / 60, T0 + i / 60);
    // absolute time, not time-since-reference-creation: T0 + t
    integratePendulum(reference, 1 / 60, (t) => torqueCoeff * gustPhase(t + T0 + PHASE));
  }

  const swing = f.group.getObjectByName('swing');
  const diff = Math.abs(swing.rotation.z - reference.theta);
  assert.ok(diff < 0.01,
    `swing diverged from the absolute-time reference: ${diff} rad (z=${swing.rotation.z}, ref=${reference.theta})`);
});

test('a tap kicks VELOCITY only — the pose does not snap at the instant it lands', () => {
  // REWRITTEN for the pendulum model (src/kit/pendulum.js replaced the
  // superposed-decaying-sine impulse this test used to pin). Old story: each
  // tap superposed a NEW term starting at t0=clock, and this test proved a
  // second such term contributes EXACTLY zero at the instant it lands
  // (force * A0 * exp(0) * sin(0) === 0), so mashing taps never snapped the
  // pose — it required reading at the SAME simTime twice to isolate that from
  // the first impulse's own honest fast-frame growth (see the old comment,
  // preserved in git history).
  //
  // The pendulum makes this trivial rather than delicate: a tap calls
  // kickPendulum, which only ever touches omega (src/kit/pendulum.js). theta
  // — and therefore swing.rotation.z — is untouched BY CONSTRUCTION, with no
  // update() call and hence no time passing in between. No coincidental
  // frame alignment to arrange; it is just true of the state.
  //
  // Each ring() below is followed by update(0, sameSimTime) — the render
  // line (swing.rotation.z = zPend.theta) only runs inside update(), so
  // without that zero-elapsed sync call this test would only ever be
  // reading whatever rotation.z was left at from BEFORE the tap, and a kick
  // that illicitly nudged theta as well as omega would slip through
  // unnoticed until the next real frame — caught by mutation-testing this
  // test with exactly that bug (kickPendulum also doing `theta += domega *
  // SUBSTEP`) and finding it passed anyway.
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  // a single update(1, 1) rather than run(f, 1): run()'s last internal call
  // lands just SHORT of simTime=1 (its loop is `i*step < secs`), so a later
  // update(0, 1) would see a small nonzero elapsed time, not zero — exactly
  // the gap a first draft of this test fell into (measured: 0.0147 rad of
  // "the pose moved before any time passed" that should have read 0).
  f.update(1, 1);
  assert.equal(swing.rotation.z, 0, 'not at rest before anything touches it');
  assert.equal(f.swingAmp(), 0, 'at rest before anything touches it');

  f.ring(1);
  f.update(0, 1);           // sync the render at the SAME simTime: zero elapsed physics time
  const afterOne = swing.rotation.z;
  const ampAfterOne = f.swingAmp();
  assert.equal(afterOne, 0, 'the pose moved before any time passed');
  assert.ok(ampAfterOne > 0, 'the tap added no energy');

  f.ring(1);   // a second tap, still no elapsed time
  f.update(0, 1);
  assert.equal(swing.rotation.z, afterOne, 'the pose snapped on the second tap');
  assert.ok(f.swingAmp() > ampAfterOne, 'the second tap added no energy');

  // and once time actually passes, the stored energy shows up as motion
  f.update(1 / 60, 1 + 1 / 60);
  assert.notEqual(swing.rotation.z, 0, 'the kicks never turned into motion');
});

test('mashing taps saturates instead of spinning the chime past a wind chime', () => {
  // REWRITTEN for the pendulum model. Old story: the swing summed up to 8
  // superposed impulses and evicted whichever contributed LEAST to the pose
  // right now when a 9th arrived, because evicting by age could discard real
  // motion (see git history for the -0.0518 vs -0.0094 rad numbers that
  // motivated it) — a mechanism that existed only because the old model kept
  // an ARRAY of every tap still in flight.
  //
  // The pendulum has no array: a tap is one velocity kick added to the ONE
  // omega the pendulum has (tapKick, furin.js), so there is nothing to evict.
  // The protection is a velocity ceiling (SWING.maxOmegaFrac * omega0,
  // furin.js): however many taps land, omega cannot exceed what a real
  // chime's air drag would ever let it reach. Proven two ways: the stored
  // energy after a saturating burst does not keep growing with more taps,
  // and the resulting swing still reads as a wind chime rather than a
  // windmill. This covers a burst that lands before any update() runs
  // (elapsed time = 0 between kicks) — saturated peak here is ~0.62-0.66 rad
  // at the current SWING.maxOmegaFrac=0.65, comfortably under the 1.0 rad
  // sanity bound below.
  //
  // CODE REVIEW CAUGHT that a velocity ceiling ALONE does not protect a
  // DIFFERENT, real scenario: sustained re-tapping with time actually
  // elapsing BETWEEN kicks (a human mashing the screen, not one instant
  // burst). MAX_OMEGA only bounds omega at the INSTANT of a kick — it says
  // nothing about accumulated theta, and a kick re-arms omega to the
  // ceiling every time regardless of how much gravity had already fought it
  // down since the last one. Measured at maxOmegaFrac=0.85 (this task's
  // first-draft value): 20 taps/sec for 3s reached 16+ rad, multiple full
  // rotations — a literal windmill, falsifying the promise this file's own
  // header comment makes ("however often it gets mashed... not a
  // windmill"). Fixed in tapKick() with an ENERGY cap (see its own comment
  // in furin.js) alongside the velocity one: total mechanical energy after
  // any kick can never exceed what a single maximally-hard tap from rest
  // would reach, so no amount of sustained mashing, at any rate, can carry
  // the swing further than one perfect tap already could. Pinned below as
  // its own test, driven with REAL elapsed time between kicks (unlike the
  // burst above) at a rate no burst-only test would ever exercise.
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  run(f, 1);

  for (let i = 0; i < 9; i++) f.ring(1);      // all before any update(): a mash
  const amp9 = f.swingAmp();
  for (let i = 0; i < 41; i++) f.ring(1);     // 50 taps total
  const amp50 = f.swingAmp();
  assert.ok(amp9 > 0, 'nine taps added no energy at all');
  // both bursts saturate the SAME velocity cap, so more taps buys nothing —
  // a tight bound, not "less than double": a cap that leaked would show up
  // here even a little
  assert.ok(Math.abs(amp50 - amp9) < amp9 * 0.01,
    `more taps kept adding energy past the cap: 9 taps -> ${amp9}, 50 taps -> ${amp50}`);

  let peak = 0;
  for (let i = 0; i < 60 * 5; i++) { f.update(1 / 60, 1 + i / 60); peak = Math.max(peak, Math.abs(swing.rotation.z)); }
  assert.ok(peak < 1.0, `a burst of taps spun the chime past a sane angle: ${peak} rad`);
});

test('SUSTAINED rapid mashing — real elapsed time between kicks, not an instant burst — still saturates, not a windmill', () => {
  // CODE REVIEW CAUGHT a real bug the test above cannot see: it mashes 9-50
  // taps with ZERO elapsed time between them (every ring() lands before the
  // first update()), so theta never has a chance to move between kicks and
  // the velocity ceiling alone is sufficient. A human mashing a touchscreen
  // does not do that — real time passes between taps, theta moves in that
  // time, and tapKick's old velocity-only clamp re-armed omega to the
  // ceiling on EVERY kick regardless of how far gravity had already pulled
  // it down since the last one. That is "holding the throttle open," and it
  // measurably span the chime past a full rotation (20 taps/sec for 3s
  // reached 16+ rad at this task's first-draft maxOmegaFrac=0.85) —
  // falsifying this file's own header promise ("however often it gets
  // mashed... not a windmill"). tapKick's energy cap (furin.js) is what
  // fixes it: this drives taps interleaved with real update() calls, at a
  // rate (20/sec) well above anything the velocity-only clamp was ever
  // exercised against, for a full simulated 10s of continuous mashing.
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  let simTime = 0;
  const dt = 1 / 60;
  const tapsPerSec = 20;
  const framesPerTap = Math.round(60 / tapsPerSec);
  let maxTheta = 0;
  for (let i = 0; i < 60 * 10; i++) {
    if (i % framesPerTap === 0) f.ring(1);
    simTime += dt;
    f.update(dt, simTime);
    maxTheta = Math.max(maxTheta, Math.abs(swing.rotation.z));
  }
  // a full rotation is 2*PI (~6.28 rad); the old bug reached 16+ rad (2.6
  // full turns) under this exact drive. 1.2 rad (~69 deg) is comfortably
  // above SWING.tapPeak's own single-tap peak (~0.53) and the burst-only
  // saturated peak (~0.62-0.66), so a real fix has real headroom here, not
  // a bound tuned to just barely pass.
  assert.ok(maxTheta < 1.2,
    `sustained mashing at ${tapsPerSec}/sec spun the chime like a windmill: ${maxTheta} rad`);
  // and the promise is a genuine PHYSICAL cap, not a coincidence of this one
  // rate — halving and doubling the rate should not blow through it either
  for (const rate of [10, 40]) {
    const g = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
    g.setWindLevel(0);
    const gSwing = g.group.getObjectByName('swing');
    let t = 0;
    const fpt = Math.max(1, Math.round(60 / rate));
    let gMax = 0;
    for (let i = 0; i < 60 * 10; i++) {
      if (i % fpt === 0) g.ring(1);
      t += dt;
      g.update(dt, t);
      gMax = Math.max(gMax, Math.abs(gSwing.rotation.z));
    }
    assert.ok(gMax < 1.2, `sustained mashing at ${rate}/sec spun the chime like a windmill: ${gMax} rad`);
  }
});

test('it hangs by a STRING, and swings from the knot at the top of it', () => {
  // Frank: "the furin should have a string attached to the top of it, and
  // rotate around the string attach point — that is the rotation point."
  const S = 0.2;
  const f = makeFurin({ size: S, seed: 5 });
  const cord = f.group.getObjectByName('cord');
  assert.ok(cord, 'there is a cord');

  const swing = f.group.getObjectByName('swing');
  // the hinge is the KNOT: the swing group sits at the origin, and the cord
  // hangs from it — so the whole chime arcs about the top of the string
  assert.equal(swing.position.y, 0, 'the swing pivots at the hang point');
  cord.geometry.computeBoundingBox();
  const top = cord.geometry.boundingBox.max.y + cord.position.y;
  assert.ok(Math.abs(top) < 1e-6, `the cord starts AT the knot: ${top}`);

  // and the chime proper hangs off the far end of it, not at the knot
  f.group.updateMatrixWorld(true);
  const cap = f.group.getObjectByName('cap');
  const capTop = new THREE.Box3().setFromObject(cap).max.y;
  assert.ok(capTop < -0.4 * S, `the cap hangs below the cord: ${capTop}`);

  // swinging the knot carries the cap sideways — it is a pendulum, not a
  // thing that spins in place
  const rest = new THREE.Box3().setFromObject(cap).getCenter(new THREE.Vector3());
  swing.rotation.z = 0.3;
  f.group.updateMatrixWorld(true);
  const swung = new THREE.Box3().setFromObject(cap).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(swung.x - rest.x) > 0.1 * S, 'the cap travels when the knot turns');
  assert.ok(swung.y > rest.y, 'and rises, the way anything on a string does');
});
