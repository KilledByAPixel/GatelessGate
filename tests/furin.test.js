import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFurin, chimeActivity, noteForSize, SWING, BUFFET, SPIN } from '../src/kit/furin.js';
import { createPendulum, integratePendulum } from '../src/kit/pendulum.js';
import { gustPhase, gustBuffet } from '../src/audio/synths.js';

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

test('grabbing the WHOLE ring rings a cluster — several tubes, one side', () => {
  // THE TWO COMPLAINTS THIS SITS BETWEEN, because they sound contradictory
  // and are not. Frank, originally: "hitting this one thing causes a whole
  // bunch of sounds" — that was ring() firing tube k AND an arbitrary k+1
  // with no way to touch a specific tube at all, and the answer was per-tube
  // picking (the test below this one). Frank, after that shipped: "when I
  // click on it, I only ever hear one sound. I never hear more than one
  // sound on the five tube ring... that's kind of the whole point of those
  // multi ones." The distinction is WHAT WAS TOUCHED: naming a tube rings
  // that tube alone; closing your hand on the whole chime brushes the side
  // it came from and several speak.
  //
  // Asserted as "more than one, fewer than all," not an exact count: the
  // cluster is whichever tubes lie on the contact side (CLUSTER_DOT), so
  // pinning 2 or 3 here would pin the ring's own geometry into a test about
  // the contract.
  const hits = [];
  const f = makeFurin({ seed: 1, tubes: 5, onStrike: (i, force) => hits.push([i, force]) });
  f.setWindLevel(0);
  f.ring();
  assert.ok(hits.length > 1, `grabbing the whole ring rang only ${hits.length} tube`);
  assert.ok(hits.length < 5, `it rang all ${hits.length} tubes — that is the burst, not a cluster`);
  // distinct tubes, distinct notes — a cluster of one note played twice
  // would pass a bare count check and is exactly the failure worth excluding
  assert.equal(new Set(hits.map((h) => h[0])).size, hits.length, 'the same tube rang twice');
  assert.ok(f.pickTargets().length > 0);
});

test('a tap keeps ringing as it settles, and the ring-down fades out', () => {
  // Frank, on the singles: "I would expect it would maybe get knocked more
  // than once while it's getting knocked around." The clapper is a second
  // pendulum now, so the swing a tap kicks off keeps meeting the tubes —
  // and each meeting is softer than the last, because the force tracks the
  // closing velocity and the swing is decaying.
  //
  // Still air throughout, so nothing here can come from the weather loop:
  // every strike counted is the clapper's.
  const hits = [];
  let t = 0;
  const f = makeFurin({ seed: 4, tubes: 1, size: 0.17, phase: 0, onStrike: (i, force) => hits.push({ t, force }) });
  f.setWindLevel(0);
  f.update(1 / 60, t);
  f.ring(1.0);
  for (let k = 0; k < 60 * 12; k++) { t += 1 / 60; f.update(1 / 60, t); }

  assert.ok(f.contacts() >= 4, `a full-force tap produced only ${f.contacts()} clapper contacts`);
  // and it STOPS — a chime that never stops knocking is the machine this
  // replaced (32 contacts and 81 strikes, still going 15s later, before
  // CLAP_FORCE.minForce ended it)
  assert.ok(f.contacts() <= 20, `${f.contacts()} contacts from one tap — that is a machine, not a chime`);

  // the fade, measured between the halves rather than first-vs-last, so one
  // outlying rebound cannot carry the assertion
  const mid = Math.floor(hits.length / 2);
  const mean = (a) => a.reduce((s, h) => s + h.force, 0) / a.length;
  const early = mean(hits.slice(0, mid)), late = mean(hits.slice(mid));
  assert.ok(late < early * 0.8,
    `the ring-down does not fade: first half averaged ${early.toFixed(3)}, second half ${late.toFixed(3)}`);
});

