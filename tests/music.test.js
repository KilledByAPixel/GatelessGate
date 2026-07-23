import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextDegree, nextInterval, shouldRest,
  BASE_MIN, BASE_MAX, REST_CHANCE, DRIFT_LO, DRIFT_HI,
} from '../src/audio/music.js';
import { mulberry32 } from '../src/audio/verb.js';

// a deterministic stand-in for Math.random: cycles a fixed list
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('nextDegree never repeats the previous note', () => {
  // sweep the whole rng range against every degree in range: a repeat anywhere
  // would be audible as a stutter, which is the one thing this must never do
  for (let prev = DRIFT_LO; prev <= DRIFT_HI; prev++) {
    for (let r = 0; r < 1; r += 0.001) {
      const next = nextDegree(prev, () => r);
      assert.notEqual(next, prev, `repeat at prev=${prev} r=${r}`);
      assert.ok(next >= DRIFT_LO && next <= DRIFT_HI, `out of range: ${next}`);
      assert.ok(Number.isInteger(next));
    }
  }
});

test('nextDegree walks mostly by step, occasionally leaps', () => {
  // mulberry32, not the retired LCG: the old generator collapsed into a
  // 10,466-value cycle, so ~70% of these 20k draws were one repeating loop —
  // the distribution assertions were measuring the cycle, not the weights
  const rng = mulberry32(1);
  const counts = { 1: 0, 2: 0, far: 0 };
  let prev = 5;
  for (let i = 0; i < 20000; i++) {
    const next = nextDegree(prev, rng);
    const d = Math.abs(next - prev);
    if (d === 1) counts[1]++; else if (d === 2) counts[2]++; else counts.far++;
    prev = next;
  }
  const total = 20000;
  assert.ok(counts[1] / total > 0.45, `not enough stepwise motion: ${counts[1] / total}`);
  assert.ok(counts.far / total > 0.03, `never leaps: ${counts.far / total}`);
  assert.ok(counts.far / total < 0.30, `leaps too often: ${counts.far / total}`);
});

test('nextDegree reflects at the edges instead of piling up', () => {
  // Pinned to the largest UPWARD step (+4), so the walk is driven into the
  // ceiling on every draw and has to bounce back down rather than clamp
  // against it. 0.999 would select -4 and walk away from the edge instead,
  // never reaching the branch this test exists to cover.
  const up = seq(0.96);
  let d = DRIFT_HI;
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    d = nextDegree(d, up);
    assert.ok(d >= DRIFT_LO && d <= DRIFT_HI, `out of range: ${d}`);
    seen.add(d);
  }
  assert.ok([...seen].some((v) => v < DRIFT_HI), 'never came off the ceiling');
});

test('nextInterval stretches as a scene gains emitters', () => {
  const half = () => 0.5;
  const base = nextInterval(0, half);
  assert.ok(base >= BASE_MIN && base <= BASE_MAX);
  assert.ok(Math.abs(nextInterval(1, half) / base - 1.7) < 1e-9);
  assert.ok(Math.abs(nextInterval(2, half) / base - 2.4) < 1e-9);
  // capped, so a busy scene thins toward silence but the drift never stops
  assert.ok(Math.abs(nextInterval(9, half) / base - 3) < 1e-9);
  assert.ok(Math.abs(nextInterval(99, half) / base - 3) < 1e-9);
  // spans the full base range
  assert.ok(Math.abs(nextInterval(0, () => 0) - BASE_MIN) < 1e-9);
  assert.ok(Math.abs(nextInterval(0, () => 1) - BASE_MAX) < 1e-9);
});

test('shouldRest fires about one note in five', () => {
  assert.equal(shouldRest(() => 0), true);
  assert.equal(shouldRest(() => 0.99), false);
  assert.equal(shouldRest(() => REST_CHANCE), false);   // boundary is exclusive
});
