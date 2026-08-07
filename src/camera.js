// Gentle orbit + cursor parallax. Hand-rolled — no OrbitControls.
// The camera never affects simulation state, so mouse input never breaks determinism.

import * as THREE from '../lib/three.module.js';
import { noise1 } from './util/noise.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The distance a case gets when it names no `camera` of its own — main.js's
// buildKoan passes this as the `distance` in its makeRig({...}) call, which
// is NOT the same thing as makeCameraRig's own `distance = 11` default just
// below: that one only applies if makeRig is ever called with no options
// object at all, which main.js never does (it always passes at least this
// value). One named export, so main.js, staging.test.js's own rigCamera()
// stub, and spatial.test.js's ref-median test all read the SAME number
// instead of three independent literal 11.5s that could drift apart with
// nothing to notice — which is exactly the shape of bug task-12 exists to
// fix everywhere else in this file's neighbourhood.
export const DEFAULT_HOME_DISTANCE = 11.5;

// The ambient drift: seconds in, a rig goal out. Pure, so the whole of the
// motion can be tested in plain Node, and seeded rather than random because the
// determinism rule covers the camera like everything else.
//
// Three channels on coprime periods (37 / 53 / 41 seconds). One period, or
// periods sharing a factor, becomes a recognisable loop within a couple of
// minutes of watching — which is exactly the length of time someone leaves this
// mode running.
//
// EVERYTHING IS CLAMPED TO THE RIG'S OWN BOUNDS, and that is the whole safety
// argument: those are the angles and distances a reader can already reach by
// dragging, art-directed per case long before this existed. Staying inside them
// means the drift cannot push the camera through a tree or under the ground in
// any of the forty-nine scenes, with nothing to check by hand. The amounts are
// deliberately modest — half the drag range in azimuth, a tenth of a radian in
// polar, a couple of units of breath in distance. A bit more movement than
// sitting still, not a fairground ride.
export function wanderGoal(t, home, bounds) {
  const swing = (period, seed) => noise1(t / period, seed) * 2 - 1;   // -1..1
  return {
    azimuth: clamp(home.azimuth + swing(37, 11) * bounds.azimuthRange * 0.5,
      home.azimuth - bounds.azimuthRange, home.azimuth + bounds.azimuthRange),
    polar: clamp(home.polar + swing(53, 23) * 0.1, bounds.minPolar, bounds.maxPolar),
    distance: clamp(home.distance + swing(41, 37) * 2, bounds.minDist, bounds.maxDist),
  };
}

// The stock envelope a case gets if it names no limits of its own. One copy:
// makeCameraRig defaults to it, and cameraBlock measures a composed framing
// against it to decide whether that framing has to carry limits of its own.
export const RIG_BOUNDS = { minDist: 7, maxDist: 16, minPolar: 0.9, maxPolar: 1.45 };

