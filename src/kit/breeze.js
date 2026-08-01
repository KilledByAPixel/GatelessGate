// The pointer's breeze: moving the mouse (or a touch drag) across the diorama
// stirs the foliage near it — a lot of motion in the grass, a little in the
// trees. This module is the SHARED STATE plus the pure math, split from the
// consumers in the testable-state pattern: main.js feeds it one ground-plane
// point per tick, the grass fields and composeWorld's trees read it back.
//
// Deterministic by construction: strength derives ONLY from the fed points and
// dt — no Math.random, no wall clock — so the same pointer path over the same
// steps always stirs the same blades the same way. A scene whose pointer never
// moves is bit-identical to one built before this file existed.

// ---- tuning ----------------------------------------------------------------
// Pointer speed (world units/second on the ground plane) that maps to full
// strength. The case camera puts roughly 12 world units across the stage, so a
// half-screen swipe in half a second is a full-strength gust.
export const BREEZE_MAX_SPEED = 10;
// Dead zone: the jitter of a resting hand is not a breeze.
export const BREEZE_MIN_SPEED = 0.35;
// Strength easing, seconds to ~63%: quick to answer a swipe, and the ring-down
// when the pointer stops. The fields add their own attack/release on top (see
// easePoke) — this pair shapes the SOURCE, that pair shapes the wake.
export const BREEZE_ATTACK = 0.06;
export const BREEZE_DECAY = 0.35;

// How far the stir reaches. Grass is a close whisper; a tree's canopy is
// bigger than a tuft, so its circle is wider even though its motion is smaller.
export const GRASS_POKE_RADIUS = 1.75;
export const TREE_BREEZE_RADIUS = 2.5;

// The fields' uniform easing (easePoke): fast attack so the swipe is felt at
// once, slow release so a pass leaves a settling wake behind the pointer.
export const POKE_ATTACK = 0.1;
export const POKE_RELEASE = 0.6;

// ---- the shared state ------------------------------------------------------
const state = { x: 0, z: 0, strength: 0 };
let hasPrev = false;
let prevX = 0;
let prevZ = 0;

// One call per tick from main.js with the pointer's ground-plane point. Speed
// comes from successive points; the first point after a clear only anchors, so
// a pointer re-entering the canvas far from where it left never reads as a
// teleport-speed gust.
export function setBreezePointer(x, z, dt) {
  if (!(dt > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return;
  if (hasPrev) {
    const speed = Math.hypot(x - prevX, z - prevZ) / dt;
    const target = Math.min(1, Math.max(0, (speed - BREEZE_MIN_SPEED) / (BREEZE_MAX_SPEED - BREEZE_MIN_SPEED)));
    const tau = target > state.strength ? BREEZE_ATTACK : BREEZE_DECAY;
    state.strength += (target - state.strength) * Math.min(1, dt / tau);
    if (state.strength < 1e-4 && target === 0) state.strength = 0;   // settle exactly
  }
  hasPrev = true;
  prevX = x; prevZ = z;
  state.x = x; state.z = z;
}

// The pointer left the canvas (or the app is somewhere no breeze belongs: the
// menu, the intro, sitting, the free cam). Strength snaps to zero — consumers
// carry their own release easing, so the wake still settles rather than pops.
export function clearBreeze() {
  hasPrev = false;
  state.strength = 0;
}

// Read-only view for consumers; the object is shared, so no per-frame garbage.
export function breezeState() { return state; }

// ---- pure helpers (Node-testable, mirrored in the field shaders) -----------
// Smoothstep falloff: 1 at the point, 0 at (and beyond) the radius. The GLSL
// in grassfield/tuftfield computes the identical curve per blade.
export function breezeFalloff(dist, radius) {
  if (!(radius > 0)) return 0;
  const t = 1 - dist / radius;
  if (t <= 0) return 0;
  const c = t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// The fields' uniform easing toward the breeze strength — fast up, slow down.
export function easePoke(cur, target, dt) {
  const tau = target > cur ? POKE_ATTACK : POKE_RELEASE;
  return cur + (target - cur) * Math.min(1, dt / tau);
}

// One step of a tree's damped canopy spring (semi-implicit Euler, so it is
// stable at STEP and never gains energy). `s` is { pos, vel } in radians;
// `impulse` is this step's velocity kick. Defaults ring at about 1 Hz and die
// to ~5% in ~1.5 s — a nudge, not a storm.
export function treeSpringStep(s, impulse, dt, { stiffness = 40, damping = 4 } = {}) {
  s.vel += impulse;
  s.vel += (-stiffness * s.pos - damping * s.vel) * dt;
  s.pos += s.vel * dt;
  return s;
}
