import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import {
  makeCameraRig, wanderGoal, WANDER_SWING, makeFreeCam, packFreeCam, unpackFreeCam,
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

// Reading a page, the camera is the case's own composition and the reader only
// breathes it with the cursor. The controls belong to the look. main.js decides
// which is which (canDragCamera); the rig only has to honour the switch.
test('a locked camera ignores the drag and does not swallow the wheel', () => {
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  rig.setDrag(false);
  assert.equal(rig.canDrag(), false);
  const heading = rig.goal.heading, distance = rig.goal.distance;

  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 100, clientY: 600 });
  el.handlers.pointerup({});
  assert.equal(rig.goal.heading, heading, 'a drag must not aim a locked camera');

  // The wheel has to fall THROUGH, not be eaten: with the camera locked, a
  // scroll over the stage is not the rig's to take.
  let prevented = false;
  el.handlers.wheel({ deltaY: 500, preventDefault: () => { prevented = true; } });
  assert.equal(rig.goal.distance, distance, 'and must not zoom it');
  assert.equal(prevented, false, 'a locked rig must not preventDefault the wheel');
});

test('locking mid-grab releases the grab', () => {
  // Otherwise the next pointermove over the now-locked stage keeps steering,
  // because `dragging` was left true when the controls went away.
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  rig.setDrag(false);
  const heading = rig.goal.heading;
  el.handlers.pointermove({ clientX: 100, clientY: 300 });
  assert.equal(rig.goal.heading, heading, 'the grab must not survive the lock');
});

// The bug, seen twice over: entering the look started the camera in a slightly
// wrong rotation, and leaving it put the camera back in a slightly different
// place than it was. One cause — noise1(0, seed) is not 0.5, so the drift's
// first frame was 16.5 degrees off the case's heading. Entering threw the goal
// sideways; leaving froze it wherever the drift had walked to.
test('entering the look does not move the camera off the case\'s framing', () => {
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), fakeEl(), {});
  const home = { ...rig.home };
  rig.setWander(true);
  for (let i = 0; i < 3; i++) rig.update(1 / 60);
  assert.ok(Math.abs(rig.goal.heading - home.heading) < 0.05,
    `the look opened ${Math.abs(rig.goal.heading - home.heading).toFixed(2)} deg off the composed shot`);
  assert.ok(Math.abs(rig.goal.pitch - home.pitch) < 0.05, `pitch jumped: ${rig.goal.pitch}`);
  assert.ok(Math.abs(rig.goal.distance - home.distance) < 0.02, `distance jumped: ${rig.goal.distance}`);
});

test('leaving the look hands the page its composed framing back', () => {
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), fakeEl(), {});
  const home = { ...rig.home };
  rig.setWander(true);
  for (let i = 0; i < 60 * 30; i++) rig.update(1 / 60);       // half a minute of drift
  assert.notEqual(rig.goal.heading, home.heading, 'it did drift, so the test means something');

  rig.setWander(false);
  assert.equal(rig.goal.heading, home.heading, 'the page must not keep the drift\'s heading');
  assert.equal(rig.goal.pitch, home.pitch);
  assert.equal(rig.goal.distance, home.distance);
});

// THE WAY BACK OUT IS SLOWER THAN EVERYTHING ELSE, and it is the same
// exponential at a gentler rate rather than a second easing. Feel-tuning like
// this regresses silently — the goal lands in the right place either way, and
// only the rate says whether the shot settles or is snatched back — so it is
// pinned as a comparison rather than as a number.
// Drift for half a minute, leave the look, and run `frames` of the way back.
// MEASURED AGAINST WHERE IT ACTUALLY COMES TO REST, not against `home`: the
// resting pose is home PLUS the pointer's parallax, and `lastPointer` is module
// state that an earlier test in this file has already moved. Measuring to home
// silently folds that offset into every reading.
function driftThenLeave(opts, frames) {
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), fakeEl(), opts);
  rig.setWander(true);
  for (let i = 0; i < 60 * 30; i++) rig.update(1 / 60);
  const start = rig.state().heading;
  rig.setWander(false);
  for (let i = 0; i < frames; i++) rig.update(1 / 60);
  return { rig, start, now: rig.state().heading };
}
// Where a rig built RIGHT NOW comes to rest, run far past arrival. Computed
// inside each test rather than once at the top of the file: `lastPointer` is
// module state that earlier tests move, and a rest measured before they ran is
// a target none of these rigs is actually heading for.
const restingHeading = () => driftThenLeave({ returnDamping: 4 }, 60 * 10).now;