export function makeCameraRig(camera, el, {
  target = [0, 1.1, 0],
  distance = 11,
  azimuth = 0.5,
  polar = 1.25,
  minPolar = RIG_BOUNDS.minPolar,
  maxPolar = RIG_BOUNDS.maxPolar,
  azimuthRange = 0.9,
  minDist = RIG_BOUNDS.minDist,
  maxDist = RIG_BOUNDS.maxDist,
  parallax = 0.045,
  damping = 4,
} = {}) {
  // A COPY of the caller's target, never the caller's own array. A koan
  // module's `camera.target` literal is evaluated once and cached with the
  // module, so the Compose panel writing through to it would quietly re-author
  // the case for the rest of the session — and the next visit would open on a
  // framing that exists in no file.
  target = [target[0], target[1], target[2]];
  const home = { azimuth, polar, distance };
  const goal = { azimuth, polar, distance };
  const cur = { azimuth, polar, distance };
  // The one copy of the envelope. The drag, the wheel and the drift all read
  // it here rather than closing over the arguments separately, so opening it
  // (Compose does) moves every clamp at once instead of three quarters of them.
  const bounds = { azimuthRange, minPolar, maxPolar, minDist, maxDist };
  const mouse = { x: 0, y: 0 };
  let dragging = false, px = 0, py = 0;
  let wander = false, wanderTime = 0;

  const onPointerDown = (e) => {
    dragging = true;
    px = e.clientX; py = e.clientY;
  };
  const onPointerMove = (e) => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    mouse.x = clamp((e.clientX / w) * 2 - 1, -1, 1);
    mouse.y = clamp((e.clientY / h) * 2 - 1, -1, 1);
    if (dragging) {
      goal.azimuth = clamp(goal.azimuth - (e.clientX - px) * 0.005, home.azimuth - bounds.azimuthRange, home.azimuth + bounds.azimuthRange);
      goal.polar = clamp(goal.polar - (e.clientY - py) * 0.005, bounds.minPolar, bounds.maxPolar);
      px = e.clientX; py = e.clientY;
    }
  };
  const onPointerUp = () => { dragging = false; };
  const onPointerLeave = () => { dragging = false; };
  const onWheel = (e) => {
    e.preventDefault?.();
    goal.distance = clamp(goal.distance + e.deltaY * 0.01, bounds.minDist, bounds.maxDist);
  };
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('wheel', onWheel);

  function update(dt) {
    // Ambient mode moves the GOAL and lets the existing damping do the smoothing
    // — there is no second easing here, and there shouldn't be. A drag while the
    // drift is running is overwritten on the next frame, so the camera eases back;
    // that is a known limit of this first pass, not an accident.
    if (wander) {
      wanderTime += dt;
      Object.assign(goal, wanderGoal(wanderTime, home, bounds));
    }
    const k = 1 - Math.exp(-damping * dt);
    cur.azimuth += (goal.azimuth + mouse.x * parallax - cur.azimuth) * k;
    cur.polar += (goal.polar - mouse.y * parallax - cur.polar) * k;
    cur.distance += (goal.distance - cur.distance) * k;
    const [tx, ty, tz] = target;
    const sp = Math.sin(cur.polar), cp = Math.cos(cur.polar);
    camera.position.set(
      tx + cur.distance * sp * Math.sin(cur.azimuth),
      ty + cur.distance * cp,
      tz + cur.distance * sp * Math.cos(cur.azimuth)
    );
    camera.lookAt(tx, ty, tz);
  }

  // Place the camera NOW rather than leaving it wherever the last scene left it.
  // update() is the only thing that writes camera.position, and the frame loop
  // only ticks when it has a whole 1/60 s of time banked — so a frame shorter
  // than that renders with the rig built but never applied. Behind a held still
  // nobody sees it; on a cold arrival, where there is no still, it showed as one
  // frame of the diorama viewed from the world origin. cur already starts at the
  // goal, and dt=0 makes the damping term zero, so this is exactly the pose the
  // first tick would have produced — just a frame earlier.
  update(0);

  const state = () => ({ azimuth: cur.azimuth, polar: cur.polar, distance: cur.distance });

  function dispose() {
    el.removeEventListener?.('pointerdown', onPointerDown);
    el.removeEventListener?.('pointermove', onPointerMove);
    el.removeEventListener?.('pointerup', onPointerUp);
    el.removeEventListener?.('pointerleave', onPointerLeave);
    el.removeEventListener?.('wheel', onWheel);
  }

  // `home` is returned because the drift breathes around the case's own framing,
  // and the lens slider has to be able to move that framing with it.
  const setWander = (on) => { wander = !!on; };

  // ---- composing (the workbench's Compose panel) --------------------------
  // Moving the framing live means moving home AND goal: home is what the drift
  // breathes around, goal is where the damping is heading. cur is left alone so
  // the camera EASES to the new framing rather than snapping — which is what
  // makes a slider feel like aiming a camera instead of teleporting one.
  //
  // The bounds open to admit whatever is asked for. A composer dragging the
  // distance slider past the stock minimum means it, and clamping them back
  // silently is how a framing gets tuned to a number the rig will not hold.
  // What the bounds ended up as is readable, so the copied block can say so.
  function setHome(next) {
    for (const k of ['azimuth', 'polar', 'distance']) {
      if (next[k] === undefined) continue;
      home[k] = next[k];
      goal[k] = next[k];
    }
    bounds.minDist = Math.min(bounds.minDist, home.distance);
    bounds.maxDist = Math.max(bounds.maxDist, home.distance);
    bounds.minPolar = Math.min(bounds.minPolar, home.polar);
    bounds.maxPolar = Math.max(bounds.maxPolar, home.polar);
  }
  const setTarget = (x, y, z) => { target[0] = x; target[1] = y; target[2] = z; };

  return {
    update, state, goal, home, setWander, dispose,
    setHome, setTarget, bounds,
    target: () => [target[0], target[1], target[2]],
  };
}

