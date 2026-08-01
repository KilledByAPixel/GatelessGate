import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setBreezePointer, clearBreeze, breezeState,
  breezeFalloff, makePokeSpring, pokeSpringStep, arcOffset, treeSpringStep,
  BREEZE_MIN_SPEED, GRASS_POKE_RADIUS,
  POKE_SPRING_FREQ, POKE_SPRING_ZETA,
} from '../src/kit/breeze.js';

const DT = 1 / 60;

// The breeze is shared module state on purpose (one pointer, many consumers),
// so every test starts from a clean slate.
function reset() { clearBreeze(); }

// drive a straight sweep: n steps of `speed` world units/sec along (ux, uz)
function sweep(n, speed, ux = 1, uz = 0, x0 = 0, z0 = 0) {
  let x = x0, z = z0;
  for (let i = 0; i < n; i++) {
    x += ux * speed * DT; z += uz * speed * DT;
    setBreezePointer(x, z, DT);
  }
  return { x, z };
}

test('falloff: max at the centre, zero at and beyond the radius', () => {
  assert.equal(breezeFalloff(0, 2), 1);
  assert.equal(breezeFalloff(2, 2), 0);
  assert.equal(breezeFalloff(5, 2), 0, 'nothing outside the circle');
  assert.equal(breezeFalloff(1, 0), 0, 'degenerate radius is a no-op, not NaN');
  // monotone: closer is always at least as stirred
  let prev = 1;
  for (let d = 0; d <= 2.2; d += 0.1) {
    const f = breezeFalloff(d, 2);
    assert.ok(f <= prev + 1e-12, `falloff never rises with distance (d=${d.toFixed(1)})`);
    assert.ok(f >= 0 && f <= 1, 'stays in [0, 1]');
    prev = f;
  }
  assert.ok(GRASS_POKE_RADIUS > 0, 'the stir has reach');
});

test('speed clamps: an absurd sweep never exceeds full strength', () => {
  reset();
  sweep(120, 500);   // 500 u/s — a pointer teleporting every frame
  const s = breezeState();
  assert.ok(s.strength <= 1, `clamped: ${s.strength}`);
  assert.ok(s.strength > 0.95, `and pinned near full: ${s.strength}`);
  reset();
});

test('a resting hand is not a breeze (dead zone)', () => {
  reset();
  sweep(120, BREEZE_MIN_SPEED * 0.5);
  assert.equal(breezeState().strength, 0, 'sub-threshold motion stays at zero');
  reset();
});

test('the first point after a clear never reads as a gust', () => {
  reset();
  setBreezePointer(0, 0, DT);
  clearBreeze();
  // pointer re-enters the canvas 15 units away — a teleport, not a swipe
  setBreezePointer(15, 0, DT);
  assert.equal(breezeState().strength, 0, 're-entry anchors, it does not spike');
  reset();
});

test('a sweep raises strength fast; stopping decays it to exactly zero', () => {
  reset();
  sweep(30, 8);                       // half a second of brisk sweeping
  const peak = breezeState().strength;
  assert.ok(peak > 0.5, `a real swipe is clearly felt: ${peak}`);
  // now hold still: same point fed every tick
  const { x, z } = breezeState();
  let firstDrop = null;
  for (let i = 0; i < 600; i++) {
    setBreezePointer(x, z, DT);
    if (firstDrop === null) firstDrop = breezeState().strength;
  }
  assert.ok(firstDrop < peak, 'decay starts the very next tick');
  assert.equal(breezeState().strength, 0, 'and settles EXACTLY at zero, not 1e-9 forever');
  reset();
});

// ---- v2: the drag DIRECTION ------------------------------------------------
test('the drag vector points the way the pointer moved', () => {
  reset();
  sweep(30, 8, 1, 0);
  let s = breezeState();
  assert.ok(s.dirX > 0.99 && Math.abs(s.dirZ) < 0.01,
    `a left-to-right sweep reads +x: (${s.dirX.toFixed(3)}, ${s.dirZ.toFixed(3)})`);
  assert.ok(Math.abs(Math.hypot(s.dirX, s.dirZ) - 1) < 1e-9, 'direction is a unit vector');

  reset();
  sweep(30, 8, 0, -1);
  s = breezeState();
  assert.ok(s.dirZ < -0.99 && Math.abs(s.dirX) < 0.01,
    `a top-to-bottom sweep reads -z: (${s.dirX.toFixed(3)}, ${s.dirZ.toFixed(3)})`);
  reset();
});

