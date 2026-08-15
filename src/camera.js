// Gentle orbit + cursor parallax. Hand-rolled — no OrbitControls.
// The camera never affects simulation state, so mouse input never breaks determinism.

import * as THREE from '../lib/three.module.js';
import { noise1 } from './util/noise.js';
import { clamp } from './util/math.js';

// ---------------------------------------------------------------------------
// HEADING AND PITCH, IN DEGREES — the one vocabulary
// ---------------------------------------------------------------------------
// A camera on a sphere around a target is spherical-coordinate maths, and this
// file used to say so out loud: every koan's `camera:` block named an `azimuth`
// and a `polar` in radians, where polar is measured DOWN FROM STRAIGHT ABOVE so
// level is 1.5708 and a SMALLER number means the lens is HIGHER. Nobody composes
// a shot that way — pitch zero should mean horizontal — so the Compose panel
// spoke heading and pitch in degrees and converted at the
// edge — which left the panel and the file naming the same shot with different
// numbers, and a composer reading 17.2 off the panel to type 1.27 into the file.
//
// Now there is one vocabulary and the panel's numbers ARE the file's numbers:
//   heading — where you stand around the subject; 0 is square in front of it
//             (on +z, looking toward -z), positive swings left
//   pitch   — 0 is LEVEL with the target, positive looks DOWN on it from
//             above, negative looks up from below
// Both in degrees, everywhere the rig is authored, driven, or read back. The
// radians live inside eyePosition and nowhere else.
//
// (The free cam at the bottom of this file keeps its own yaw/pitch in RADIANS,
// in Three's rotation convention where positive pitch looks UP. It is a flier,
// not an orbit, and it writes camera.rotation directly — different job, and the
// opposite sign. Don't cross the two.)
const DEG = 180 / Math.PI;

// Where the lens ends up: the one place the spherical maths lives. The rig
// places the camera with it, and the case tests that ask "can you see the moon
// from the home framing" build their probe camera with it too, rather than each
// re-deriving the same three lines of trig — nine copies of which had to be
// found and converted by hand when the vocabulary changed.
export function eyePosition({ heading, pitch, distance }, target) {
  const a = heading / DEG;
  const p = (90 - pitch) / DEG;                  // back to polar-from-vertical
  const sp = Math.sin(p), cp = Math.cos(p);
  return [
    target[0] + distance * sp * Math.sin(a),
    target[1] + distance * cp,
    target[2] + distance * sp * Math.cos(a),
  ];
}

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

// THE FAR PLANE, named because two things have to agree about it. main.js
// builds the app's camera with it, and the night sky's star shell stands just
// inside it (kit/stars.js): the shell follows the lens, so its radius IS its
// distance from the eye, and every star has to be further off than anything
// the book actually draws or the terrain reads as being behind the sky. The
// furthest drawn geometry in the book sits around 82 from the lens, so there
// is room between that and this — but not much, which is the whole reason
// these two are one number instead of two.
export const CAMERA_FAR = 100;

// AND THE WHOLE OF THAT FRAMING, for the three places that need all of it
// rather than just the distance: main.js builds every case's rig from it, the
// tests' probe camera stands at it, and the four cases with no `camera:` of
// their own hand it to composeWorld as the view its scatter should stay inside.
// It was written out three times before that, which is two chances for the
// book's default shot and the tests' idea of it to drift apart.
export const DEFAULT_HOME = {
  distance: DEFAULT_HOME_DISTANCE, target: [1.2, 1.35, 0.3], heading: 31.5, pitch: 17.2,
};

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
// any of the forty-nine scenes, with nothing to check by hand.
//
// BUT THE BOUNDS ARE A CLAMP, NOT THE AMPLITUDE. The heading channel used to
// swing half the drag range, which is a quarter turn on the stock envelope, and
// that is what it looked like: every page turn in the look opened with the
// camera visibly rotating off the shot the case was composed for and then back.
// The two are different things — the drag range is a PERMISSION (how far a
// reader may aim), the drift is how much the scene breathes on its own — and
// tying one to the other also meant a case that allowed a wide orbit got a wild
// drift for it. The three amplitudes below are now of a size with each other,
// which is what "a bit more movement than sitting still, not a fairground ride"
// was always supposed to mean. The bounds still clamp, so a case with a NARROW
// orbit keeps its drift inside it.
//
// IT STARTS AT HOME. noise1(0, seed) is not 0.5 —
// it is wherever that seed's curve happens to begin — so without the envelope
// below the drift's very first frame was already 16.5 DEGREES off the case's
// heading. Entering the look therefore threw the goal sideways and the damping
// swung the camera after it, which is the twist it kept showing: entering the
// look swung the camera into a slightly different rotation than the one the
// case was composed at.
//
// The fix is an amplitude ramp rather than a re-centred curve: at t = 0 every
// offset is multiplied by zero, so the goal IS home and the shot the case was
// composed for holds. Over WANDER_RAMP seconds the breathing opens up to full.
// Slow relative to the 37/53/41-second channels, so it reads as the scene
// waking rather than as a separate move.
export const WANDER_RAMP = 6;
// How far each channel breathes, at full ramp: degrees, degrees, world units.
export const WANDER_SWING = { heading: 6, pitch: 5.7, distance: 2 };
export function wanderGoal(t, home, bounds) {
  const u = clamp(t / WANDER_RAMP, 0, 1);
  const ease = u * u * (3 - 2 * u);
  const swing = (period, seed) => (noise1(t / period, seed) * 2 - 1) * ease;   // -1..1, faded in
  return {
    heading: clamp(home.heading + swing(37, 11) * WANDER_SWING.heading,
      home.heading - bounds.headingRange, home.heading + bounds.headingRange),
    pitch: clamp(home.pitch + swing(53, 23) * WANDER_SWING.pitch, bounds.minPitch, bounds.maxPitch),
    distance: clamp(home.distance + swing(41, 37) * WANDER_SWING.distance, bounds.minDist, bounds.maxDist),
  };
}