test('leaving the look eases back more gently than the standing damping', () => {
  const REST = restingHeading();
  const soft = driftThenLeave({}, 6);                          // a tenth of a second
  const hard = driftThenLeave({ returnDamping: 4 }, 6);         // ...at the standing rate
  assert.ok(Math.abs(soft.start - REST) > 0.4,
    `the drift barely moved (${Math.abs(soft.start - REST).toFixed(2)} deg) — the test means nothing`);
  assert.equal(soft.start.toFixed(6), hard.start.toFixed(6),
    'both rigs must leave from the same place or the comparison says nothing');

  const softLeft = Math.abs(soft.now - REST);
  const hardLeft = Math.abs(hard.now - REST);
  assert.ok(softLeft > hardLeft * 1.15,
    `the return is not softer: ${softLeft.toFixed(3)} left vs ${hardLeft.toFixed(3)} at the standing rate`);
});

test('the softer rate is spent by the time it arrives, and never on the page', () => {
  // Otherwise the whole visit reads laggy: the page's own cursor parallax would
  // keep running at the return's rate long after the return was over.
  const REST = restingHeading();
  const { rig } = driftThenLeave({}, 60 * 5);                  // five seconds is plenty
  assert.ok(Math.abs(rig.state().heading - REST) < 0.05, 'it never actually settled');

  // and from here it moves at the standing rate again: a fresh rig, asked to
  // cover the same ground from the same place, arrives together with it
  const fresh = makeCameraRig(new THREE.PerspectiveCamera(), fakeEl(), {});
  fresh.update(1 / 60);
  fresh.goal.heading = fresh.home.heading + 10;
  rig.goal.heading = rig.home.heading + 10;
  for (let i = 0; i < 6; i++) { fresh.update(1 / 60); rig.update(1 / 60); }
  assert.ok(Math.abs(fresh.state().heading - rig.state().heading) < 0.05,
    `the returned rig is still moving at the softer rate (${fresh.state().heading.toFixed(3)} vs ${rig.state().heading.toFixed(3)})`);
});

test('a second visit to the look opens on the composed shot too', () => {
  // Without rewinding the drift clock, re-entering resumes mid-curve and jumps
  // exactly the way the first visit used to.
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), fakeEl(), {});
  const home = { ...rig.home };
  rig.setWander(true);
  for (let i = 0; i < 60 * 30; i++) rig.update(1 / 60);
  rig.setWander(false);
  rig.setWander(true);
  for (let i = 0; i < 3; i++) rig.update(1 / 60);
  assert.ok(Math.abs(rig.goal.heading - home.heading) < 0.05,
    `the second look opened ${Math.abs(rig.goal.heading - home.heading).toFixed(2)} deg off`);
});

test('the drift runs until the reader takes hold, and then never again', () => {
  const el = fakeEl();
  const rig = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  rig.setWander(true);
  rig.setDrag(true);

  // hands off: the scene breathes
  for (let i = 0; i < 120; i++) rig.update(1 / 60);
  assert.notEqual(rig.goal.heading, rig.home.heading, 'the drift moves the goal on its own');

  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 300, clientY: 300 });
  el.handlers.pointerup({});
  const held = rig.goal.heading;

  // A timed hand-back was tried and was wrong: you frame a shot, pause to look
  // at it, and the scene pulls it to the case's default while you watch. Two
  // full minutes here — far past any plausible timeout — and it must not move.
  for (let i = 0; i < 120 * 60; i++) rig.update(1 / 60);
  assert.equal(rig.goal.heading, held, 'the drift must never take the shot back');
});

