import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import {
  makeCameraRig, wanderGoal, makeFreeCam, packFreeCam, unpackFreeCam,
  eyePosition, cameraBlock,
} from '../src/camera.js';

// The rig's own defaults — the envelope a reader can reach by dragging.
const HOME = { heading: 31.5, pitch: 17.2, distance: 11.5 };
const BOUNDS = { headingRange: 51.5, minPitch: 7, maxPitch: 38.5, minDist: 7, maxDist: 16 };

function fakeEl() {
  const handlers = {};
  return {
    clientWidth: 800,
    clientHeight: 600,
    handlers,
    addEventListener(type, fn) { handlers[type] = fn; },
  };
}

test('drag clamps pitch and heading to configured range', () => {
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 400 - 100000, clientY: 300 + 100000 });
  el.handlers.pointerup({});
  assert.ok(rig.goal.pitch >= 7 && rig.goal.pitch <= 38.5, `pitch ${rig.goal.pitch}`);
  assert.ok(rig.goal.heading >= 28.6 - 51.5 - 1e-9 && rig.goal.heading <= 28.6 + 51.5 + 1e-9, `heading ${rig.goal.heading}`);
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
  assert.ok(Math.abs(s.heading - rig.goal.heading) < 2.9, `heading ${s.heading} vs goal ${rig.goal.heading}`);
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
    assert.ok(Number.isFinite(g.heading) && Number.isFinite(g.pitch) && Number.isFinite(g.distance),
      `non-finite goal at t=${t}: ${JSON.stringify(g)}`);
    assert.ok(g.heading >= HOME.heading - BOUNDS.headingRange - 1e-9
      && g.heading <= HOME.heading + BOUNDS.headingRange + 1e-9, `heading ${g.heading} at t=${t}`);
    assert.ok(g.pitch >= BOUNDS.minPitch - 1e-9 && g.pitch <= BOUNDS.maxPitch + 1e-9,
      `pitch ${g.pitch} at t=${t}`);
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
  const seen = { heading: [], pitch: [], distance: [] };
  for (let t = 0; t < 600; t += 0.5) {
    const g = wanderGoal(t, HOME, BOUNDS);
    for (const k of Object.keys(seen)) seen[k].push(g[k]);
  }
  const spread = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(seen.heading) > 11, `heading barely moves: ${spread(seen.heading)}`);
  assert.ok(spread(seen.pitch) > 2.9, `pitch barely moves: ${spread(seen.pitch)}`);
  assert.ok(spread(seen.distance) > 1, `distance barely moves: ${spread(seen.distance)}`);
});

