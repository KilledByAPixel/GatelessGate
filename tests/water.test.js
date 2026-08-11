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
// The disc is cut from a uniform grid, so an INTERIOR vertex can land
// arbitrarily close to the circle — "radius ≈ R" no longer identifies a rim
// vertex, and such a vertex is legitimately allowed to move by a vanishing
// amount. The wall itself is exactly zero (asserted analytically below via
// heightAt); what the mesh has to guarantee is that nothing visible happens
// out there. 1e-9 world units is roughly a nanometre of pond.
test('a ripple at the very edge never lifts the rim — round', () => {
  const R = 3.2;
  const w = makeWater({ shape: 'round', size: R * 2, seed: 30 });
  w.ripple(R * 0.99, 0, 0.4);                 // as close to the wall as it gets
  const rim = [];
  for (let t = 0; t < 6; t += 0.1) {
    w.update(0.1, t);
    for (const v of verts(w)) {
      const r = Math.hypot(v.x, v.z);
      assert.ok(r <= R + 1e-6, 'a vertex left the circle');
      if (r > R - 1e-6) rim.push(Math.abs(v.y));
    }
  }
  assert.ok(rim.length > 0, 'there are rim vertices to check');
  assert.ok(Math.max(...rim) < 1e-9, `the rim moved by ${Math.max(...rim)}`);
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

// The blob (Frank, case 39: "less square-shaped, more organically shaped,
// kinda roundish"): a seeded wobbled outline. Its contract is the round
// surface's contract — honest bound, pinned rim — plus an outline that
// actually varies, or it would just be a circle with extra steps.
test('blob water stays inside its stated circle — the wobble only pulls inward', () => {
  const R = 6.25;
  const w = makeWater({ shape: 'blob', size: R * 2, seed: 39 });
  for (const v of verts(w)) {
    assert.ok(Math.hypot(v.x, v.z) <= R + 1e-6,
      `vertex at r=${Math.hypot(v.x, v.z)} escapes the stated radius ${R}`);
  }
});

test('a blob outline is organic: the shore radius genuinely varies with angle', () => {
  const R = 6.25;
  const w = makeWater({ shape: 'blob', size: R * 2, seed: 39 });
  // recover R(θ) through shoreDistance: at any probe point along θ, the wall
  // sits at probe distance + signed shore distance
  const radii = [];
  for (let a = 0; a < 48; a++) {
    const th = (a / 48) * Math.PI * 2;
    radii.push(1 + w.shoreDistance(Math.cos(th), Math.sin(th)));
  }
  const spread = Math.max(...radii) - Math.min(...radii);
  assert.ok(spread > 0.08 * R, `shore spread ${spread} — reads as a plain circle`);
  assert.ok(Math.min(...radii) > 0.5 * R, 'the wobble stays gentle — a pond, not a splat');
});

test('blob water is seeded: same seed same shore, different seed different shore', () => {
  const a = makeWater({ shape: 'blob', size: 12.5, seed: 39 });
  const b = makeWater({ shape: 'blob', size: 12.5, seed: 39 });
  const c = makeWater({ shape: 'blob', size: 12.5, seed: 40 });
  assert.deepEqual(Array.from(posOf(a)), Array.from(posOf(b)));
  assert.notDeepEqual(Array.from(posOf(a)), Array.from(posOf(c)));
});

test('a ripple at the very edge never lifts the rim — blob', () => {
  const w = makeWater({ shape: 'blob', size: 12.5, seed: 39 });
  w.ripple(6.0, 0, 0.4);                       // outside some lobes, near others
  const rim = [];
  for (let t = 0; t < 6; t += 0.1) {
    w.update(0.1, t);
    for (const v of verts(w)) {
      if (w.shoreDistance(v.x, v.z) < 1e-6) rim.push(Math.abs(v.y));
    }
  }
  assert.ok(rim.length > 0, 'there are rim vertices to check');
  assert.ok(Math.max(...rim) < 1e-9, `the rim moved by ${Math.max(...rim)}`);
});

test('a tap outside a blob is pulled inside it, and heightAt is zero past the shore', () => {
  const w = makeWater({ shape: 'blob', size: 12.5, seed: 39 });
  const s = w.ripple(20, -14);
  assert.ok(w.shoreDistance(s.x, s.z) >= -1e-9, 'the ripple origin was clamped to the shore');
  w.update(0.5, 0.5);
  assert.equal(w.heightAt(8.8, 0), 0, 'past the shore nothing moves');
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

// ---- the drift swell (case 20's ocean) -------------------------------------
// A slow long wave traveling shoreward. It is the FREE-OCEAN term: deliberately
// unmasked, because an ocean has no rim to protect — its near edge is buried
// under the sand and its far edges die in the fog. Containers leave it off,
// and off is the default, so every basin and pond in the book is untouched.

const DRIFT = { dx: 0, dz: 1, amp: 0.05, wavelength: 8, period: 6 };

test('drift off by default: a swell-less sheet stays perfectly flat', () => {
  const w = makeWater({ shape: 'square', size: 20, swell: 0 });
  w.update(1 / 60, 5.2);
  for (const v of verts(w)) assert.equal(v.y, 0);
});

test('the drift travels: the whole waveform moves toward (dx, dz) at wavelength/period', () => {
  const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift: DRIFT });
  const c = DRIFT.wavelength / DRIFT.period;     // phase speed, units/sec
  const dt = 0.7;
  for (const z of [-12, -4, 0, 3, 9]) {
    const now = w.heightAt(1, z, 2.0);
    const later = w.heightAt(1, z + c * dt, 2.0 + dt);
    assert.ok(Math.abs(now - later) < 1e-9,
      `the crest at z=${z} did not arrive ${c * dt} further on ${dt}s later`);
  }
});

test('the drift actually lifts the surface, and by no more than its amplitude', () => {
  const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift: DRIFT });
  let peak = 0;
  for (let t = 0; t < 6.5; t += 0.25) {
    w.update(0.25, t);
    for (const v of verts(w)) peak = Math.max(peak, Math.abs(v.y));
  }
  assert.ok(peak > DRIFT.amp * 0.9, `peak ${peak} — the ocean is flat`);
  assert.ok(peak <= DRIFT.amp + 1e-9, `peak ${peak} exceeds the stated amplitude`);
});

