import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWater } from '../src/kit/water.js';

const surfaceOf = (w) => w.group.children.find((c) => c.name === 'surface');
const posOf = (w) => surfaceOf(w).geometry.attributes.position.array;

// Walk a surface's vertices as {x, y, z}.
function verts(w) {
  const a = posOf(w);
  const out = [];
  for (let i = 0; i < a.length; i += 3) out.push({ x: a[i], y: a[i + 1], z: a[i + 2] });
  return out;
}

test('one draw call: the surface is a single mesh, not a plane plus a pool of rings', () => {
  const w = makeWater({ shape: 'round', size: 4 });
  const meshes = w.group.children.filter((c) => c.isMesh);
  assert.equal(meshes.length, 1);
  assert.equal(meshes[0].name, 'surface');
});

test('round water stays inside its circle', () => {
  const R = 3.2;
  const w = makeWater({ shape: 'round', size: R * 2, seed: 30 });
  const vs = verts(w);
  for (const v of vs) {
    assert.ok(Math.hypot(v.x, v.z) <= R + 1e-6,
      `vertex at r=${Math.hypot(v.x, v.z)} escapes radius ${R}`);
  }
  // and it actually reaches the rim rather than stopping short of it
  const maxR = Math.max(...vs.map((v) => Math.hypot(v.x, v.z)));
  assert.ok(Math.abs(maxR - R) < 1e-6, `outermost ring sits at ${maxR}, not ${R}`);
});

test('square water stays inside its box', () => {
  const S = 11.0;
  const w = makeWater({ shape: 'square', size: S });
  for (const v of verts(w)) {
    assert.ok(Math.abs(v.x) <= S / 2 + 1e-6 && Math.abs(v.z) <= S / 2 + 1e-6);
  }
});

// THE BUG (Frank, case 39): a ripple started near the bank used to keep growing
// out over the grass. The rim is pinned now, so no edge vertex can ever leave
// its rest height however hard the water is hit right beside it.
test('a ripple at the very edge never lifts the rim — round', () => {
  const R = 3.2;
  const w = makeWater({ shape: 'round', size: R * 2, seed: 30 });
  w.ripple(R * 0.99, 0, 0.4);                 // as close to the wall as it gets
  const rim = [];
  for (let t = 0; t < 6; t += 0.1) {
    w.update(0.1, t);
    for (const v of verts(w)) {
      if (Math.hypot(v.x, v.z) > R - 1e-6) rim.push(Math.abs(v.y));
    }
  }
  assert.ok(rim.length > 0, 'there are rim vertices to check');
  assert.equal(Math.max(...rim), 0, 'a rim vertex moved');
});

test('a ripple at the very edge never lifts the rim — square', () => {
  const S = 11.0;
  const half = S / 2;
  const w = makeWater({ shape: 'square', size: S, seed: 39 });
  w.ripple(half * 0.99, half * 0.99, 0.4);
  const rim = [];
  for (let t = 0; t < 8; t += 0.2) {
    w.update(0.2, t);
    for (const v of verts(w)) {
      if (Math.abs(Math.abs(v.x) - half) < 1e-6 || Math.abs(Math.abs(v.z) - half) < 1e-6) {
        rim.push(Math.abs(v.y));
      }
    }
  }
  assert.ok(rim.length > 0);
  assert.equal(Math.max(...rim), 0);
});

test('heightAt is zero on the wall and non-zero inside after a strike', () => {
  const R = 2.0;
  const w = makeWater({ shape: 'round', size: R * 2, seed: 7 });
  w.ripple(0, 0, 0.3);
  w.update(0.5, 0.5);
  assert.equal(w.heightAt(R, 0), 0, 'the wall does not move');
  assert.equal(w.heightAt(0, R), 0);
  // somewhere along the travelling front the surface is genuinely displaced
  let moved = false;
  for (let r = 0; r < R; r += 0.05) if (Math.abs(w.heightAt(r, 0)) > 1e-4) moved = true;
  assert.ok(moved, 'the strike displaced the surface somewhere');
});

test('a tap outside the water is pulled to the nearest point inside it', () => {
  const R = 2.0;
  const w = makeWater({ shape: 'round', size: R * 2 });
  const s = w.ripple(10, 0);                  // far outside
  assert.ok(Math.hypot(s.x, s.z) <= R + 1e-9, 'the ripple origin was clamped inside');

  const sq = makeWater({ shape: 'square', size: 4 });
  const s2 = sq.ripple(99, -99);
  assert.ok(Math.abs(s2.x) <= 2 + 1e-9 && Math.abs(s2.z) <= 2 + 1e-9);
});

test('ripples die: the count returns to zero on its own', () => {
  const w = makeWater({ shape: 'square', size: 6, seed: 39 });
  w.update(0, 0);
  assert.equal(w.rippleCount(), 0);
  w.ripple(0, 0);
  w.update(0.1, 0.1);
  assert.equal(w.rippleCount(), 1);
  w.update(0.1, 30);                          // long past any ripple's life
  assert.equal(w.rippleCount(), 0);
});

test('deterministic: the same taps at the same times give the same surface', () => {
  const run = () => {
    const w = makeWater({ shape: 'round', size: 6.4, seed: 30 });
    w.ripple(1.0, -0.5);
    w.update(0.3, 0.3);
    w.ripple(-0.8, 1.2);
    w.update(0.4, 0.7);
    return Array.from(posOf(w));
  };
  assert.deepEqual(run(), run());
});

test('every vertex stays finite through a long, heavily struck run', () => {
  const w = makeWater({ shape: 'round', size: 6.4, seed: 30 });
  for (let i = 0; i < 240; i++) {
    if (i % 7 === 0) w.ripple(Math.cos(i) * 2.4, Math.sin(i) * 2.4, 0.3);
    w.update(1 / 60, i / 60);
  }
  for (const v of verts(w)) assert.ok(Number.isFinite(v.y), 'a vertex went non-finite');
});

test('still water is still: swell 0 leaves the surface flat between taps', () => {
  const w = makeWater({ shape: 'square', size: 4, swell: 0 });
  w.update(1 / 60, 3.3);
  for (const v of verts(w)) assert.equal(v.y, 0);
});

// A fixed crest height was wrong at both ends of the range the book uses: case
// 7's basin is 0.86 across and case 39's water is 11. The strike scales with
// the container, then stops.
test('strike size follows the container, and is capped', () => {
  const peak = (size, shape) => {
    const w = makeWater({ shape, size, swell: 0 });
    w.ripple(0, 0);
    let m = 0;
    for (let t = 0; t < 4; t += 0.05) {
      w.update(0.05, t);
      for (const v of verts(w)) m = Math.max(m, Math.abs(v.y));
    }
    return m;
  };
  const basin = peak(0.86, 'round');
  const pond = peak(6.4, 'round');
  const lake = peak(11.0, 'square');
  assert.ok(basin < pond, 'a basin ripples more gently than a pond');
  assert.ok(basin < 0.03, `a basin crest of ${basin} would slosh over the rim`);
  assert.ok(pond > 0.02, 'a pond ripple is actually visible');
  assert.ok(lake <= 0.11, 'the crest is capped rather than growing without limit');
});
