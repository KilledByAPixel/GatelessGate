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

export function makeCameraRig(camera, el, {
  target = [0, 1.1, 0],
  distance = 11,
  azimuth = 0.5,
  polar = 1.25,
  minPolar = 0.9,
  maxPolar = 1.45,
  azimuthRange = 0.9,
  minDist = 7,
  maxDist = 16,
  parallax = 0.045,
  damping = 4,
} = {}) {
  const home = { azimuth, polar, distance };
  const goal = { azimuth, polar, distance };
  const cur = { azimuth, polar, distance };
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
      goal.azimuth = clamp(goal.azimuth - (e.clientX - px) * 0.005, home.azimuth - azimuthRange, home.azimuth + azimuthRange);
      goal.polar = clamp(goal.polar - (e.clientY - py) * 0.005, minPolar, maxPolar);
      px = e.clientX; py = e.clientY;
    }
  };
  const onPointerUp = () => { dragging = false; };
  const onPointerLeave = () => { dragging = false; };
  const onWheel = (e) => {
    e.preventDefault?.();
    goal.distance = clamp(goal.distance + e.deltaY * 0.01, minDist, maxDist);
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

  return { update, state, goal, home, setWander, dispose };
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
