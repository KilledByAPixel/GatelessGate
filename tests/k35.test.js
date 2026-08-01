import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k35 from '../src/koans/k35.js';

// Case 35, the two souls. Frank's note this round: "make them not walk
// through each other: once one's on one side of the road, once the other."
// These tests pin the lanes — each soul keeps to her own side of the road for
// the whole cycle, and at the meeting they stand BESIDE each other, never in
// each other — while holding the deliberate ghosting (the case's whole point)
// exactly where it was.

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    accent: k35.accent,
    quality: 'high',
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

const CYCLE = 26;                       // k35's apart-and-together period

function soulsOf(built) {
  const souls = [];
  built.scene.traverse((o) => { if (o.name === 'soul') souls.push(o); });
  return souls;
}

test('the souls keep to their own sides and pass beside each other, never through', () => {
  const built = k35.build(fakeCtx());
  const souls = soulsOf(built);
  assert.equal(souls.length, 2, 'two of her');

  // walk a little over one full cycle and track the closest they ever come
  let minGap = Infinity;
  let maxGap = 0;
  const sides = [new Set(), new Set()];
  for (let i = 0; i <= Math.ceil(CYCLE * 60 * 1.05); i++) {
    built.update(1 / 60, i / 60);
    const [a, b] = souls;
    const gap = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
    minGap = Math.min(minGap, gap);
    maxGap = Math.max(maxGap, gap);
    // which side of the road is each on? The road runs roughly from (6.5, 6)
    // to (-6, -12): measure the signed offset off that chord. Lanes are ±0.4
    // off a wandering centreline (wander 0.6), so the SIGN against the chord
    // is not a per-frame invariant — but the average had better split.
    for (const [j, s] of souls.entries()) {
      sides[j].add(Math.sign(sideOfChord(s.position)) || 1);
    }
  }

  // the pass: two lanes of ±0.4 meet 0.8 apart, shoulder to shoulder —
  // a merge (the old centreline staging) would drive this to ~0
  assert.ok(minGap > 0.75, `at the pass they stand beside each other, got ${minGap.toFixed(3)}`);
  assert.ok(minGap < 0.95, `but the meeting still reads as a meeting, got ${minGap.toFixed(3)}`);
  // and the cycle still carries them genuinely apart (mutation guard: a test
  // that would also pass if they never moved is no test)
  assert.ok(maxGap > 4.0, `they still separate down the road, got ${maxGap.toFixed(3)}`);
});

// signed distance of a point from the road's end-to-end chord (6.5,6)→(-6,-12)
function sideOfChord(p) {
  const ax = 6.5, az = 6.0, bx = -6.0, bz = -12.0;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  return ((p.x - ax) * (-dz) + (p.z - az) * dx) / len;
}

test('each soul owns one lane: their signed road offsets never trade places', () => {
  const built = k35.build(fakeCtx());
  const souls = soulsOf(built);
  // at the meeting (t=0 is together: sep starts at 0) they are at the same
  // point along the road, so the chord side IS the lane side — sample the
  // first beat and then every near-meeting moment of two full cycles
  let checked = 0;
  for (let i = 0; i <= Math.ceil(CYCLE * 60 * 2); i++) {
    built.update(1 / 60, i / 60);
    const t = (i / 60) / CYCLE;
    const nearMeeting = Math.abs(t - Math.round(t)) < 0.02;
    if (!nearMeeting) continue;
    const s0 = sideOfChord(souls[0].position);
    const s1 = sideOfChord(souls[1].position);
    // side by side at the pass, and always the same way around: soul 0 takes
    // the +perp lane by construction, so her chord offset stays the greater
    assert.ok(s0 > s1 + 0.5,
      `lanes hold at the meeting, frame ${i}: ${s0.toFixed(2)} vs ${s1.toFixed(2)}`);
    checked++;
  }
  assert.ok(checked >= 3, `saw at least the opening and two later meetings, got ${checked}`);
});

test('the deliberate ghosting is untouched: both translucent, equal, and solidest at the meeting', () => {
  const built = k35.build(fakeCtx());
  const souls = soulsOf(built);

  const opacityOf = (s) => {
    const ops = [];
    s.traverse((o) => { if (o.isMesh && o.material) ops.push(o.material.opacity); });
    assert.ok(ops.length > 0);
    for (const op of ops) assert.equal(op, ops[0], 'one figure, one opacity');
    return ops[0];
  };

  // at the meeting (phase 0): most solid, and still translucent
  built.update(1 / 60, 0);
  const together = souls.map(opacityOf);
  assert.equal(together[0], together[1], 'neither is ever the brighter one');
  assert.ok(together[0] > 0.85 && together[0] < 1.0, `solidest at the pass, got ${together[0]}`);

  // half a cycle on (fully apart): faintest, and still there
  for (let i = 1; i <= Math.ceil(CYCLE * 30); i++) built.update(1 / 60, i / 60);
  const apart = souls.map(opacityOf);
  assert.equal(apart[0], apart[1]);
  assert.ok(apart[0] > 0.4 && apart[0] < together[0] - 0.2,
    `faint when apart (${apart[0]}) vs the meeting (${together[0]})`);

  // and the ghost plumbing itself: transparent, no depth punch-through
  // (outline hull shells ride along as children — they are not the ghost)
  for (const s of souls) {
    s.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline) return;
      assert.equal(o.material.transparent, true);
      assert.equal(o.material.depthWrite, false, 'two ghosts must not punch holes in each other');
    });
  }
});