test('the drift is seeded and deterministic', () => {
  const surface = (seed) => {
    const w = makeWater({ shape: 'square', size: 40, swell: 0, seed, drift: DRIFT });
    w.update(0.5, 1.7);
    return Array.from(posOf(w));
  };
  assert.deepEqual(surface(20), surface(20));
  assert.notDeepEqual(surface(20), surface(21));  // the phase is the seed's
});

test('ripples still ride on top of the drift, and the rim pinning still holds for them', () => {
  const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift: DRIFT });
  w.ripple(0, 0, 0.3);
  w.update(0.5, 0.5);
  // somewhere inside, the surface is displaced by MORE than drift alone could
  let moved = false;
  for (let r = 0; r < 6; r += 0.25) {
    if (Math.abs(w.heightAt(r, 0, 0.5)) > DRIFT.amp + 1e-6) moved = true;
  }
  assert.ok(moved, 'the strike vanished under the drift');
});

// A real sea is never one sine (Frank: "the waves are mostly horizontal...
// they don't look like normal waves") — drift accepts an array of crossing
// components. The contract: an object and a one-element array are the SAME
// surface, and a multi-component sea stays inside the sum of its amplitudes.
test('drift: an object and a one-element array produce the identical surface', () => {
  const surface = (drift) => {
    const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift });
    w.update(0.5, 1.7);
    return Array.from(posOf(w));
  };
  assert.deepEqual(surface(DRIFT), surface([DRIFT]));
});

