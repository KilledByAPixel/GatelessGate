import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePath, introPath, INTRO_POINTS } from '../src/intro_rails.js';

test('endpoints are exact, path is continuous', () => {
  const a = samplePath(INTRO_POINTS, 0);
  const b = samplePath(INTRO_POINTS, 1);
  assert.deepEqual(a, INTRO_POINTS[0]);
  assert.deepEqual(b, INTRO_POINTS[INTRO_POINTS.length - 1]);
  let prev = samplePath(INTRO_POINTS, 0);
  for (let i = 1; i <= 100; i++) {
    const p = samplePath(INTRO_POINTS, i / 100);
    assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) < 1.0, `jump at ${i}`);
    prev = p;
  }
});

test('u clamps outside [0,1]', () => {
  assert.deepEqual(samplePath(INTRO_POINTS, -5), INTRO_POINTS[0]);
  assert.deepEqual(samplePath(INTRO_POINTS, 9), INTRO_POINTS[INTRO_POINTS.length - 1]);
});

test('introPath look leads the position toward the gate', () => {
  const { pos, look } = introPath(0.2);
  assert.ok(look[2] < pos[2], 'look should be further along (smaller z) than pos');
});
