import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCameraRig } from '../src/camera.js';

function fakeEl() {
  const handlers = {};
  return {
    clientWidth: 800,
    clientHeight: 600,
    handlers,
    addEventListener(type, fn) { handlers[type] = fn; },
  };
}

test('drag clamps polar and azimuth to configured range', () => {
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 400 - 100000, clientY: 300 + 100000 });
  el.handlers.pointerup({});
  assert.ok(rig.goal.polar >= 0.9 && rig.goal.polar <= 1.45, `polar ${rig.goal.polar}`);
  assert.ok(rig.goal.azimuth >= 0.5 - 0.9 - 1e-9 && rig.goal.azimuth <= 0.5 + 0.9 + 1e-9, `azimuth ${rig.goal.azimuth}`);
});

test('wheel clamps distance', () => {
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  el.handlers.wheel({ deltaY: 1e7 });
  assert.equal(rig.goal.distance, 16);
  el.handlers.wheel({ deltaY: -1e7 });
  assert.equal(rig.goal.distance, 7);
});

test('a new rig has already placed the camera, before any update', () => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(99, 99, 99);            // wherever the last scene left it
  const rig = makeCameraRig(cam, fakeEl(), { target: [1, 2, 3], distance: 11.5 });
  // No update() call: a frame short enough to bank less than one tick still
  // renders, and it must not render from the origin (or from the old scene's
  // camera). Deep-link boots cut straight to the diorama with no held still to
  // hide that frame behind.
  const dist = cam.position.distanceTo(new THREE.Vector3(1, 2, 3));
  assert.ok(Math.abs(dist - 11.5) < 1e-6, `camera not on the sphere yet: ${dist}`);
  assert.equal(rig.state().distance, 11.5);
});

test('update converges toward goal and positions the camera', () => {
  const el = fakeEl();
  const cam = new THREE.PerspectiveCamera();
  const rig = makeCameraRig(cam, el, {});
  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 500, clientY: 300 });
  el.handlers.pointerup({});
  for (let i = 0; i < 600; i++) rig.update(1 / 60);
  const s = rig.state();
  assert.ok(Math.abs(s.azimuth - rig.goal.azimuth) < 0.05, `azimuth ${s.azimuth} vs goal ${rig.goal.azimuth}`);
  const dist = cam.position.distanceTo(new THREE.Vector3(0, 1.1, 0));
  assert.ok(Math.abs(dist - s.distance) < 0.01, `camera not on sphere: ${dist} vs ${s.distance}`);
});