test('a fresh rig breathes again — the latch is per page, not forever', () => {
  // Every page turn builds a new rig, which is what clears it. If the latch
  // ever moved to module scope, the first drag of a session would kill the
  // drift for the whole book.
  const el = fakeEl();
  const first = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  first.setWander(true); first.setDrag(true);
  el.handlers.pointerdown({ clientX: 400, clientY: 300 });
  el.handlers.pointermove({ clientX: 300, clientY: 300 });
  el.handlers.pointerup({});

  const el2 = fakeEl();
  const next = makeCameraRig(new THREE.PerspectiveCamera(), el2, {});
  next.setWander(true);
  for (let i = 0; i < 120; i++) next.update(1 / 60);
  assert.notEqual(next.goal.heading, next.home.heading, 'the new page drifts');
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

test('a new rig is born knowing the pointer — no snap on the first move', () => {
  // The page-turn glitch: every rig opened with its parallax neutral and only
  // learned the pointer from its own first pointermove, so a new case arrived
  // composed for a centred cursor and the reader's first twitch swung the
  // camera over to the real position (Frank: "it should already know where
  // the mouse is"). The pointer outlives the rig now — a fresh rig opens on
  // the exact pose the settled one held, and the first move to the same spot
  // changes nothing at all.
  const el = fakeEl();
  const first = makeCameraRig(new THREE.PerspectiveCamera(), el, {});
  el.handlers.pointermove({ clientX: 700, clientY: 100 });   // cursor resting off-centre
  for (let i = 0; i < 600; i++) first.update(1 / 60);
  const settled = first.state();

  // the page turns: a fresh rig, fresh canvas, no events fired on it yet
  const el2 = fakeEl();
  const next = makeCameraRig(new THREE.PerspectiveCamera(), el2, {});
  const born = next.state();
  assert.ok(Math.abs(born.heading - settled.heading) < 0.05,
    `born ${born.heading.toFixed(3)} vs settled ${settled.heading.toFixed(3)} — the new page forgot the pointer`);
  assert.ok(Math.abs(born.pitch - settled.pitch) < 0.05,
    `pitch born ${born.pitch.toFixed(3)} vs settled ${settled.pitch.toFixed(3)}`);

  // and the first move — cursor exactly where it was resting — is a no-op
  el2.handlers.pointermove({ clientX: 700, clientY: 100 });
  for (let i = 0; i < 60; i++) next.update(1 / 60);
  assert.ok(Math.abs(next.state().heading - born.heading) < 0.05,
    'the first mousemove must not swing the shot');
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
  assert.ok(spread(seen.heading) > 6, `heading barely moves: ${spread(seen.heading)}`);
  assert.ok(spread(seen.pitch) > 2.9, `pitch barely moves: ${spread(seen.pitch)}`);
  assert.ok(spread(seen.distance) > 1, `distance barely moves: ${spread(seen.distance)}`);
});

test('the drift breathes; it does not swing off the composed shot', () => {
  // THE BOUNDS ARE A CLAMP, NOT THE AMPLITUDE. The heading channel used to
  // swing half the drag range — a quarter turn on the stock envelope — so every
  // page turn in the look opened with the camera visibly rotating away from the
  // shot the case was composed for. The drag range is a permission; the drift
  // is how much the scene breathes. Tying them together also gave a case that
  // allowed a WIDE orbit a wilder drift, which is backwards.
  const wide = { ...BOUNDS, headingRange: 120 };
  let worst = 0;
  for (let t = 0; t < 3000; t += 0.25) {
    worst = Math.max(worst, Math.abs(wanderGoal(t, HOME, wide).heading - HOME.heading));
  }
  assert.ok(worst <= WANDER_SWING.heading + 1e-9,
    `the drift swings ${worst.toFixed(1)}° off the shot on a wide-orbit case`);

  // ...and the three channels stay of a size with each other, which is what
  // keeps any one of them from reading as a move rather than a breath.
  const amps = Object.values(WANDER_SWING);
  assert.ok(Math.max(...amps) / Math.min(...amps) < 4,
    `one channel dwarfs the others: ${JSON.stringify(WANDER_SWING)}`);
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

test('the copied camera block drops straight inside a case\'s CAM braces', () => {
  // Fields only — no braces, no `camera:` prefix, no trailing comma. Every case
  // hoists `const CAM = { ... };`, so what a composer pastes is the inside of
  // that literal. Pinned by round-trip rather than by string match alone: the
  // text has to be a real object body, and it has to parse back to the numbers
  // that went in.
  const body = cameraBlock({ distance: 11.5, heading: 31.5, pitch: 17.2 }, [0.4, 1.8, -1]);
  assert.equal(body, 'distance: 11.5, target: [0.4, 1.8, -1], heading: 31.5, pitch: 17.2');
  assert.ok(!body.includes('{') && !body.includes('}'), `no braces: ${body}`);
  assert.ok(!body.endsWith(','), `no trailing comma: ${body}`);

  const round = new Function(`return { ${body} };`)();
  assert.deepEqual(round, { distance: 11.5, target: [0.4, 1.8, -1], heading: 31.5, pitch: 17.2 });
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
  // The reload-restore bug's last layer — position survived, orientation did
  // not: the workbench's apply() re-fires onFreeCam(true) on every scene swap,
  // and set(true) on an already-flying cam re-read yaw/pitch from the camera's
  // CURRENT direction — which right after a page build is the new rig's lookAt,
  // not the flier's heading. set() is transitions-only now; a re-assertion must
  // change nothing.
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