// The stock envelope a case gets if it names no limits of its own. One copy:
// makeCameraRig defaults to it, and cameraBlock measures a composed framing
// against it to decide whether that framing has to carry limits of its own.
// The pitch pair reads backwards from the polar pair it replaced — a HIGH lens
// is a HIGH pitch — so the old floor (polar 0.9) is now the ceiling and vice
// versa; the degrees are the old radians rounded to something a person can hold.
export const RIG_BOUNDS = { minDist: 7, maxDist: 16, minPitch: 7, maxPitch: 38.5 };

// (There was a HANDS_OFF constant here: seconds of stillness before the drift
// took the camera back off a reader who had moved it. It is gone. Handing the
// lens back after a pause meant the shot you had just framed slid away to the
// case's default while you were looking at it, just for not having touched it
// for a while. The drift now stops for good the first time you take hold; see
// `taken` in makeCameraRig.)

// THE POINTER OUTLIVES THE RIG. Every page turn builds a fresh rig, and each
// rig used to open with its own mouse at (0,0) — parallax neutral — learning
// the real pointer only from its first pointermove. So a new case arrived
// composed for a centred cursor, and the reader's first twitch handed it the
// true position and the camera eased over to it: a visible snap on every page
// turn for anyone whose pointer was resting off-centre, which is everyone
// (Frank: "as soon as I move the mouse, it, like, snaps to knowing where the
// mouse is... it should already know"). One module-level record, written by
// whichever rig is live, read by the next one at birth.
const lastPointer = { x: 0, y: 0 };