test('crossing drift components: bounded by the sum of amplitudes, and genuinely crossed', () => {
  const CROSS = [
    DRIFT,
    { dx: 0.2764, dz: 0.9611, amp: 0.02, wavelength: 5.2, period: 4.6 },
  ];
  const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift: CROSS });
  let peak = 0;
  for (let t = 0; t < 7; t += 0.25) {
    w.update(0.25, t);
    for (const v of verts(w)) peak = Math.max(peak, Math.abs(v.y));
  }
  assert.ok(peak <= DRIFT.amp + 0.02 + 1e-9, `peak ${peak} exceeds the summed amplitude`);
  // crossed means NOT constant along x the way a single shoreward sine is:
  // two points at the same z must disagree somewhere in time
  let varies = false;
  for (let t = 0; t < 7; t += 0.5) {
    if (Math.abs(w.heightAt(-8, 3, t) - w.heightAt(8, 3, t)) > 1e-4) varies = true;
  }
  assert.ok(varies, 'the crests are still parallel bars');
});

// ---- the shallow-to-deep ramp (case 20's ocean) ----------------------------
// Per-vertex opacity from a build-time callback: an ocean is nearly clear
// over the sand and deepens seaward. Off by default, so every pond and basin
// keeps its single uniform opacity.

test('alphaRamp off: no color attribute, no vertexColors — everything as it was', () => {
  const w = makeWater({ shape: 'square', size: 20 });
  assert.equal(surfaceOf(w).geometry.attributes.color, undefined);
  assert.ok(!surfaceOf(w).material.vertexColors);
});

test('alphaRamp on: RGBA vertex alpha follows the callback, clamped to 0..1', () => {
  const w = makeWater({
    shape: 'square', size: 20, swell: 0,
    alphaRamp: (x, z) => z / 10,               // -1..1 across the sheet: clamps both ways
  });
  const surface = surfaceOf(w);
  const color = surface.geometry.attributes.color;
  const pos = surface.geometry.attributes.position;
  assert.ok(surface.material.vertexColors);
  assert.equal(color.itemSize, 4);
  for (let i = 0; i < color.count; i++) {
    const want = Math.max(0, Math.min(1, pos.getZ(i) / 10));
    assert.ok(Math.abs(color.getW(i) - want) < 1e-6, `alpha at z=${pos.getZ(i)}`);
    assert.equal(color.getX(i), 1, 'RGB stays white so the diffuse is untouched');
  }
});

test('water never joins the shadow map: the surface is flagged noShadow', () => {
  // the ocean-sized sheet outruns the sun's shadow camera; the far-plane cut
  // painted a phantom triangle of shadow on the open sea (case 20, Frank)
  const w = makeWater({ shape: 'square', size: 90 });
  assert.equal(surfaceOf(w).userData.noShadow, true);
});

// ---- swellAt (the koi's sampler) -------------------------------------------
// Frank: a tap above the school must not toss the fish. swellAt is the surface
// MINUS the ripple term — idle swell and drift only, still edge-masked — so a
// koi rides the living water but ignores the reader's finger.

test('swellAt and heightAt agree on untapped water, and the wall stays pinned', () => {
  const w = makeWater({ shape: 'round', size: 4, seed: 30 });
  for (const [x, z] of [[0, 0], [0.5, -1], [1.7, 0.3], [-1.2, -0.9]]) {
    assert.equal(w.swellAt(x, z, 2.2), w.heightAt(x, z, 2.2));
  }
  assert.equal(w.swellAt(2, 0, 1.3), 0, 'the swell is masked to zero at the wall');
});

test('swellAt: a tap moves heightAt but never the swell', () => {
  const w = makeWater({ shape: 'round', size: 4, seed: 30 });
  const probe = [];
  for (let r = 0; r < 1.9; r += 0.1) probe.push(w.swellAt(r, 0, 1.0));
  w.ripple(0, 0, 0.3);
  w.update(1.0, 1.0);
  const after = [];
  for (let r = 0; r < 1.9; r += 0.1) after.push(w.swellAt(r, 0, 1.0));
  assert.deepEqual(after, probe, 'the tap leaked into swellAt');
  // while the full surface genuinely moved somewhere along the same ray
  let moved = false;
  for (let r = 0; r < 1.9; r += 0.1) {
    if (Math.abs(w.heightAt(r, 0, 1.0) - w.swellAt(r, 0, 1.0)) > 1e-4) moved = true;
  }
  assert.ok(moved, 'the tap did not register on heightAt either');
});

