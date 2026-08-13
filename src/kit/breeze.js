// The pointer's breeze, v2: DRAGGING the mouse (or a touch) across the diorama
// brushes the grass ALONG the stroke — the pointer's ground-velocity vector,
// not a radial bubble around a point, is what the blades answer. This module is
// the SHARED STATE plus the pure math, split from the consumers in the
// testable-state pattern: main.js feeds it one ground-plane point per tick, the
// grass fields read back a smoothed drag vector (strength + direction) and run
// it through their own damped spring, so a stroke bends the field and a release
// swings it back past rest once before it settles.
//
// Deterministic by construction: everything derives ONLY from the fed points
// and dt — no Math.random, no wall clock — so the same pointer path over the
// same steps always stirs the same blades the same way. A scene whose pointer
// never moves is bit-identical to one built before this file existed.
//
// The trees deliberately sit this one out — grass is the whole instrument now.

// ---- tuning ----------------------------------------------------------------
// Pointer speed (world units/second on the ground plane) that maps to full
// strength. The case camera puts roughly 12 world units across the stage, so a
// half-screen swipe in half a second is a full-strength gust.
export const BREEZE_MAX_SPEED = 10;
// Dead zone: the jitter of a resting hand is not a breeze. A stationary
// pointer does NOTHING — hovering never stirs a blade.
export const BREEZE_MIN_SPEED = 0.35;
// Strength easing, seconds to ~63%: quick to answer a swipe, and the ring-down
// when the pointer stops. The fields add their own spring on top (see
// pokeSpringStep) — this pair shapes the SOURCE, the spring shapes the wake.
export const BREEZE_ATTACK = 0.06;
export const BREEZE_DECAY = 0.35;
// Direction easing, seconds to ~63%: the drag direction follows a curving
// stroke closely but never jitters frame to frame. Faster than the strength
// decay on purpose — a reversal should read at once.
export const BREEZE_DIR_TAU = 0.07;

// How far the stir reaches around the pointer. Locality is still a circle —
// only the PUSH inside it is directional now.
export const GRASS_POKE_RADIUS = 1.75;

// The fields' response spring (pokeSpringStep): a 2D damped spring seeking the
// drag vector. Underdamped on purpose — on release the grass visibly swings
// back PAST rest once (overshoot ≈ exp(-πζ/√(1-ζ²)) ≈ 16% of the held bend at
// ζ = 0.5) before settling, instead of a one-way ease-out. 1.6 Hz puts the
// swing-back about a third of a second after the hand lifts: bend with the
// stroke, spring back soft, settle.
export const POKE_SPRING_FREQ = 1.6;   // natural frequency, Hz
export const POKE_SPRING_ZETA = 0.5;   // damping ratio — underdamped, one soft overshoot

// ---- the shared state ------------------------------------------------------
// x, z    — the poke point (world, ground plane): where the falloff circle sits.
// strength — 0..1 smoothed swipe speed.
// dirX/dirZ — smoothed UNIT drag direction (world XZ). Derived from a smoothed
//   VELOCITY vector, not by easing unit headings: easing a heading and
//   renormalising stalls on a dead reversal (the eased vector shrinks along
//   its own line and normalises straight back), while a velocity passes
//   through zero and comes out the other side. Held once the stroke fades, so
//   the wake settles along the stroke that made it.
const state = { x: 0, z: 0, strength: 0, dirX: 0, dirZ: 0 };
let hasPrev = false;
let prevX = 0;
let prevZ = 0;
let svX = 0;   // smoothed ground velocity (world units/s) — the direction's source
let svZ = 0;

