import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k45 from '../src/koans/k45.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

function staged() {
  const root = k45.build(fakeCtx());
  const cam = new THREE.PerspectiveCamera(38, 1.78, 0.1, 200);
  cam.position.set(6, 5, 8);
  cam.lookAt(0, 1.5, -1);
  cam.updateMatrixWorld(true);
  root.setCamera(cam);
  return { root, cam };
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

test('he keeps to your back: swing the camera and he does not run off to infinity', () => {
  const { root, cam } = staged();
  const him = named(root.scene, 'him')[0];
  let nan = 0;
  for (let i = 0; i < 60 * 10; i++) {
    // orbit the camera so "behind you" keeps moving
    const a = i / 60;
    cam.position.set(Math.cos(a) * 9, 5, Math.sin(a) * 9);
    cam.lookAt(0, 1.5, -1);
    cam.updateMatrixWorld(true);
    root.update(1 / 60, a);
    if (!Number.isFinite(him.position.x) || !Number.isFinite(him.position.z)) nan++;
    assert.ok(Math.hypot(him.position.x, him.position.z) < 20, 'he stays in the world');
  }
  assert.equal(nan, 0);
});