export function makeCameraRig(camera, el, {
  target = [0, 1.1, 0],
  distance = 11,
  heading = 28.6,
  pitch = 18.4,
  minPitch = RIG_BOUNDS.minPitch,
  maxPitch = RIG_BOUNDS.maxPitch,
  headingRange = 51.5,
  minDist = RIG_BOUNDS.minDist,
  maxDist = RIG_BOUNDS.maxDist,
  parallax = 2.6,
  damping = 4,
  // THE WAY BACK OUT OF THE LOOK IS SLOWER THAN EVERYTHING ELSE. Leaving
  // restores `home` (setWander, below) and the standing damping took the
  // camera there in about a quarter second — correct, and it read as the shot
  // being snatched back the moment the panel returned. The reader has usually
  // just been moving this camera by hand, so the last thing it does under their
  // hand should settle rather than snap.
  //
  // NOT a second easing — the comment in update() rules that out and is right.
  // It is the SAME exponential, at a gentler rate, for the one stretch where
  // the camera is going somewhere the reader did not just ask it to go.
  returnDamping = 2,
} = {}) {
  // A COPY of the caller's target, never the caller's own array. A koan
  // module's `camera.target` literal is evaluated once and cached with the
  // module, so the Compose panel writing through to it would quietly re-author
  // the case for the rest of the session — and the next visit would open on a
  // framing that exists in no file.
  target = [target[0], target[1], target[2]];
  const home = { heading, pitch, distance };
  const goal = { heading, pitch, distance };
  // born knowing the pointer (lastPointer above): mouse starts at wherever the
  // cursor already rests, and cur starts at the goal PLUS that parallax — the
  // exact steady-state pose, so the arrival frame and the first mousemove
  // both change nothing
  const mouse = { x: lastPointer.x, y: lastPointer.y };
  const cur = {
    heading: heading + mouse.x * parallax,
    pitch: pitch + mouse.y * parallax,
    distance,
  };
  // The one copy of the envelope. The drag, the wheel and the drift all read
  // it here rather than closing over the arguments separately, so opening it
  // (Compose does) moves every clamp at once instead of three quarters of them.
  const bounds = { headingRange, minPitch, maxPitch, minDist, maxDist };
  let dragging = false, px = 0, py = 0;
  // EVERY FINGER DOWN ON THE STAGE, keyed by pointerId — one orbits, two pinch
  // the distance. A mouse is a single pointer and never reaches the second
  // branch, so nothing about the desktop controls changes. Only collected while
  // the controls are handed out, so a locked rig accumulates nothing.
  const pointers = new Map();
  // A pinch in progress: the finger spread it began at and the distance it began
  // from. The zoom is a RATIO against the grab, not an accumulation of frame
  // deltas — fingers returning to where they started bring the distance back
  // with them, which is what makes a pinch feel like holding the scene rather
  // than nudging it.
  let pinch = null;
  let wander = false, wanderTime = 0;
  // On the way home from the look, and only until it gets there — see
  // returnDamping above and the arrival test in update().
  let returning = false;
  // WHO IS ALLOWED TO AIM THE CAMERA. Cursor parallax (below) is always on —
  // it is the scene breathing with the reader, not a control. Dragging and the
  // wheel are a control, and main.js hands them out only in the look and to
  // the workbench: a reader with the text beside them gets the composition the
  // case was framed for, and cannot wander off it while reading.
  let drag = true;
  // ONCE THEY TAKE IT, THEY KEEP IT. A latch, not a timer: the first drag or
  // wheel on this rig stops the ambient drift and it does not come back. A
  // timer was tried and was wrong in the only way that matters — you frame a
  // shot, pause to look at it, and the scene pulls it away to the case's
  // default while you watch.
  //
  // Scoped to the rig, so it clears where it should: every page turn builds a
  // fresh one and the new scene breathes again. Leaving the look and returning
  // to the SAME page deliberately does not un-latch it — the alternative is
  // exactly the snap this replaced.
  let taken = false;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e) => {
    if (!drag) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // THE SECOND FINGER TAKES OVER. An orbit begun with the first has to stop,
    // and must not resume when the pinch ends: `dragging` is only ever armed by
    // a fresh FIRST-finger press, so lifting back to one finger leaves the
    // camera still instead of snapping by however far apart the two were.
    if (pointers.size === 2) {
      dragging = false;
      pinch = { spread: spread() || 1, distance: goal.distance };
      return;
    }
    if (pointers.size > 2) return;   // a third finger is not a third control
    dragging = true;
    px = e.clientX; py = e.clientY;
  };
  const onPointerMove = (e) => {
    const held = pointers.get(e.pointerId);
    if (held) { held.x = e.clientX; held.y = e.clientY; }
    if (pinch && pointers.size === 2) {
      const s = spread();
      if (s > 0) {
        // Spreading the fingers pulls the scene closer, which is LESS distance.
        goal.distance = clamp(pinch.distance * (pinch.spread / s), bounds.minDist, bounds.maxDist);
        taken = true;       // the lens is theirs now, exactly as the wheel does
      }
      // Two fingers are zooming, not breathing: feeding either one to the
      // parallax would swing the heading as they alternate reports.
      return;
    }
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    mouse.x = clamp((e.clientX / w) * 2 - 1, -1, 1);
    mouse.y = clamp((e.clientY / h) * 2 - 1, -1, 1);
    lastPointer.x = mouse.x;                 // for the NEXT rig — see above
    lastPointer.y = mouse.y;
    if (dragging) {
      // 0.29 deg/px — the 0.005 rad/px this dragged at before the vocabulary
      // changed. Pitch takes the drag with the opposite sign to the polar it
      // replaced: pulling the pointer DOWN lifts the lens, which is MORE pitch.
      goal.heading = clamp(goal.heading - (e.clientX - px) * 0.29, home.heading - bounds.headingRange, home.heading + bounds.headingRange);
      goal.pitch = clamp(goal.pitch + (e.clientY - py) * 0.29, bounds.minPitch, bounds.maxPitch);
      px = e.clientX; py = e.clientY;
      taken = true;         // the lens is theirs now; the drift is done
    }
  };
  // Both of these forget only the pointer they are about — a finger lifting off
  // a two-finger pinch must not take the other one's entry with it, or the map
  // would say nothing is down while a finger still is. `pointercancel` is here
  // for the OS stealing a gesture mid-pinch: without it that finger stays in the
  // map forever and every later touch looks like a pinch already in progress.
  const onPointerUp = (e) => {
    pointers.delete(e && e.pointerId);
    dragging = false;
    if (pointers.size < 2) pinch = null;
    // Back down to two from three: the surviving pair need not be the pair the
    // pinch was seeded against, and reusing the old spread would jump the zoom by
    // the whole difference between the two pairs. Re-seed against where the
    // fingers are NOW, from the distance the camera is at now — the same ratio
    // form as a fresh grab, so the gesture just carries on.
    else if (pinch) pinch = { spread: spread() || 1, distance: goal.distance };
  };
  const onPointerLeave = onPointerUp;
  const onWheel = (e) => {
    // Bail BEFORE preventDefault: with the camera locked, a wheel over the
    // stage is not ours to swallow.
    if (!drag) return;
    e.preventDefault?.();
    taken = true;
    goal.distance = clamp(goal.distance + e.deltaY * 0.01, bounds.minDist, bounds.maxDist);
  };
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('pointercancel', onPointerLeave);
  el.addEventListener('wheel', onWheel);

  function update(dt) {
    // Ambient mode moves the GOAL and lets the existing damping do the smoothing
    // — there is no second easing here, and there shouldn't be.
    //
    // THE DRIFT GIVES WAY FOR GOOD. It used to overwrite the goal every frame,
    // so a drag was undone before it could be seen; then it gave way for a few
    // seconds and took the shot back, which was worse — you would frame
    // something, stop to look at it, and watch it slide off to the case's
    // default. It is one-way now: hands on the camera, and this page has
    // stopped breathing until the reader turns the page.
    if (wander && !taken) {
      wanderTime += dt;
      Object.assign(goal, wanderGoal(wanderTime, home, bounds));
    }
    const wantHeading = goal.heading + mouse.x * parallax;
    const wantPitch = goal.pitch + mouse.y * parallax;
    const k = 1 - Math.exp(-(returning ? returnDamping : damping) * dt);
    cur.heading += (wantHeading - cur.heading) * k;
    cur.pitch += (wantPitch - cur.pitch) * k;
    cur.distance += (goal.distance - cur.distance) * k;
    // ARRIVED, so hand the camera back to the standing damping. An exponential
    // never technically lands, so this asks whether the gap is smaller than the
    // reader could see — a twentieth of a degree, a hundredth of a unit — which
    // is also what stops the softer rate leaking into the page's own parallax
    // and leaving the cursor feeling laggy for the rest of the visit.
    if (returning
      && Math.abs(wantHeading - cur.heading) < 0.05
      && Math.abs(wantPitch - cur.pitch) < 0.05
      && Math.abs(goal.distance - cur.distance) < 0.01) returning = false;
    const [tx, ty, tz] = target;
    const [ex, ey, ez] = eyePosition(cur, target);
    camera.position.set(ex, ey, ez);
    camera.lookAt(tx, ty, tz);
  }

  // Place the camera NOW rather than leaving it wherever the last scene left it.
  // update() is the only thing that writes camera.position, and the frame loop
  // only ticks when it has a whole 1/60 s of time banked — so a frame shorter
  // than that renders with the rig built but never applied. Behind a held still
  // nobody sees it; on a cold arrival, where there is no still, it showed as one
  // frame of the diorama viewed from the world origin. cur already starts at the
  // goal plus the resting pointer's parallax, and dt=0 makes the damping term
  // zero, so this is exactly the pose the first tick would have produced —
  // just a frame earlier.
  update(0);

  const state = () => ({ heading: cur.heading, pitch: cur.pitch, distance: cur.distance });

  function dispose() {
    el.removeEventListener?.('pointerdown', onPointerDown);
    el.removeEventListener?.('pointermove', onPointerMove);
    el.removeEventListener?.('pointerup', onPointerUp);
    el.removeEventListener?.('pointerleave', onPointerLeave);
    el.removeEventListener?.('pointercancel', onPointerLeave);
    el.removeEventListener?.('wheel', onWheel);
  }

  // `home` is returned because the drift breathes around the case's own framing,
  // and the lens slider has to be able to move that framing with it.
  // Entering and leaving the look are both EDGES, not states, and each has to
  // put the goal somewhere sane.
  //
  // Leaving restores `home`. The drift had walked the goal away from the case's
  // framing, wander switching off simply froze it there, and the reader dropped
  // back onto their page looking at a shot nobody composed, in a slightly
  // different place than they left. The damping eases it back rather than
  // cutting.
  //
  // Entering rewinds the clock and un-latches, so every visit to the look opens
  // on the composed shot and breathes out from there (wanderGoal ramps from
  // zero at t = 0). Without the rewind, a second look would resume mid-curve
  // and jump exactly the way the first one used to.
  const setWander = (on) => {
    const next = !!on;
    if (next === wander) return;
    wander = next;
    // Entering cancels a return still in flight (look, leave, look again before
    // it settles) — the softer rate belongs to the way OUT, and carrying it in
    // would make that second visit open sluggishly.
    if (wander) { wanderTime = 0; taken = false; returning = false; }
    else { Object.assign(goal, home); returning = true; }
  };
  // Turning the controls off mid-grab has to release the grab too, or the next
  // pointermove over the locked stage would still be steering. The finger map
  // goes with it: a page turn locks the rig, and a hand still on the glass would
  // otherwise be counted as half a pinch by the rig that arrives next.
  const setDrag = (on) => {
    drag = !!on;
    if (!drag) { dragging = false; pinch = null; pointers.clear(); }
  };
  const canDrag = () => drag;

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
    for (const k of ['heading', 'pitch', 'distance']) {
      if (next[k] === undefined) continue;
      home[k] = next[k];
      goal[k] = next[k];
    }
    bounds.minDist = Math.min(bounds.minDist, home.distance);
    bounds.maxDist = Math.max(bounds.maxDist, home.distance);
    bounds.minPitch = Math.min(bounds.minPitch, home.pitch);
    bounds.maxPitch = Math.max(bounds.maxPitch, home.pitch);
  }
  const setTarget = (x, y, z) => { target[0] = x; target[1] = y; target[2] = z; };

  return {
    update, state, goal, home, setWander, setDrag, canDrag, dispose,
    setHome, setTarget, bounds,
    target: () => [target[0], target[1], target[2]],
  };
}

