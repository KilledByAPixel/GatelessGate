import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k45 from '../src/koans/k45.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

function staged({ hits = false } = {}) {
  const ctx = fakeCtx();
  // the tap tests need the ray to land on him; the rest want it to miss
  if (hits) ctx.input.raycastFirst = () => ({ object: null, point: new THREE.Vector3() });
  const root = k45.build(ctx);
  const cam = new THREE.PerspectiveCamera(38, 1.78, 0.1, 200);
  cam.position.set(6, 5, 8);
  cam.lookAt(0, 1.5, -1);
  cam.updateMatrixWorld(true);
  root.setCamera(cam);
  return { root, cam, tap: () => { for (const cb of ctx._taps) cb(); } };
}

const named = (scene, name) => {
  const out = [];
  scene.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

test('the market is there: a row of stalls', () => {
  const { root } = staged();
  assert.equal(named(root.scene, 'stall').length, 3, 'three stalls line the lane');
});

test('the horse is the one red thing, and it stands still', () => {
  const { root } = staged();
  const horse = named(root.scene, 'horse');
  assert.equal(horse.length, 1, 'one horse tethered by the stalls');
  // the abstract marker stone is gone — the horse carries the accent now
  assert.equal(named(root.scene, 'marker').length, 0, 'no marker stone any more');

  // every accent-coloured mesh in the street belongs to the horse
  const want = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT].map((c) => new THREE.Color(c).getHexString()));
  const reds = [];
  root.scene.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material && o.material.color
        && want.has(o.material.color.getHexString())) reds.push(o);
  });
  assert.ok(reds.length > 0, 'the horse is red');
  for (const m of reds) assert.ok(named(horse[0], m.name).length || horse[0] === m || isDescendant(horse[0], m),
    'nothing red outside the horse');

  const before = horse[0].position.clone();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  assert.ok(before.distanceTo(horse[0].position) < 1e-6, 'the horse does not wander');
});

function isDescendant(root, node) {
  for (let n = node; n; n = n.parent) if (n === root) return true;
  return false;
}

test('the strollers walk the lane; the keepers and customer hold their posts', () => {
  const { root } = staged();
  const monks = named(root.scene, 'monk');
  assert.ok(monks.length >= 5, 'keepers, a customer, and two strollers');
  const spans = new Map(monks.map((m) => [m.uuid, { min: Infinity, max: -Infinity }]));
  for (let i = 0; i < 60 * 12; i++) {
    root.update(1 / 60, i / 60);
    for (const m of monks) {
      const s = spans.get(m.uuid);
      s.min = Math.min(s.min, m.position.x);
      s.max = Math.max(s.max, m.position.x);
    }
  }
  const ranges = [...spans.values()].map((s) => s.max - s.min).sort((a, b) => b - a);
  assert.ok(ranges[0] > 3 && ranges[1] > 3, 'two figures roam the lane');
  assert.ok(ranges.filter((r) => r < 0.01).length >= 3, 'and three stand still');
});

// Where he lands in the PICTURE, which is the only place this case's staging
// means anything. y = 1 is his middle, matching the module's own check.
function framePos(him, cam) {
  const v = new THREE.Vector3(him.position.x, 1.0, him.position.z).project(cam);
  return { x: v.x, y: v.y, inFrame: v.z > 0 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
}

// A still camera is the case a reading page actually presents: the panel is up,
// the rig does not drift and cannot be dragged, and the shot is the composed one.
// He used to be UNREACHABLE here — staged behind the camera, where no lag could
// ever bring him into the frustum (see the module header) — so this is the
// regression that matters most.
test('a still camera still shows him, at the margin, from the first frame', () => {
  const { root, cam } = staged();
  const him = named(root.scene, 'him')[0];
  const first = framePos(him, cam);
  assert.ok(first.inFrame, 'he is in the picture before update() has ever run');
  assert.ok(Math.abs(first.x) > 0.5, `and out at the margin, not centred (x=${first.x.toFixed(2)})`);

  for (let i = 0; i < 60 * 30; i++) root.update(1 / 60, i / 60);
  const later = framePos(him, cam);
  assert.ok(later.inFrame, 'and half a minute later he is still there');
  assert.ok(Math.abs(later.x) > 0.5, 'still at the margin');
  assert.equal(root.fragment().seen, true);
});

test('he never crosses the middle of a still shot, and never jumps while visible', () => {
  const { root, cam } = staged();
  const him = named(root.scene, 'him')[0];
  let central = 0;
  let biggestStep = 0;
  let prev = him.position.clone();
  for (let i = 0; i < 60 * 30; i++) {
    root.update(1 / 60, i / 60);
    const p = framePos(him, cam);
    if (p.inFrame) {
      if (Math.abs(p.x) < 0.45) central++;
      // a re-place is a teleport, and the whole guard on it is that he must be
      // off-frame first: a visible jump is what would read as a pop
      biggestStep = Math.max(biggestStep, him.position.distanceTo(prev));
    }
    prev.copy(him.position);
  }
  assert.equal(central, 0, 'he is never caught in the middle of the frame');
  assert.ok(biggestStep < 0.1, `no visible teleport (biggest on-screen step ${biggestStep.toFixed(3)})`);
});

test('reach for him and he walks out of the shot — on his feet, not by vanishing', () => {
  const { root, cam, tap } = staged({ hits: true });
  const him = named(root.scene, 'him')[0];
  for (let i = 0; i < 60 * 3; i++) root.update(1 / 60, i / 60);
  assert.ok(framePos(him, cam).inFrame, 'he is there to be reached for');
  const from = him.position.clone();

  tap();
  assert.equal(root.fragment().caught, 1);

  // he leaves under his own steam: still on screen for a moment, walking
  let leftAt = -1;
  let biggestStep = 0;
  let prev = him.position.clone();
  for (let i = 0; i < 60 * 12; i++) {
    root.update(1 / 60, 3 + i / 60);
    if (framePos(him, cam).inFrame) biggestStep = Math.max(biggestStep, him.position.distanceTo(prev));
    else if (leftAt < 0) leftAt = i / 60;
    prev.copy(him.position);
  }
  assert.ok(leftAt > 0.3, `he does not blink out (gone after ${leftAt.toFixed(2)}s)`);
  assert.ok(biggestStep < 0.1, 'and never jumps while he is still visible');
  assert.ok(him.position.distanceTo(from) > 0.5, 'he actually moved');
});

test('swing the camera and he does not run off to infinity', () => {
  const { root, cam } = staged();
  const him = named(root.scene, 'him')[0];
  let nan = 0;
  for (let i = 0; i < 60 * 10; i++) {
    // orbit the camera hard, so his mark is being thrown across the street
    const a = i / 60;
    cam.position.set(Math.cos(a) * 9, 5, Math.sin(a) * 9);
    cam.lookAt(0, 1.5, -1);
    cam.updateMatrixWorld(true);
    root.update(1 / 60, a);
    if (!Number.isFinite(him.position.x) || !Number.isFinite(him.position.z)) nan++;
    assert.ok(Math.hypot(him.position.x, him.position.z) < 20, 'he stays in the world');
  }
  assert.equal(nan, 0);
  // and he is still somebody the reader can find afterwards
  assert.ok(root.fragment().places > 0, 'being outrun re-places him rather than dragging him along');
});
