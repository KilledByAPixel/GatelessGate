import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWalk, walkPose, walkHeading, pathLength } from '../src/kit/walk.js';

// The kit walk is the souls' gait from case 35, extracted for every walker
// (k36's two travellers first). These tests pin the NUMBERS of that gait —
// the bob/roll/sway amplitudes Frank approved on k35 — and the design change
// the extraction made: phase is distance-driven, a footfall per stride, so
// the step rhythm tracks how fast a case actually moves the figure.

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('walkPose carries the k35 gait numbers', () => {
  // a footfall peak: full bob lift, full roll to one side
  const peak = walkPose(Math.PI / 2);
  close(peak.lift, 0.035);
  close(peak.roll, 0.04);
  // the crossing between footfalls: feet under the body, no lift, no roll
  const cross = walkPose(Math.PI);
  close(cross.lift, 0, 1e-12);
  close(cross.roll, 0, 1e-12);
  // the next footfall lifts AGAIN (|sin| — two footfalls per cycle) while the
  // weight rolls to the OTHER side (plain sin — one roll cycle per two steps)
  const next = walkPose(3 * Math.PI / 2);
  close(next.lift, 0.035);
  close(next.roll, -0.04);
  // sway stays inside its amplitude and moves slower than the step rhythm
  for (let i = 0; i < 50; i++) {
    const p = walkPose(i * 0.37);
    assert.ok(Math.abs(p.yaw) <= 0.06 + 1e-12);
    assert.ok(p.lift >= 0);
  }
});

test('a footfall per stride, weight alternating', () => {
  const w = makeWalk({ seed: 7, height: 1.5 });
  close(w.stride, 0.525);            // k35's ~0.52 units per step at height 1.5
  for (const s of [0, 0.2, 1.31, 4.7]) {
    const here = w.pose(s);
    const step = w.pose(s + w.stride);
    close(step.lift, here.lift, 1e-9);       // lift repeats every footfall
    close(step.roll, -here.roll, 1e-9);      // the weight shifts sides
  }
  // phase is linear in distance: two strides on = one full gait cycle
  close(w.phaseAt(2 * w.stride) - w.phaseAt(0), 2 * Math.PI);
});

test('amplitudes scale from k35\'s height-1.5 reference', () => {
  const tall = makeWalk({ seed: 1, height: 1.68 });
  let maxLift = 0;
  for (let s = 0; s < 2 * tall.stride; s += tall.stride / 100) {
    maxLift = Math.max(maxLift, tall.pose(s).lift);
  }
  close(maxLift, 1.68 * (0.035 / 1.5), 1e-5);   // bob rides with height
  close(tall.stride, 1.68 * 0.35);
});

test('seeded phase: deterministic, and no two walkers in lockstep', () => {
  const a1 = makeWalk({ seed: 36 });
  const a2 = makeWalk({ seed: 36 });
  const b = makeWalk({ seed: 37 });
  for (const s of [0, 0.77, 3.1]) {
    assert.deepEqual(a1.pose(s), a2.pose(s));   // same seed, same walk, always
  }
  // different seeds start at different points in the cycle
  assert.notEqual(a1.phaseAt(0), b.phaseAt(0));
  assert.ok(Math.abs(a1.pose(0).lift - b.pose(0).lift) > 1e-6);
});

test('apply dresses a group: lift on y, sway around the heading, roll on z', () => {
  const w = makeWalk({ seed: 5, height: 1.6 });
  const group = { position: { x: 3, y: 0, z: -2 }, rotation: { y: 0, z: 0 } };
  const heading = 1.234;
  const pose = w.apply(group, 2.4, heading, 0.5);
  close(group.position.y, 0.5 + pose.lift);
  close(group.rotation.y, heading + pose.yaw);
  close(group.rotation.z, pose.roll);
  assert.ok(Math.abs(group.rotation.y - heading) <= 0.06 + 1e-12);
  // apply never touches x/z — the case owns where the figure IS on the road
  assert.equal(group.position.x, 3);
  assert.equal(group.position.z, -2);
});

test('walkHeading turns the figure\'s true front — local +z — onto the travel direction', () => {
  // The forward axis was determined EMPIRICALLY (shots wip-monk-axis-*): the
  // figure's arm meshes hang at x = ±0.27, so the shoulder line spans x and
  // the body fronts ±z; the k35 souls Frank approved face travel with exactly
  // this mapping, and path.sample().heading (a gate you walk through) is the
  // same atan2. An earlier draft assumed aimMonk's +x — the POINTING-ARM
  // axis — and every walker read a quarter turn off the road (Frank, twice).
  // The four cardinal directions, pinned:
  close(walkHeading(0, 1), 0);                 // +z travel: no turn — forward IS +z
  close(walkHeading(1, 0), Math.PI / 2);       // +x travel: quarter turn
  close(walkHeading(0, -1), Math.PI);          // -z travel: about-face
  close(walkHeading(-1, 0), -Math.PI / 2);     // -x travel: quarter turn the other way
  // rotation.y maps local +z onto (sin y, 0, cos y): check it lands on the
  // travel direction for an arbitrary bearing
  const dx = -0.6, dz = 0.8;
  const y = walkHeading(dx, dz);
  close(Math.sin(y), dx, 1e-12);
  close(Math.cos(y), dz, 1e-12);
});

test('pathLength measures a sampled route', () => {
  const line = (t) => ({ x: 3 * t, z: 4 * t });
  close(pathLength(line), 5, 1e-9);
  close(pathLength(line, 8), 5, 1e-9);         // straight: sample count moot
  const quarter = (t) => ({ x: Math.cos(t * Math.PI / 2), z: Math.sin(t * Math.PI / 2) });
  close(pathLength(quarter, 256), Math.PI / 2, 1e-4);
});

test('the walk is pure and seeded — no Math.random', () => {
  const src = readFileSync(new URL('../src/kit/walk.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(/.test(src));   // calls, not the header's mention of the rule
});