test('swellAt carries the ocean drift', () => {
  const w = makeWater({ shape: 'square', size: 40, swell: 0, seed: 20, drift: DRIFT });
  assert.equal(w.swellAt(1, 3, 2.0), w.heightAt(1, 3, 2.0));
  let lifted = false;
  for (let t = 0; t < 6.5; t += 0.25) if (Math.abs(w.swellAt(1, 3, t)) > 0.01) lifted = true;
  assert.ok(lifted, 'the drift vanished from swellAt');
});

// ---- the bounce ------------------------------------------------------------
// Ripples reflect off the container wall: the travelled distance is folded
// (triangle-wave) against the per-direction wall distance, so the ring runs
// out, comes back in, refocuses, and runs out again, losing amplitude per
// round trip (BOUNCE). Time thresholds below assume SPEED ~= 2.35 — they are
// deliberately loose so a retune survives them.

test('a ripple comes back: the pond is alive again after the ring has crossed it', () => {
  const R = 2.0;
  const w = makeWater({ shape: 'round', size: R * 2, swell: 0, seed: 7 });
  w.ripple(0, 0, 0.3);
  // At SPEED 2.35 the outgoing ring is fully off a 2-unit pond by t ~= 1.4s;
  // under the old (no-bounce) math every later sample was flat to ~3e-5.
  for (const t of [2.0, 3.5]) {
    let peak = 0;
    for (let r = 0; r < R; r += 0.05) peak = Math.max(peak, Math.abs(w.heightAt(r, 0, t)));
    assert.ok(peak > 1e-3, `at t=${t} the pond is dead flat (peak ${peak}) — nothing bounced`);
  }
});

test('each pass is weaker than the last: TAU and BOUNCE both bite', () => {
  const R = 2.0;
  const w = makeWater({ shape: 'round', size: R * 2, swell: 0, seed: 7 });
  w.ripple(0, 0, 0.3);
  // A centre tap's crest visits r=1 once per pass, roughly once per second at
  // SPEED 2.35 (fold period 2R/SPEED ~= 1.7s, crest at r=1 every half period).
  const peakIn = (t0, t1) => {
    let m = 0;
    for (let t = t0; t < t1; t += 0.02) m = Math.max(m, Math.abs(w.heightAt(1.0, 0, t)));
    return m;
  };
  const p1 = peakIn(0, 1);
  const p2 = peakIn(1, 2);
  const p3 = peakIn(2, 3);
  assert.ok(p1 > p2 && p2 > p3,
    `passes must decay: ${p1} -> ${p2} -> ${p3}`);
  assert.ok(p2 > 1e-3, 'the second pass should still be visible, not annihilated');
});

test('the bounce respects the wall: rim pinning holds through many passes', () => {
  const R = 2.0;
  const w = makeWater({ shape: 'round', size: R * 2, swell: 0, seed: 7 });
  w.ripple(0.9, 0.4, 0.3);                     // off-centre, so folds differ per direction
  for (let t = 0; t < 9; t += 0.15) {
    assert.equal(w.heightAt(R, 0, t), 0);
    assert.equal(w.heightAt(0, -R, t), 0);
  }
});

test('default density resolves the ripple wavelength', () => {
  // Crest-to-crest is 0.62 (WAVELEN); a cell must be at most half that or the
  // rings alias into polygons — the old cap of 30 put case 39's 12.5-unit
  // lake at 1.5 vertices per wavelength. Bounces make it worse: standing
  // patterns live near the wall, where a coarse grid chews them visibly.
  for (const size of [0.86, 2.0, 6.4, 12.5]) {
    const w = makeWater({ shape: 'square', size });
    const pos = posOf(w);
    const cell = Math.abs(pos[3] - pos[0]);    // first two vertices are one cell apart in x
    assert.ok(cell <= 0.31 + 1e-9, `size ${size}: cell ${cell} undersamples a 0.62 crest`);
  }
});