// ---------------------------------------------------------------------------
// COMPOSING A SHOT: heading and pitch, in degrees
// ---------------------------------------------------------------------------
// The rig thinks in spherical coordinates because that is what places a camera
// on a sphere around a target. Nobody composes a shot that way. `polar` is
// measured DOWN FROM STRAIGHT ABOVE, so level is 1.5708 and a smaller number
// means higher up — backwards from how anyone reads it (Frank: "I would expect
// that pitch zero would be horizontal").
//
// So the workbench speaks heading and pitch, in degrees:
//   heading — where you stand around the subject; 0 is square in front of it
//             (on +z, looking toward -z), positive swings left
//   pitch   — 0 is LEVEL with the target, positive looks DOWN on it from
//             above, negative looks up from below
// The file on disk keeps radians, because that is what makeCameraRig takes;
// the conversion happens here, once, in a pair anyone can test.
const DEG = 180 / Math.PI;

export function toHeadingPitch({ azimuth, polar }) {
  return { heading: azimuth * DEG, pitch: 90 - polar * DEG };
}

export function fromHeadingPitch({ heading, pitch }) {
  return { azimuth: heading / DEG, polar: (90 - pitch) / DEG };
}

// The `camera:` block a koan module wants, as source text — the last step of
// composing a shot is getting it out of the browser and into the file, and
// reading six numbers off a panel and retyping them is where shots get lost.
//
// It emits bounds ONLY when the framing needs them. A case whose distance or
// pitch falls outside the rig's stock envelope has to widen it or the reader's
// first scroll or drag clamps the composition away for good — the trap k35 sat
// in. Rather than leave that to be remembered, the block that would need it
// carries it.
// Compared against the STOCK envelope, never the rig's live one: Compose has
// already opened the live bounds to admit whatever is being composed, so
// asking it whether the framing fits would always answer yes and the block
// would omit the very limits it exists to carry.
const r3 = (n) => +n.toFixed(3);
export function cameraBlock({ distance, azimuth, polar }, target) {
  const b = RIG_BOUNDS;
  const parts = [
    `distance: ${r3(distance)}`,
    `target: [${target.map(r3).join(', ')}]`,
    `azimuth: ${r3(azimuth)}`,
    `polar: ${r3(polar)}`,
  ];
  const extra = [];
  // a hair of margin, so the authored value is not sitting exactly on the rail
  if (distance < b.minDist) extra.push(`minDist: ${r3(Math.max(1, distance - 1))}`);
  if (distance > b.maxDist) extra.push(`maxDist: ${r3(distance + 1)}`);
  if (polar < b.minPolar) extra.push(`minPolar: ${r3(Math.max(0.05, polar - 0.06))}`);
  if (polar > b.maxPolar) extra.push(`maxPolar: ${r3(Math.min(Math.PI - 0.05, polar + 0.06))}`);
  return `camera: { ${parts.concat(extra).join(', ')} },`;
}

// THE FREE CAM'S POSE, KEPT ACROSS RELOADS. Reloading is how iterating on a
// scene works — edit a file, reload, look at the same thing from the same
// place — and losing the camera every time made the free cam nearly useless
// for the job it exists to do. The URL already restores WHICH page; this
// restores where you were standing on it.
//
// Pure, so the round trip is testable without a browser: main.js owns
// localStorage, this owns the shape.
export const FREECAM_KEY = 'gg-freecam-v1';

