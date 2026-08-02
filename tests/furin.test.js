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

test('a tap knocks the clapper through two tubes, whatever the weather', () => {
  const hits = [];
  const f = makeFurin({ seed: 1, onStrike: (i, force) => hits.push([i, force]) });
  f.setWindLevel(0);
  f.ring();
  assert.equal(hits.length, 2);
  assert.notEqual(hits[0][0], hits[1][0], 'both knocks hit the same tube');
  assert.ok(hits[1][1] < hits[0][1], 'the second knock should be the softer one');
  assert.ok(f.pickTargets().length > 0);
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