// One call per tick from main.js with the pointer's ground-plane point. Speed
// comes from successive points; the first point after a clear only anchors, so
// a pointer re-entering the canvas far from where it left never reads as a
// teleport-speed gust.
export function setBreezePointer(x, z, dt) {
  if (!(dt > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return;
  if (hasPrev) {
    const dx = x - prevX, dz = z - prevZ;
    const dist = Math.hypot(dx, dz);
    const speed = dist / dt;
    const target = Math.min(1, Math.max(0, (speed - BREEZE_MIN_SPEED) / (BREEZE_MAX_SPEED - BREEZE_MIN_SPEED)));
    const tau = target > state.strength ? BREEZE_ATTACK : BREEZE_DECAY;
    state.strength += (target - state.strength) * Math.min(1, dt / tau);
    if (state.strength < 1e-4 && target === 0) state.strength = 0;   // settle exactly
    // Ease the smoothed velocity toward this step's (speed-clamped, so a
    // missed-frame jump cannot own the heading). Sub-threshold motion decays
    // it instead — a resting hand's jitter never steers.
    const k = Math.min(1, dt / BREEZE_DIR_TAU);
    if (speed > BREEZE_MIN_SPEED) {
      const m = Math.min(speed, BREEZE_MAX_SPEED) / dist;
      svX += (dx * m - svX) * k;
      svZ += (dz * m - svZ) * k;
    } else {
      svX -= svX * k;
      svZ -= svZ * k;
    }
    // The published direction only follows a velocity that is really there;
    // below the dead zone it HOLDS, so the wake settles on the last heading.
    const sm = Math.hypot(svX, svZ);
    if (sm > BREEZE_MIN_SPEED) { state.dirX = svX / sm; state.dirZ = svZ / sm; }
  }
  hasPrev = true;
  prevX = x; prevZ = z;
  state.x = x; state.z = z;
}

// The pointer left the canvas (or the app is somewhere no breeze belongs: the
// intro, sitting, the free cam). Everything snaps back to the fresh-module
// state — the fields' springs carry the release from their own held state, so
// the wake still swings back along the old stroke and settles rather than
// pops. Bit-identical to never having been poked, which is what keeps the
// determinism pin honest.
export function clearBreeze() {
  hasPrev = false;
  state.strength = 0;
  state.dirX = 0; state.dirZ = 0;
  svX = 0; svZ = 0;
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

// The fields' response spring. One per field, built once (no allocation in the
// update loop), integrated once per tick with the drag vector as its target:
//
//   pokeSpringStep(spring, strength * dirX, strength * dirZ, dt)
//
// Semi-implicit Euler, stable at STEP, never gains energy. The state (px, pz)
// IS what the uniforms read: uPokeAmt = |p|, uPokeDir = p/|p| — so when the
// spring overshoots through zero the direction uniform flips, and the field
// visibly swings back against the old stroke. Snaps to exact rest once the
// target is zero and the ring-down is below perception, so an unpoked field
// stays bit-identical frame to frame instead of ringing at 1e-9 forever.
export function makePokeSpring() { return { px: 0, pz: 0, vx: 0, vz: 0 }; }

export function pokeSpringStep(s, tx, tz, dt, { freq = POKE_SPRING_FREQ, zeta = POKE_SPRING_ZETA } = {}) {
  const w = 2 * Math.PI * freq;
  s.vx += (w * w * (tx - s.px) - 2 * zeta * w * s.vx) * dt;
  s.vz += (w * w * (tz - s.pz) - 2 * zeta * w * s.vz) * dt;
  s.px += s.vx * dt;
  s.pz += s.vz * dt;
  if (tx === 0 && tz === 0
    && Math.abs(s.px) < 1e-4 && Math.abs(s.pz) < 1e-4
    && Math.abs(s.vx) < 2e-3 && Math.abs(s.vz) < 2e-3) {
    s.px = 0; s.pz = 0; s.vx = 0; s.vz = 0;   // settle exactly
  }
  return s;
}

// Mirror of the fields' arc bend (the GLSL in grassfield.js): a blade curves
// with constant curvature k = theta/H over its arclength, so it bends from a
// PLANTED ROOT instead of shearing sideways. Kept here so tests can hold the
// bend to "an arc, not a shear" — the tip must travel farther than mid-blade.
export function arcOffset(theta, s, H) {
  const k = theta / H;
  if (Math.abs(k) < 1e-4) return 0;
  return (1 - Math.cos(k * s)) / k;
}

// UNUSED — kept for a future, gentler tree pass. One step of a damped canopy
// spring (semi-implicit Euler, stable at STEP). Nothing in the app calls this
// any more: the v2 review pulled the trees out of the breeze entirely ("just
// not have it affect the trees for now — we don't wanna go by the base of the
// tree"), so composeWorld no longer registers springs. The math stays because
// it is proven and pure; its tests in breeze.test.js are pure-math pins only.
export function treeSpringStep(s, impulse, dt, { stiffness = 40, damping = 4 } = {}) {
  s.vel += impulse;
  s.vel += (-stiffness * s.pos - damping * s.vel) * dt;
  s.pos += s.vel * dt;
  return s;
}