test('the drift stays near the case home framing, not out at the limits', () => {
  // "A bit more movement", not a fairground ride: the average pose over a long
  // sweep should sit close to where the case framed itself.
  let n = 0, az = 0, po = 0, di = 0;
  for (let t = 0; t < 3000; t += 0.5) {
    const g = wanderGoal(t, HOME, BOUNDS);
    az += g.heading; po += g.pitch; di += g.distance; n++;
  }
  assert.ok(Math.abs(az / n - HOME.heading) < 11.5, `heading mean drifts off home: ${az / n}`);
  assert.ok(Math.abs(po / n - HOME.pitch) < 3.5, `pitch mean drifts off home: ${po / n}`);
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

test('pitch zero is level, positive pitch looks down, heading zero stands on +z', () => {
  // The whole reason the vocabulary changed: polar measured level as 1.5708 and
  // counted DOWNWARD, so a smaller number meant a higher lens — backwards to
  // everyone who ever composed a shot. These four assertions ARE the convention.
  const T = [1, 2, 3];
  const at = (heading, pitch) => eyePosition({ heading, pitch, distance: 10 }, T);

  assert.ok(Math.abs(at(0, 0)[1] - T[1]) < 1e-9, 'pitch 0 puts the lens level with the target');
  assert.ok(at(0, 30)[1] > T[1], 'positive pitch looks DOWN on it from above');
  assert.ok(at(0, -30)[1] < T[1], 'negative pitch looks up from below');

  // heading 0 stands square in front, on +z; positive swings left, toward +x
  const front = at(0, 0);
  assert.ok(Math.abs(front[0] - T[0]) < 1e-9 && front[2] > T[2], `heading 0 sits on +z: ${front}`);
  assert.ok(at(45, 0)[0] > T[0], 'positive heading swings toward +x');

  // and it is a sphere: every framing is `distance` from the target
  for (const [h, p] of [[0, 0], [31.5, 17.2], [-120, -40], [200, 80]]) {
    const [x, y, z] = eyePosition({ heading: h, pitch: p, distance: 10 }, T);
    const d = Math.hypot(x - T[0], y - T[1], z - T[2]);
    assert.ok(Math.abs(d - 10) < 1e-9, `heading ${h} pitch ${p} is off the sphere: ${d}`);
  }
});

test('the copied camera block is the line a koan module wants', () => {
  const line = cameraBlock({ distance: 11.5, heading: 31.5, pitch: 17.2 }, [0.4, 1.8, -1]);
  assert.equal(line, 'camera: { distance: 11.5, target: [0.4, 1.8, -1], heading: 31.5, pitch: 17.2 },');
});

test('a framing outside the rig envelope copies the widened bounds with it', () => {
  // k35's trap: distance 5.5 and pitch 4.1 both sit outside the stock
  // envelope, so the framing holds on arrival and dies at the first scroll.
  // The block that needs bounds carries them rather than relying on memory.
  const line = cameraBlock({ distance: 5.5, heading: -31.5, pitch: 4.1 }, [0.4, 1.8, -1]);
  assert.ok(line.includes('minDist: 4.5'), `widened near limit: ${line}`);
  assert.ok(line.includes('minPitch: 0.7'), `widened low limit: ${line}`);
  // a framing inside the envelope says nothing about bounds
  const plain = cameraBlock({ distance: 11.5, heading: 31.5, pitch: 17.2 }, [0, 1.1, 0]);
  assert.ok(!/minDist|maxDist|minPitch|maxPitch/.test(plain), `no noise: ${plain}`);
});

test('composing moves the framing and opens the envelope to hold it', () => {
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  const cam = new THREE.PerspectiveCamera();
  const rig = makeCameraRig(cam, fakeEl(), { target: [0, 1.1, 0], distance: 11.5 });
  rig.setHome({ distance: 5.5, pitch: 4.1 });
  assert.equal(rig.home.distance, 5.5);
  assert.ok(rig.bounds.minDist <= 5.5, `envelope opened: ${rig.bounds.minDist}`);
  assert.ok(rig.bounds.minPitch <= 4.1, `envelope opened: ${rig.bounds.minPitch}`);
});

test('a rig never writes through to the caller\'s target array', () => {
  // A koan module's `camera.target` literal is evaluated once and cached with
  // the module. If the rig held that array, composing would re-author the case
  // for the session and the next visit would open on a framing in no file.
  const authored = [1, 2, 3];
  const cam = new THREE.PerspectiveCamera();
  const rig = makeCameraRig(cam, fakeEl(), { target: authored });
  rig.setTarget(9, 9, 9);
  assert.deepEqual(authored, [1, 2, 3], 'the module\'s own array is untouched');
  assert.deepEqual(rig.target(), [9, 9, 9]);
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

test('re-asserting an already-on free cam never reseeds the heading', () => {
  // The reload-restore bug's last layer (Frank: "the position is the same,
  // but the orientation is not"): the workbench's apply() re-fires
  // onFreeCam(true) on every scene swap, and set(true) on an already-flying
  // cam re-read yaw/pitch from the camera's CURRENT direction — which right
  // after a page build is the new rig's lookAt, not the flier's heading.
  // set() is transitions-only now; a re-assertion must change nothing.
  globalThis.addEventListener = globalThis.addEventListener || (() => {});
  const cam = new THREE.PerspectiveCamera();
  const free = makeFreeCam(cam, fakeEl());
  free.set(true);
  free.setPose({ pos: [3, 4, 5], yaw: 0.7, pitch: -0.3 });
  cam.lookAt(-20, 0, -20);       // a fresh rig aims the camera at its case...
  free.set(true);                // ...and the workbench re-asserts "on"
  const p = free.pose();
  assert.equal(p.yaw, 0.7, 'yaw survives the re-assertion');
  assert.equal(p.pitch, -0.3, 'pitch survives the re-assertion');
});