// The BODY of a koan module's `const CAM = { ... };` — the fields only, with no
// braces and no trailing comma. The last step of composing a shot is getting it
// out of the browser and into the file, and reading six numbers off a panel and
// retyping them is where shots get lost.
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
// The angles go out at ONE decimal, which is what the panel displays: a shot
// read off the sliders and a shot pasted into a file are then the same number
// on the page, which is the whole reason the vocabulary changed. A tenth of a
// degree is 0.0017 rad — finer than the eye, and finer than a slider step.
const r3 = (n) => +n.toFixed(3);
const r1 = (n) => +n.toFixed(1);
export function cameraBlock({ distance, heading, pitch }, target) {
  const b = RIG_BOUNDS;
  const parts = [
    `distance: ${r3(distance)}`,
    `target: [${target.map(r3).join(', ')}]`,
    `heading: ${r1(heading)}`,
    `pitch: ${r1(pitch)}`,
  ];
  const extra = [];
  // a hair of margin, so the authored value is not sitting exactly on the rail
  if (distance < b.minDist) extra.push(`minDist: ${r3(Math.max(1, distance - 1))}`);
  if (distance > b.maxDist) extra.push(`maxDist: ${r3(distance + 1)}`);
  if (pitch < b.minPitch) extra.push(`minPitch: ${r1(Math.max(-87, pitch - 3.4))}`);
  if (pitch > b.maxPitch) extra.push(`maxPitch: ${r1(Math.min(87, pitch + 3.4))}`);
  // THE BRACES ARE NOT INCLUDED, and that is the point: what gets pasted should
  // be the contents of the literal, nothing to trim off either end. Every case
  // now hoists `const CAM = { ... };` above its module object, so what a
  // composer wants is the INSIDE of that literal — select between the braces,
  // paste, done. The old output was `camera: { ... },`, which matched the
  // inline shape no case is written in any more and had to be unwrapped by hand
  // every single time.
  return parts.concat(extra).join(', ');
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
      // TRANSITIONS ONLY — a re-assertion of the current state must be a no-op.
      // The workbench's apply() re-fires onFreeCam on every scene swap, and
      // set(true) on an already-flying cam re-seeded yaw/pitch from the
      // camera's CURRENT direction — which, right after a page build, is the
      // new rig's lookAt, not the flier's heading. Position survived,
      // orientation was silently replaced.
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