test('a curving stroke turns the direction smoothly, and a stop holds it', () => {
  reset();
  sweep(30, 8, 1, 0);
  const before = { ...breezeState() };
  // one step of a perpendicular move must TURN the direction, not snap it
  setBreezePointer(before.x, before.z + 8 * DT, DT);
  const mid = breezeState();
  assert.ok(mid.dirZ > 0.05, `the turn is felt: dirZ ${mid.dirZ.toFixed(3)}`);
  assert.ok(mid.dirX > 0.5, `but the old heading is not thrown away: dirX ${mid.dirX.toFixed(3)}`);
  // now hold still: strength decays but the LAST stroke's heading is kept, so
  // the wake settles along the stroke that made it
  const { x, z } = breezeState();
  for (let i = 0; i < 300; i++) setBreezePointer(x, z, DT);
  const after = breezeState();
  assert.equal(after.strength, 0);
  // the smoothed velocity decays uniformly, so the heading it publishes can
  // only wiggle at floating-point scale before it freezes below the dead zone
  assert.ok(Math.abs(after.dirX - mid.dirX) < 1e-9, 'heading held through the ring-down');
  assert.ok(Math.abs(after.dirZ - mid.dirZ) < 1e-9);
  reset();
});

test('a hard reversal flips the direction without normalising junk', () => {
  reset();
  sweep(30, 8, 1, 0);
  sweep(30, 8, -1, 0, breezeState().x, breezeState().z);
  const s = breezeState();
  assert.ok(s.dirX < -0.99, `the reversal lands: dirX ${s.dirX.toFixed(3)}`);
  assert.ok(Number.isFinite(s.dirX) && Number.isFinite(s.dirZ), 'no NaN through the flip');
  reset();
});

test('the breeze is deterministic: same points, same dt, same state', () => {
  const run = () => {
    reset();
    const out = [];
    let x = 0;
    for (let i = 0; i < 90; i++) {
      x += (i < 45 ? 6 : 0.1) * DT;
      setBreezePointer(x, Math.sin(i * 0.2), DT);
      const s = breezeState();
      out.push(s.strength, s.dirX, s.dirZ);
    }
    reset();
    return out;
  };
  assert.deepEqual(run(), run());
});

// ---- v2: the response spring ------------------------------------------------
test('poke spring: seeks a held drag vector, near-settled inside a second', () => {
  const s = makePokeSpring();
  for (let i = 0; i < 60; i++) pokeSpringStep(s, 0.8, 0, DT);
  assert.ok(Math.abs(s.px - 0.8) < 0.05, `holds the stroke's bend: ${s.px.toFixed(3)}`);
  assert.ok(Math.abs(s.pz) < 1e-9, 'a straight +x stroke bends nothing sideways');
});

test('poke spring: release swings back PAST rest once, then settles exactly', () => {
  const s = makePokeSpring();
  for (let i = 0; i < 90; i++) pokeSpringStep(s, 0.8, 0, DT);   // settle on the stroke
  const held = s.px;
  // hand lifts: target zero. Track the component along the old drag direction.
  const series = [];
  for (let i = 0; i < 240; i++) { pokeSpringStep(s, 0, 0, DT); series.push(s.px); }
  const min = Math.min(...series);
  assert.ok(min < -held * 0.05, `visibly overshoots past rest: min ${min.toFixed(4)} of held ${held.toFixed(3)}`);
  assert.ok(min > -held * 0.4, `a soft swing-back, not a rebound: min ${min.toFixed(4)}`);
  // ζ = 0.5 predicts exp(-πζ/√(1-ζ²)) ≈ 16% — pin the neighbourhood so a
  // damping retune is a deliberate act, not drift
  assert.ok(Math.abs(-min / held - 0.163) < 0.06,
    `overshoot near the ζ=${POKE_SPRING_ZETA} prediction: ${(-min / held).toFixed(3)}`);
  // the zero-crossing lands about a quarter damped period after release
  const crossAt = series.findIndex((v) => v < 0) * DT;
  assert.ok(crossAt > 0.05 && crossAt < 0.5,
    `swing-back arrives fast but visibly (${POKE_SPRING_FREQ} Hz): ${crossAt.toFixed(3)}s`);
  for (let i = 0; i < 600; i++) pokeSpringStep(s, 0, 0, DT);
  assert.equal(s.px, 0, 'settles EXACTLY at zero');
  assert.equal(s.vx, 0, 'velocity dies with it');
});

