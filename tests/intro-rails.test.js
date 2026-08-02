import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePath, introPath, INTRO_POINTS } from '../src/intro_rails.js';
import { buildHub } from '../src/intro.js';

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

// The last frame used to look AT its own eye — samplePath clamps at u = 1, so
// pos and look came out identical and lookAt() fell back to an arbitrary
// heading on the one frame the title screen hands over.
test('the look never collapses onto the eye, right to the end', () => {
  for (const u of [0, 0.5, 0.94, 0.97, 0.999, 1]) {
    const { pos, look } = introPath(u);
    const d = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
    assert.ok(d > 0.2, `at u=${u} the camera looks at itself (${d})`);
    assert.ok(look[2] < pos[2], `at u=${u} it stopped looking down the road`);
  }
});

// The regression Frank reported: "it doesn't go quite through the gate all the
// way." The dolly ended at z -3 and the gate stands at z -6. Pinned against the
// hub's OWN gate position rather than a copy of it, so moving the gate along
// the path can never silently leave the camera stopping short again.
test('the dolly goes through the gate, between the posts and under the beam', () => {
  const hub = buildHub();
  const [gx, , gz] = hub.gateTarget;
  const end = samplePath(INTRO_POINTS, 1);
  assert.ok(end[2] < gz, `the walk ends short of the gate: ${end[2]} vs ${gz}`);

  // where it crosses the gate's plane, it must be in the OPENING — the frame is
  // 3.0 wide, so half a metre off centre is already brushing a post
  let crossed = null;
  for (let i = 0; i <= 400; i++) {
    const p = samplePath(INTRO_POINTS, i / 400);
    if (p[2] <= gz) { crossed = p; break; }
  }
  assert.ok(crossed, 'the path never reaches the gate plane at all');
  assert.ok(Math.abs(crossed[0] - gx) < 0.6,
    `it passes ${Math.abs(crossed[0] - gx).toFixed(2)} off the centre of a 3.0-wide opening`);
  assert.ok(crossed[1] > 0.8 && crossed[1] < 3.0, `eye height through the gate: ${crossed[1]}`);
});
