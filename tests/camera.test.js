import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCameraRig, wanderGoal, makeFreeCam, packFreeCam, unpackFreeCam } from '../src/camera.js';

// The rig's own defaults — the envelope a reader can reach by dragging.
const HOME = { azimuth: 0.55, polar: 1.27, distance: 11.5 };
const BOUNDS = { azimuthRange: 0.9, minPolar: 0.9, maxPolar: 1.45, minDist: 7, maxDist: 16 };

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

// ---- ambient drift ----
// The whole safety argument for ambient mode is that the drift stays inside the
// bounds a reader can already drag to, because those were art-directed per case.
// If it can leave them it can push the camera through a tree or under the
// ground in any of 49 scenes, so this is the test that matters.

test('the ambient drift never leaves the rig bounds', () => {
  for (let t = 0; t < 6000; t += 0.31) {
    const g = wanderGoal(t, HOME, BOUNDS);
    assert.ok(Number.isFinite(g.azimuth) && Number.isFinite(g.polar) && Number.isFinite(g.distance),
      `non-finite goal at t=${t}: ${JSON.stringify(g)}`);
    assert.ok(g.azimuth >= HOME.azimuth - BOUNDS.azimuthRange - 1e-9
      && g.azimuth <= HOME.azimuth + BOUNDS.azimuthRange + 1e-9, `azimuth ${g.azimuth} at t=${t}`);
    assert.ok(g.polar >= BOUNDS.minPolar - 1e-9 && g.polar <= BOUNDS.maxPolar + 1e-9,
      `polar ${g.polar} at t=${t}`);
    assert.ok(g.distance >= BOUNDS.minDist - 1e-9 && g.distance <= BOUNDS.maxDist + 1e-9,
      `distance ${g.distance} at t=${t}`);
  }
});

test('the ambient drift is seeded, not random', () => {
  for (const t of [0, 3.5, 97.25, 1234.75]) {
    assert.deepEqual(wanderGoal(t, HOME, BOUNDS), wanderGoal(t, HOME, BOUNDS), `t=${t}`);
  }
});

test('the ambient drift actually drifts, on all three axes', () => {
  // Guards against a "wander" that clamps or averages its way into sitting
  // still — which would pass the bounds test above perfectly.
  const seen = { azimuth: [], polar: [], distance: [] };
  for (let t = 0; t < 600; t += 0.5) {
    const g = wanderGoal(t, HOME, BOUNDS);
    for (const k of Object.keys(seen)) seen[k].push(g[k]);
  }
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(seen.azimuth) > 0.2, `azimuth barely moves: ${spread(seen.azimuth)}`);
  assert.ok(spread(seen.polar) > 0.05, `polar barely moves: ${spread(seen.polar)}`);
  assert.ok(spread(seen.distance) > 1, `distance barely moves: ${spread(seen.distance)}`);
});

test('the drift stays near the case home framing, not out at the limits', () => {
  // "A bit more movement", not a fairground ride: the average pose over a long
  // sweep should sit close to where the case framed itself.
  let n = 0, az = 0, po = 0, di = 0;
  for (let t = 0; t < 3000; t += 0.5) {
    const g = wanderGoal(t, HOME, BOUNDS);
    az += g.azimuth; po += g.polar; di += g.distance; n++;
  }
  assert.ok(Math.abs(az / n - HOME.azimuth) < 0.2, `azimuth mean drifts off home: ${az / n}`);
  assert.ok(Math.abs(po / n - HOME.polar) < 0.06, `polar mean drifts off home: ${po / n}`);
  assert.ok(Math.abs(di / n - HOME.distance) < 1.2, `distance mean drifts off home: ${di / n}`);
});

test('a rig with wander on moves the camera over time; with it off it holds still', () => {
  const cam = new THREE.PerspectiveCamera();
  const rig = makeCameraRig(cam, fakeEl(), { target: [0, 1.1, 0], distance: 11.5 });
  const start = cam.position.clone();
  for (let i = 0; i < 600; i++) rig.update(1 / 60);
  assert.ok(cam.position.distanceTo(start) < 1e-6, 'camera moved with wander off');

  rig.setWander(true);
  for (let i = 0; i < 600; i++) rig.update(1 / 60);
  assert.ok(cam.position.distanceTo(start) > 0.25,
    `camera barely drifted with wander on: ${cam.position.distanceTo(start)}`);
});

test('a free-cam pose survives the round trip', () => {
  const pose = { pos: [1.5, 2.25, -3], yaw: 0.4, pitch: -0.2 };
  const back = unpackFreeCam(JSON.stringify(packFreeCam(pose)), true);
  assert.deepEqual(back, pose);
});

test('a reader never lands in the free cam', () => {
  // The one rule this feature has to keep: dev mode off means whatever is in
  // localStorage is refused, so "off = the app as it was" stays literally true.
  const saved = JSON.stringify(packFreeCam({ pos: [0, 1, 0], yaw: 0, pitch: 0 }));
  assert.equal(unpackFreeCam(saved, false), null);
});

test('an unusable saved pose is refused rather than flown', () => {
  assert.equal(unpackFreeCam(null, true), null, 'nothing saved');
  assert.equal(unpackFreeCam('{not json', true), null, 'garbage');
  assert.equal(unpackFreeCam('{"on":false,"pos":[0,0,0],"yaw":0,"pitch":0}', true), null, 'cam was off');
  assert.equal(unpackFreeCam('{"on":true,"pos":[0,0],"yaw":0,"pitch":0}', true), null, 'short position');
  assert.equal(unpackFreeCam('{"on":true,"pos":[0,null,0],"yaw":0,"pitch":0}', true), null, 'null coordinate');
  assert.equal(unpackFreeCam('{"on":true,"pos":[0,0,0],"yaw":0}', true), null, 'no pitch');
  const nan = { on: true, pos: [0, 0, 0], yaw: Number.NaN, pitch: 0 };
  assert.equal(unpackFreeCam(nan, true), null, 'NaN yaw');
});

test('the free cam reports and accepts a pose', () => {
  // makeFreeCam binds the WASD keys at window level, which plain Node has no
  // global for. The keys are not what this test is about; a no-op stub lets
  // the pose half be tested without a browser.
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  const cam = new THREE.PerspectiveCamera();
  const free = makeFreeCam(cam, fakeEl());
  free.set(true);
  free.setPose({ pos: [3, 4, 5], yaw: 0.7, pitch: -0.3 });
  const p = free.pose();
  assert.deepEqual(p.pos, [3, 4, 5]);
  assert.equal(p.yaw, 0.7);
  assert.equal(p.pitch, -0.3);
  // and the pose is what actually drives the camera on the next update
  free.update(1 / 60);
  assert.deepEqual([cam.position.x, cam.position.y, cam.position.z], [3, 4, 5]);
  assert.ok(Math.abs(cam.rotation.y - 0.7) < 1e-9, `yaw applied: ${cam.rotation.y}`);
});
