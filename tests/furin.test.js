import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFurin, chimeActivity } from '../src/kit/furin.js';

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

test('a knocked chime SWINGS — it crosses centre, it does not just lean back', () => {
  // THE BUG, pinned. The tap response was exp(-(t - nudgeAt) / 0.5) * 0.035:
  // an exponential decay with no oscillating term, so the chime leaned toward
  // the tap and eased back without ever passing through the middle. Frank:
  // "it has, like, a weird dampening on its rotation. It doesn't swing back
  // and forth, like, I would expect it to."
  //
  // A pendulum crosses centre. Wind off, so the only motion is the tap's.
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

  // and it dies down rather than ringing forever
  const early = Math.max(...zs.slice(0, 60).map(Math.abs));
  const late = Math.max(...zs.slice(-60).map(Math.abs));
  assert.ok(late < early * 0.2, `the swing does not settle: ${early} -> ${late}`);
  assert.ok(early > 0.02, `the tap barely moves it: ${early} rad`);
});

test('swing energy accumulates across taps without snapping the pose', () => {
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  run(f, 1);
  assert.equal(f.swingAmp(), 0, 'at rest before anything touches it');

  f.ring(1);
  f.update(1 / 60, 1);
  const before = swing.rotation.z;
  const amp1 = f.swingAmp();
  assert.ok(amp1 > 0);

  // A second tap must contribute EXACTLY nothing at the instant it lands:
  // its own term is force * A0 * exp(0) * sin(0) === 0, whatever the first
  // impulse is doing. A first draft of this test sampled one frame LATER
  // instead, and that buries the signal: the first impulse's own honest,
  // fast-frame growth (SWING_PERIOD=0.85 means it moves ~0.0155 rad in a
  // single 1/60s frame this early on) swamps whatever the second tap did,
  // so any bound loose enough to tolerate that legitimate growth also
  // tolerates a real "starts from some nonzero phase, not from rest" snap —
  // measured offsets of 0.05/0.1/0.2 rad all landed under a 0.06 bound
  // there. Re-reading at the SAME simTime instead isolates the new impulse
  // cleanly: the first impulse's contribution is literally unchanged (same
  // clock, same value as `before`), so correct code reproduces `before` to
  // the bit, and any nonzero starting phase shows up immediately, at its
  // own size, with nothing to hide behind.
  f.ring(1);
  f.update(1 / 60, 1);
  assert.ok(Math.abs(swing.rotation.z - before) < 1e-12, 'the pose snapped on the second tap');
  // 2 * amp1 * 0.99, not amp1 itself: a buggy implementation that OVERWRITES
  // the pending tap instead of superposing it produces an amplitude equal to
  // amp1 (same relative age, same force), which a plain `> amp1` bound only
  // catches because both readings here happen to sit exactly 1/60s past their
  // own t0 — change the frame spacing and that coincidence, and the catch,
  // goes away. Requiring comfortably more than double survives that.
  assert.ok(f.swingAmp() > 2 * amp1 * 0.99, 'the second tap added no energy');
});

test('a burst of taps evicts the impulse doing the least right now, not the oldest', () => {
  // Nine taps inside half a second (a plausible mash) push the swing's array
  // past its cap of 8. At this swing's fast period (0.85s) the OLDEST
  // impulse is not necessarily the one contributing least to the pose right
  // now — it can sit at a sine trough while a newer one sits near a zero
  // crossing. Evicting strictly by age discards real motion: dropping the
  // oldest here removes about -0.0518 * force rad of pose in a single frame
  // (40% of SWING_A0 at force 1) while the impulse genuinely doing the least
  // at that instant is worth only about -0.0094 * force. force is kept low
  // (0.3) here so SWING_MAX never clamps the sum and the difference stays
  // visible in rotation.z instead of being hidden by the ceiling.
  const f = makeFurin({ seed: 3, phase: 0, onStrike: () => {} });
  f.setWindLevel(0);
  const swing = f.group.getObjectByName('swing');
  const dt = 0.5 / 8;
  for (let i = 0; i < 8; i++) {
    f.update(1 / 600, i * dt);
    f.ring(0.3);
  }
  f.update(1 / 600, 8 * dt);
  const before = swing.rotation.z;

  f.ring(0.3);                  // the 9th tap: forces an eviction
  f.update(1 / 600, 8 * dt);    // same simTime it landed at, so its own
                                 // contribution is exactly zero — any change
                                 // here is the eviction's doing, not the tap's
  const jump = Math.abs(swing.rotation.z - before);
  assert.ok(jump < 0.008, `the cap snapped the pose on eviction: ${jump} rad`);
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
