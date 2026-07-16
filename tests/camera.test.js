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