export function packFreeCam(pose) {
  return { on: true, pos: [pose.pos[0], pose.pos[1], pose.pos[2]], yaw: pose.yaw, pitch: pose.pitch };
}

// null unless developer mode is on AND the blob is a complete, finite,
// still-enabled pose. The devMode gate is the whole safety story: a reader
// can never be dropped into a flying camera, whatever localStorage holds.
export function unpackFreeCam(raw, devMode) {
  if (!devMode || !raw) return null;
  let o = raw;
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw); } catch { return null; }
  }
  if (!o || o.on !== true || !Array.isArray(o.pos) || o.pos.length !== 3) return null;
  const nums = [o.pos[0], o.pos[1], o.pos[2], o.yaw, o.pitch];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { pos: [o.pos[0], o.pos[1], o.pos[2]], yaw: o.yaw, pitch: o.pitch };
}

// A dev free camera: WASD walks, Q/E sinks/rises, Shift hurries, drag looks.
// Debug-panel only — it is not part of the book. It never touches sim state;
// while it is on, the orbit rig simply stops being applied, and turning it
// off lets the rig ease the camera home from wherever you wandered.
export function makeFreeCam(camera, el) {
  let on = false;
  let yaw = 0, pitch = 0;
  const keys = new Set();
  let dragging = false, px = 0, py = 0;

  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
  const onKeyDown = (e) => { if (on && !typing(e)) keys.add(e.code); };
  const onKeyUp = (e) => keys.delete(e.code);
  const onPointerDown = (e) => { if (on) { dragging = true; px = e.clientX; py = e.clientY; } };
  const onPointerMove = (e) => {
    if (!on || !dragging) return;
    yaw -= (e.clientX - px) * 0.004;
    pitch = clamp(pitch - (e.clientY - py) * 0.004, -1.5, 1.5);
    px = e.clientX; py = e.clientY;
  };
  const onPointerUp = () => { dragging = false; };

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointerleave', onPointerUp);

  return {
    enabled: () => on,
    set(enabled) {
      // TRANSITIONS ONLY — a re-assertion of the current state must be a
      // no-op. The workbench's apply() re-fires onFreeCam on every scene
      // swap, and set(true) on an already-flying cam re-seeded yaw/pitch
      // from the camera's CURRENT direction — which, right after a page
      // build, is the new rig's lookAt, not the flier's heading. Position
      // survived, orientation was silently replaced (Frank: "the position
      // is the same, but the orientation is not").
      if (!!enabled === on) return;
      on = !!enabled;
      keys.clear();
      if (on) {
        // seed the pose from wherever the rig left the camera, so the
        // hand-off is seamless rather than a snap to origin
        const d = new THREE.Vector3();
        camera.getWorldDirection(d);
        yaw = Math.atan2(-d.x, -d.z);
        pitch = Math.asin(clamp(d.y, -1, 1));
      }
    },
    // What to store, and how to come back to it. `setPose` is only meaningful
    // while the cam is on — set() seeds yaw/pitch from the rig camera, so a
    // restore must call set(true) FIRST and setPose second, or the saved
    // heading is overwritten by wherever the rig happened to be looking.
    pose() {
      return { pos: [camera.position.x, camera.position.y, camera.position.z], yaw, pitch };
    },
    setPose(p) {
      camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
      yaw = p.yaw;
      pitch = p.pitch;
    },
    update(dt) {
      if (!on) return;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch, yaw, 0);
      const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 18 : 6) * dt;
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
      if (keys.has('KeyW')) camera.position.addScaledVector(f, speed);
      if (keys.has('KeyS')) camera.position.addScaledVector(f, -speed);
      if (keys.has('KeyD')) camera.position.addScaledVector(r, speed);
      if (keys.has('KeyA')) camera.position.addScaledVector(r, -speed);
      if (keys.has('KeyQ')) camera.position.y -= speed;
      if (keys.has('KeyE')) camera.position.y += speed;
    },
  };
}
