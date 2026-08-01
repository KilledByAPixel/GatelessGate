import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setBreezePointer, clearBreeze, breezeState,
  breezeFalloff, easePoke, treeSpringStep,
  BREEZE_MIN_SPEED, GRASS_POKE_RADIUS, TREE_BREEZE_RADIUS,
} from '../src/kit/breeze.js';

const DT = 1 / 60;

// The breeze is shared module state on purpose (one pointer, many consumers),
// so every test starts from a clean slate.
function reset() { clearBreeze(); }

// drive a straight sweep: n steps of `speed` world units/sec along +x
function sweep(n, speed, x0 = 0, z = 0) {
  let x = x0;
  for (let i = 0; i < n; i++) { x += speed * DT; setBreezePointer(x, z, DT); }
  return x;
}

test('falloff: max at the centre, zero at and beyond the radius', () => {
  assert.equal(breezeFalloff(0, 2), 1);
  assert.equal(breezeFalloff(2, 2), 0);
  assert.equal(breezeFalloff(5, 2), 0, 'nothing outside the circle');
  assert.equal(breezeFalloff(1, 0), 0, 'degenerate radius is a no-op, not NaN');
  // monotone: closer is always at least as stirred
  let prev = 1;
  for (let d = 0; d <= 2.2; d += 0.1) {
    const f = breezeFalloff(d, 2);
    assert.ok(f <= prev + 1e-12, `falloff never rises with distance (d=${d.toFixed(1)})`);
    assert.ok(f >= 0 && f <= 1, 'stays in [0, 1]');
    prev = f;
  }
  assert.ok(GRASS_POKE_RADIUS < TREE_BREEZE_RADIUS, 'a canopy is bigger than a tuft');
});

test('speed clamps: an absurd sweep never exceeds full strength', () => {
  reset();
  sweep(120, 500);   // 500 u/s — a pointer teleporting every frame
  const s = breezeState();
  assert.ok(s.strength <= 1, `clamped: ${s.strength}`);
  assert.ok(s.strength > 0.95, `and pinned near full: ${s.strength}`);
  reset();
});

test('a resting hand is not a breeze (dead zone)', () => {
  reset();
  sweep(120, BREEZE_MIN_SPEED * 0.5);
  assert.equal(breezeState().strength, 0, 'sub-threshold motion stays at zero');
  reset();
});

test('the first point after a clear never reads as a gust', () => {
  reset();
  setBreezePointer(0, 0, DT);
  clearBreeze();
  // pointer re-enters the canvas 15 units away — a teleport, not a swipe
  setBreezePointer(15, 0, DT);
  assert.equal(breezeState().strength, 0, 're-entry anchors, it does not spike');
  reset();
});

test('a sweep raises strength fast; stopping decays it to exactly zero', () => {
  reset();
  sweep(30, 8);                       // half a second of brisk sweeping
  const peak = breezeState().strength;
  assert.ok(peak > 0.5, `a real swipe is clearly felt: ${peak}`);
  // now hold still: same point fed every tick
  const { x, z } = breezeState();
  let firstDrop = null;
  for (let i = 0; i < 600; i++) {
    setBreezePointer(x, z, DT);
    if (firstDrop === null) firstDrop = breezeState().strength;
  }
  assert.ok(firstDrop < peak, 'decay starts the very next tick');
  assert.equal(breezeState().strength, 0, 'and settles EXACTLY at zero, not 1e-9 forever');
  reset();
});

test('the breeze is deterministic: same points, same dt, same strengths', () => {
  const run = () => {
    reset();
    const out = [];
    let x = 0;
    for (let i = 0; i < 90; i++) {
      x += (i < 45 ? 6 : 0.1) * DT;
      setBreezePointer(x, Math.sin(i * 0.2), DT);
      out.push(breezeState().strength);
    }
    reset();
    return out;
  };
  assert.deepEqual(run(), run());
});

test('easePoke: fast attack, slow release', () => {
  const up = easePoke(0, 1, DT);
  const down = 1 - easePoke(1, 0, DT);
  assert.ok(up > down * 2, `attack (${up.toFixed(3)}) beats release (${down.toFixed(3)})`);
  // and both converge rather than overshoot
  let v = 0;
  for (let i = 0; i < 120; i++) v = easePoke(v, 1, DT);
  assert.ok(v > 0.95 && v <= 1, `attack converges: ${v}`);
  for (let i = 0; i < 600; i++) v = easePoke(v, 0, DT);
  assert.ok(v < 0.01 && v >= 0, `release converges: ${v}`);
  assert.equal(easePoke(0.5, 0.5, 10), 0.5, 'a met target holds');
});

test('tree spring: an impulse kicks it, damping brings it to rest', () => {
  const s = { pos: 0, vel: 0 };
  treeSpringStep(s, 0.05, DT);
  assert.ok(s.vel > 0, 'the kick lands in velocity');
  assert.ok(Math.abs(s.pos) < 0.01, 'position answers over time, not instantly');

  // ring down with no further kicks: a few hundredths of a radian, then rest
  let maxPos = 0;
  for (let i = 0; i < 60; i++) { treeSpringStep(s, 0, DT); maxPos = Math.max(maxPos, Math.abs(s.pos)); }
  assert.ok(maxPos > 0.001, `the canopy visibly answers: ${maxPos.toFixed(4)}`);
  assert.ok(maxPos < 0.2, `a nudge, not a storm: ${maxPos.toFixed(4)}`);
  const at1s = Math.abs(s.pos);
  for (let i = 0; i < 120; i++) treeSpringStep(s, 0, DT);   // two more seconds
  assert.ok(Math.abs(s.pos) < Math.max(1e-4, at1s * 0.2), `dies out in ~1.5s: ${s.pos}`);
  assert.ok(Math.abs(s.vel) < 0.01, 'velocity dies with it');
});

test('tree spring: stable at STEP and deterministic across runs', () => {
  const run = () => {
    const s = { pos: 0, vel: 0 };
    const trace = [];
    for (let i = 0; i < 300; i++) {
      treeSpringStep(s, i < 30 ? 0.03 : 0, DT, { stiffness: 40 * 1.1 });
      trace.push(s.pos);
      assert.ok(Number.isFinite(s.pos) && Math.abs(s.pos) < 1, 'never blows up');
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});