test('poke spring: at rest with no drive it stays bit-still, and is deterministic', () => {
  const s = makePokeSpring();
  for (let i = 0; i < 240; i++) pokeSpringStep(s, 0, 0, DT);
  assert.deepEqual(s, { px: 0, pz: 0, vx: 0, vz: 0 }, 'an unpoked spring never drifts');
  const run = () => {
    const q = makePokeSpring();
    const trace = [];
    for (let i = 0; i < 300; i++) {
      pokeSpringStep(q, i < 60 ? 0.7 : 0, i < 60 ? -0.2 : 0, DT);
      trace.push(q.px, q.pz);
      assert.ok(Number.isFinite(q.px) && Math.abs(q.px) < 2, 'never blows up at STEP');
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});

// ---- the arc (mirrors the GLSL bend) ----------------------------------------
test('the bend is an arc from a planted root: tips travel more than mid-blade', () => {
  const H = 0.34;
  for (const theta of [0.1, 0.3, 0.6]) {
    const tip = arcOffset(theta, H, H);
    const mid = arcOffset(theta, H / 2, H);
    assert.ok(tip > mid * 2, `theta=${theta}: tip ${tip.toFixed(4)} vs mid ${mid.toFixed(4)}`);
  }
  assert.equal(arcOffset(0, H, H), 0, 'no bend, no offset');
  // length-preserving in spirit: the offset never exceeds the arclength
  assert.ok(arcOffset(0.6, H, H) < H, 'curves, does not stretch');
});

// ---- treeSpringStep: pure math only. NOTHING in the app calls this any more —
// the v2 review removed the tree response (scenery.js) — but the helper is kept
// for a future canopy-only pass, so its math stays pinned.
test('tree spring (kept, uncalled): an impulse kicks it, damping brings it to rest', () => {
  const s = { pos: 0, vel: 0 };
  treeSpringStep(s, 0.05, DT);
  assert.ok(s.vel > 0, 'the kick lands in velocity');
  assert.ok(Math.abs(s.pos) < 0.01, 'position answers over time, not instantly');
  let maxPos = 0;
  for (let i = 0; i < 60; i++) { treeSpringStep(s, 0, DT); maxPos = Math.max(maxPos, Math.abs(s.pos)); }
  assert.ok(maxPos > 0.001 && maxPos < 0.2, `a nudge, not a storm: ${maxPos.toFixed(4)}`);
  const at1s = Math.abs(s.pos);
  for (let i = 0; i < 120; i++) treeSpringStep(s, 0, DT);
  assert.ok(Math.abs(s.pos) < Math.max(1e-4, at1s * 0.2), `dies out: ${s.pos}`);
});

test('tree spring (kept, uncalled): stable at STEP and deterministic', () => {
  const run = () => {
    const s = { pos: 0, vel: 0 };
    const trace = [];
    for (let i = 0; i < 300; i++) {
      treeSpringStep(s, i < 30 ? 0.03 : 0, DT, { stiffness: 40 * 1.1 });
      trace.push(s.pos);
      assert.ok(Number.isFinite(s.pos) && Math.abs(s.pos) < 1, 'never blows up');
    }
    return trace;
  };
  assert.deepEqual(run(), run());
});
