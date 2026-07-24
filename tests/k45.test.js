import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k45 from '../src/koans/k45.js';

const fakeCtx = () => ({ audio: null, input: { onTap() {}, onHover() {}, raycastFirst: () => null } });

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

test('the one warm mark is still the marker stone, and it stays put', () => {
  const { root } = staged();
  const cut = named(root.scene, 'cut');
  assert.equal(cut.length, 1, 'exactly one red mark in the whole street');
  const before = cut[0].getWorldPosition(new THREE.Vector3()).clone();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  root.scene.updateMatrixWorld(true);
  const after = cut[0].getWorldPosition(new THREE.Vector3());
  assert.ok(before.distanceTo(after) < 1e-6, 'the marker does not drift');
});

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