test('the wind never rings the clapper — the ambient pacing belongs to the weather', () => {
  // THE INVARIANT the clapper's torque is designed around (kit/furin.js, THE
  // CLAPPER). Frank auditioned and approved the chime's strike weather; the
  // clapper is a TAP mechanism and must not start contributing wind strikes
  // behind its back.
  //
  // WHAT ACTUALLY HOLDS IT, measured rather than assumed — because the first
  // draft of this comment claimed a guarantee stronger than the one the code
  // has. Both pendulums read the same gust at the same offset with leans
  // scaled to their own g/L, so a STEADY wind holds the relative angle at
  // exactly zero. A GUSTING one does not: the two have different natural
  // frequencies, and the transient peaks at 0.033 rad under full wind —
  // real, and 53% of a five-ring's clearance, 78% of a single tube's. Past
  // full wind the clapper does touch. What stops it SOUNDING there is the
  // second, independent mechanism: those contacts close far too slowly to
  // clear CLAP_FORCE.minForce. Swept to 3x full wind, where a single tube's
  // relative angle reaches 2.3x its gap: still zero audible contacts.
  //
  // Started deep into a session on purpose. simTime is main.js's global
  // clock and never resets, so a chime built mid-session sees a large
  // simTime on its first update() — and the clapper's own pendulum clocks
  // have to be seeded to it, or its gust reading sits permanently offset
  // from the body's and the equal-lean argument above collapses.
  // MUTATION-CHECKED: dropping the two `clapZ.clock = seed` lines from
  // update()'s seeding block fails this; at t0 = 0 it would not, which is
  // exactly why t0 is not 0.
  const t0 = 3600;
  for (const tubes of [5, 3, 1]) {
    let t = t0;
    const f = makeFurin({ tubes, seed: 4, phase: 0, onStrike: () => {} });
    f.setWindLevel(1);                       // full wind, the loudest a case can ask for
    for (let k = 0; k < 60 * 600; k++) { t += 1 / 60; f.update(1 / 60, t); }
    assert.equal(f.contacts(), 0,
      `${tubes}-tube chime: wind alone produced ${f.contacts()} clapper contacts in ten simulated minutes`);
  }
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

test('a single is a BELL with the clapper hidden inside it, and the paper hangs below', () => {
  // THE SHAPE, replacing two tests that measured the thing this is not.
  // Frank, having gone and looked real ones up: "the clapper is kind of next
  // to the chime, but it's not actually connected to anything... widen the
  // chime's radius a bit and get rid of the separate clapper, and it'd be
  // like the bronze cylinder where the clapper is just inside and we don't
  // render it. Below the chime there's a hanging rectangular piece of paper."
  //
  // What was there was a Western tubular chime — a 22:1 wire — carrying a
  // tanzaku bolted to its SIDE, because the single-tube variant began life
  // as "the ring with four tubes deleted" and inherited a clapper that had
  // to be nudged off-axis to avoid being impaled on the one tube left. The
  // two tests this replaces both measured that off-axis nudge, so they were
  // pinning the workaround rather than anything anyone wanted.
  for (const S of [0.08, 0.09, 0.12, 0.17, 0.18, 0.24, 0.34]) {
    const one = makeFurin({ tubes: 1, size: S, seed: 8 });

    // no clapper MESH — invisible inside an opaque body, so drawing one is a
    // draw call spent on nothing that can also poke through a wall
    assert.equal(one.group.getObjectByName('clapper'), undefined,
      `size ${S}: a single should have no clapper mesh — it is inside the bell`);

    // A BELL, not a wire: the body's own aspect ratio is what changed, from
    // 22:1 to between 1.3:1 and 3.3:1 across the whole clamp range. It is not
    // constant, because the radius keeps scaling WEAKLY with size
    // (DIAM_WEAK_EXP) while the length scales straight — so a small fūrin
    // comes out relatively rounder and a big one more slender, which is both
    // what real ones do and a second, independent reading of "the lower ones
    // are bigger."
    const tube = one.group.getObjectByName('tube');
    const ratio = tube.geometry.parameters.height / (2 * tube.geometry.parameters.radiusTop);
    assert.ok(ratio > 1.2 && ratio < 8,
      `size ${S}: body is ${ratio.toFixed(1)}:1 — a wire (was 22:1), not a bell`);

    // the clapper still FITS inside, with room to swing, at every size —
    // singleTubeR scales weakly with size (DIAM_WEAK_EXP) while the clapper
    // is a fraction OF it, so this is the property a re-hardcoded radius
    // anywhere in that chain would break
    assert.ok(one.gapAngle() > 0,
      `size ${S}: no clearance between clapper and wall — it cannot swing`);

    // the paper hangs BELOW the mouth, on the axis, not off to one side
    const tag = one.group.getObjectByName('tag');
    const spin = one.group.getObjectByName('spin-pivot');
    assert.ok(spin, `size ${S}: the paper has no pivot to turn on`);
    one.group.updateMatrixWorld(true);
    const tagBox = new THREE.Box3().setFromObject(tag);
    const tubeBox = new THREE.Box3().setFromObject(tube);
    assert.ok(tagBox.max.y <= tubeBox.min.y + 1e-9,
      `size ${S}: the paper overlaps the bell instead of hanging below it`);
    assert.ok(Math.abs(tagBox.getCenter(new THREE.Vector3()).x) < 1e-6,
      `size ${S}: the paper hangs off to one side, not on the axis`);
  }
});

test("the paper turns on its thread, harder for a harder knock, and never winds up", () => {
  // Frank: "that could also rotate around the vertical axis as a swing, so
  // it kind of starts spinning, and it has a kind of a spin parameter."
  const turns = (force) => {
    const f = makeFurin({ tubes: 1, size: 0.17, seed: 8 });
    const pivot = f.group.getObjectByName('spin-pivot');
    f.setWindLevel(0);                       // still air: isolate the tap
    let t = 0;
    f.update(1 / 60, t);
    f.ring(force);
    let peak = 0;
    // 60s, not the 25s this used to run. The strip was deliberately loosened
    // (SPIN.damping tau 3.0s -> 6.5s, Frank: "the paper part should spin
    // around a bit more with low resistance") and settling time scales with
    // tau — at 25s it is still 0.07 rad short of its rest angle, which is the
    // strip still moving, not the strip parked. Same claim, measured after
    // the same number of time constants.
    for (let k = 0; k < 60 * 60; k++) { t += 1 / 60; f.update(1 / 60, t); peak = Math.max(peak, Math.abs(pivot.rotation.y)); }
    return { peak, rest: pivot.rotation.y };
  };

  // A LIGHT touch rocks it; a SOLID one carries it round. The spread is the
  // point — every tap turning the same amount would make the force
  // illegible, and it is what the first `kick` (set from the undamped
  // over-the-top threshold, which the damping makes irrelevant) got wrong:
  // it produced 0.08 vs 0.40 of a turn, both just a twist.
  const light = turns(0.25), hard = turns(1.0);
  assert.ok(hard.peak > 2 * Math.PI,
    `a full-force knock only turned the paper ${(hard.peak / (2 * Math.PI)).toFixed(2)} of a turn — that is a twist, not a spin`);
  assert.ok(light.peak < Math.PI,
    `a light touch spun the paper ${(light.peak / (2 * Math.PI)).toFixed(2)} of a turn — it should only rock`);

  // ...and it comes to REST rather than parking mid-turn. Rest is the
  // nearest whole revolution, not zero: a knock hard enough to carry the
  // strip over the top leaves it settling around the NEXT equilibrium of
  // -stiffness*sin(theta), which is 2*pi away and renders identically. (The
  // measured value here is 6.2831 — one full turn, not a failure to unwind,
  // which is what a first draft of this assertion mistook it for.)
  const TWO_PI = 2 * Math.PI;
  let fromRest = hard.rest % TWO_PI;
  if (fromRest > Math.PI) fromRest -= TWO_PI;
  if (fromRest < -Math.PI) fromRest += TWO_PI;
  assert.ok(Math.abs(fromRest) < 0.02,
    `the paper settled at ${hard.rest} — ${Math.abs(fromRest)} away from a whole turn, so it is parked mid-swing`);

  // WIND ALONE turns it but cannot wind it up — the integrator-stability
  // property, and the one a spin implemented as a free rotation (rather than
  // a restoring torsion) would fail outright: the strip would just keep
  // accelerating in a steady gust.
  const f = makeFurin({ tubes: 1, size: 0.17, seed: 8 });
  const pivot = f.group.getObjectByName('spin-pivot');
  f.setWindLevel(1);
  let t = 0, peak = 0;
  for (let k = 0; k < 60 * 1800; k++) { t += 1 / 60; f.update(1 / 60, t); peak = Math.max(peak, Math.abs(pivot.rotation.y)); }
  assert.ok(peak > 0.05, 'the wind never turned the paper at all');
  assert.ok(peak < Math.PI, `thirty simulated minutes of wind wound the paper to ${peak} rad — it is not restoring`);

  // a RING has no spin pivot: its tag hangs beside the clapper and keeps the
  // flutter it always had ("for the other ones, I think we could keep them
  // the way they are")
  assert.equal(makeFurin({ tubes: 5, seed: 8 }).group.getObjectByName('spin-pivot'), undefined,
    'a ring should not have grown a spin pivot');
});

test('a single reaches no deeper than the shape it replaced', () => {
  // Five other cases hang one of these under an eave or a gate with their
  // own clearances (k4, k15, k22, k31, k34), and the reshape moved the paper
  // from beside the body to below it — which is exactly the change that
  // could quietly push a chime through a veranda floor somewhere with
  // nothing failing. The old assembly reached 1.95*S below the cord; the
  // proportions were picked to land at 1.98*S rather than wherever they
  // happened to fall.
  const S = 0.17;
  const one = makeFurin({ tubes: 1, size: S, cord: 0, seed: 8 });
  one.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  one.group.traverse((o) => {
    if (o.isMesh && o.material.visible !== false) box.union(new THREE.Box3().setFromObject(o));
  });
  const depth = -box.min.y / S;
  assert.ok(depth < 2.1, `a single now reaches ${depth.toFixed(2)}*S below its cord, was 1.95*S`);
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
    // The drive is the breeze PLUS the turbulence on it (BUFFET/gustBuffet in
    // furin.js — the fast band that lets the thing actually swing rather than
    // only lean). Reproduced here for the same reason SWING.damping is read
    // live rather than hardcoded: this test's subject is the CLOCK the drive
    // is sampled at, so it has to sample the same drive the module does, or
    // it fails for a reason that has nothing to do with what it is testing.
    integratePendulum(reference, 1 / 60, (t) => torqueCoeff * (
      gustPhase(t + T0 + PHASE) + BUFFET.level * gustBuffet(t + T0 + PHASE)));
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

// ---------------------------------------------------------------------------
// THE OPENING. simTime is global and never resets per case, so a fresh load is
// the one moment the book reads these curves at t = 0. Both were sums of two
// sines with no offset — zero AND rising at the origin, adding coherently —
// so every session opened on weather it almost never sees otherwise. Frank:
// "the chimes are a lot louder initially, and then they kinda quiet down...
// I'm not getting the right vibe of what the actual scene is supposed to be
// like until it settles."
// ---------------------------------------------------------------------------

test('a chime does not open a session mid-flurry', () => {
  // Measured before the epoch: strikes enabled 1.5s after load, full activity
  // inside ten seconds, 32% duty over the first half-minute against a 25.5%
  // long-run average. Every load landed inside a flurry.
  assert.equal(chimeActivity(0), 0, 'silent at the instant the book opens');
  for (let t = 0; t <= 6; t += 0.1) {
    assert.equal(chimeActivity(t), 0, `still settling at t=${t.toFixed(1)}, got ${chimeActivity(t)}`);
  }
  // ...but it must not be a dead scene either — the chime has to speak while
  // the reader is still on the page
  let first = Infinity;
  for (let t = 0; t < 120; t += 0.05) { if (chimeActivity(t) > 0) { first = t; break; } }
  assert.ok(first > 6 && first < 20, `first voice at ${first.toFixed(2)}s — wanted a beat of quiet, then a chime`);
});

test('the epoch is a pure time shift: the chime weather itself is untouched', () => {
  // THE CORRECTNESS ARGUMENT for how this was fixed. Giving each sine its own
  // phase was tried first and is NOT a translation — it rewrites the relative
  // phase of the two components and with it the whole beat structure. That
  // version opened 43.5s crest gaps in gustPhase against a 31s design limit,
  // and audio.test.js caught it. Shifting the WHOLE curve cannot do that, and
  // this pins the statistics the file's own header documents: flurries 3-10s
  // (mean 8), breaks 16-33s (mean 24), active ~26%.
  let on = 0, n = 0;
  const spells = [], breaks = [];
  let cur = null;
  for (let t = 0; t < 3600; t += 0.05) {
    const a = chimeActivity(t) > 0;
    if (a) on++;
    n++;
    if (cur === null) cur = { a, t };
    else if (cur.a !== a) { (cur.a ? spells : breaks).push(t - cur.t); cur = { a, t }; }
  }
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const duty = on / n;
  assert.ok(duty > 0.22 && duty < 0.30, `active ${(duty * 100).toFixed(1)}% — the header says ~26%`);
  assert.ok(mean(spells) > 6 && mean(spells) < 10, `flurries mean ${mean(spells).toFixed(1)}s — the header says 8`);
  assert.ok(mean(breaks) > 20 && mean(breaks) < 28, `breaks mean ${mean(breaks).toFixed(1)}s — the header says 24`);
});

test('the paper strip can always find an equilibrium — it is a torsion, not a windmill', () => {
  // wind * (1 + buffet) < stiffness, or the drive exceeds anything the
  // restoring torsion can balance and the strip goes over the top and winds up
  // forever. It was violated (3.8 * 1.8 = 6.84 vs 6.3) and survived only
  // because the phases in play never crested together inside the window the
  // "never winds up" test sampled. Asserted directly here so the next person
  // to raise either number is told immediately, rather than by a wound-up
  // paper strip thirty simulated minutes into an unrelated test.
  const peakDrive = SPIN.wind * (1 + SPIN.buffet);
  assert.ok(peakDrive < SPIN.stiffness,
    `peak drive ${peakDrive.toFixed(2)} must stay under stiffness ${SPIN.stiffness} or the strip winds up`);
});
