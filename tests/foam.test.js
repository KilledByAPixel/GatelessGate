import test from 'node:test';
import assert from 'node:assert/strict';
import { foamCycle } from '../src/kit/foam.js';

// The wave-end's whole life is this closed form: sweep in, ease out at full
// reach, fade while receding a little. No state, no integration — the same t
// always gives the same foam, per the book's determinism rule.

test('foamCycle is periodic and phase-shifted', () => {
  const opts = { period: 6, phase: 0.3, run: 1.8 };
  for (const t of [0.7, 2.2, 4.9]) {
    const a = foamCycle(t, opts);
    const b = foamCycle(t + 6, opts);
    assert.ok(Math.abs(a.advance - b.advance) < 1e-9);
    assert.ok(Math.abs(a.opacity - b.opacity) < 1e-9);
  }
  // a phase shift of 0.5 cycles is a time shift of half a period
  const p0 = foamCycle(1.0, { period: 6, phase: 0.5, run: 1.8 });
  const p1 = foamCycle(1.0 + 3.0, { period: 6, phase: 0, run: 1.8 });
  assert.ok(Math.abs(p0.advance - p1.advance) < 1e-9);
});

test('foamCycle: born at the waterline, dies faded, never exceeds its run', () => {
  const opts = { period: 6, phase: 0, run: 1.8 };
  const at = (f) => foamCycle(f * 6, opts);     // f = fraction of the cycle
  assert.ok(at(0).opacity < 0.02, 'starts invisible');
  assert.ok(at(0.999).opacity < 0.02, 'ends invisible');
  let peakA = 0, peakO = 0;
  for (let f = 0; f < 1; f += 0.01) {
    const { advance, opacity } = at(f);
    assert.ok(advance >= -1e-9 && advance <= opts.run + 1e-9, `advance ${advance} out of [0, run]`);
    assert.ok(opacity >= 0 && opacity <= 1 + 1e-9, `opacity ${opacity} out of [0,1]`);
    peakA = Math.max(peakA, advance);
    peakO = Math.max(peakO, opacity);
  }
  assert.ok(peakA > opts.run * 0.95, 'the sweep actually reaches its run');
  assert.ok(peakO > 0.85, 'the foam actually shows');
});

test('foamCycle: rises before it fades — the sweep leads, the soak trails', () => {
  const opts = { period: 6, phase: 0, run: 1.8 };
  // find the time of peak advance and peak opacity; opacity must peak earlier
  // or together, never after the water has already receded far
  let tA = 0, tO = 0, mA = -1, mO = -1;
  for (let f = 0; f < 1; f += 0.005) {
    const { advance, opacity } = foamCycle(f * 6, opts);
    if (advance > mA) { mA = advance; tA = f; }
    if (opacity > mO) { mO = opacity; tO = f; }
  }
  assert.ok(tO <= tA + 0.05, `opacity peaks at ${tO}, after the sweep's own peak ${tA}`);
});

// ---- the strips ------------------------------------------------------------

const SHORE = { dx: 0, dz: -1, dist: 8, width: 4, sea: -0.35, depth: 1.4 };

test('makeFoam: one mesh, unlit snow, kept material, no outline', async () => {
  const { makeFoam } = await import('../src/kit/foam.js');
  const foam = makeFoam({ shore: SHORE, seed: 20 });
  assert.ok(foam.mesh.isMesh);
  assert.equal(foam.mesh.name, 'foam');
  assert.equal(foam.mesh.children.length, 0);
  assert.ok(foam.mesh.material.isMeshBasicMaterial, 'foam is unlit');
  assert.equal(foam.mesh.material.transparent, true);
  assert.equal(foam.mesh.material.depthWrite, false);
  assert.equal(foam.mesh.userData.noOutline, true);
  assert.equal(foam.mesh.userData.keepMaterial, true);
});

test('makeFoam: strips live on the beach, hug the sand, and ride the sea past the waterline', async () => {
  const { makeFoam } = await import('../src/kit/foam.js');
  const { groundHeight } = await import('../src/kit/ground.js');
  const foam = makeFoam({ shore: SHORE, seed: 20 });
  foam.update(1 / 60, 2.7);
  const pos = foam.mesh.geometry.attributes.position;
  let checked = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const s = x * SHORE.dx + z * SHORE.dz - SHORE.dist;   // seaward of waterline
    assert.ok(s > -3.5 && s < 2.5, `a foam vertex sits at s=${s}, off the beach`);
    const g = groundHeight(x, z, { seed: 21, shore: SHORE });
    assert.ok(y > g + 0.005, `foam sunk into the ground at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    assert.ok(y < Math.max(g + 0.09, SHORE.sea + 0.05),
      `foam floats ${y - g} above the surface at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    checked++;
  }
  assert.ok(checked > 50, 'there is actually foam to check');
});

// THE SIGN BUG, PINNED: s is positive seaward, so run-up means the front
// edge goes NEGATIVE. The first cut had it flipped — every wave-end swept
// out to sea, sank under the water sheet, and no foam was ever visible
// (Frank: "I don't see any foam at all"). The blind symmetric bound above
// let it through; this does not.
test('makeFoam: the wave-ends actually run UP the sand — landward of the waterline at full sweep', async () => {
  const { makeFoam } = await import('../src/kit/foam.js');
  const foam = makeFoam({ shore: SHORE, seed: 20 });
  // scan a whole cycle: at SOME moment, plenty of foam stands well landward
  // (s < -0.8), and at EVERY moment the landward reach beats the seaward one
  let bestLandward = 0;
  for (let t = 0; t < 6; t += 0.25) {
    foam.update(0.25, t);
    const pos = foam.mesh.geometry.attributes.position;
    let landward = 0;
    for (let i = 0; i < pos.count; i++) {
      const s = pos.getX(i) * SHORE.dx + pos.getZ(i) * SHORE.dz - SHORE.dist;
      if (s < -0.8) landward++;
    }
    bestLandward = Math.max(bestLandward, landward);
  }
  assert.ok(bestLandward > 30,
    `only ${bestLandward} vertices ever reach up the sand — the sweep points the wrong way`);
});

test('makeFoam: deterministic, and alive — the strips move between moments', async () => {
  const { makeFoam } = await import('../src/kit/foam.js');
  const snap = (t) => {
    const f = makeFoam({ shore: SHORE, seed: 20 });
    f.update(1 / 60, t);
    return Array.from(f.mesh.geometry.attributes.position.array);
  };
  assert.deepEqual(snap(2.0), snap(2.0));
  assert.notDeepEqual(snap(2.0), snap(4.5));
});

test('makeFoam: the trailing edge is more transparent than the front', async () => {
  const { makeFoam } = await import('../src/kit/foam.js');
  const foam = makeFoam({ shore: SHORE, seed: 20 });
  foam.update(1 / 60, 3.0);
  const color = foam.mesh.geometry.attributes.color;
  assert.equal(color.itemSize, 4, 'RGBA vertex colors carry the fade');
  let min = 2, max = -1;
  for (let i = 0; i < color.count; i++) {
    const a = color.getW(i);
    assert.ok(a >= 0 && a <= 1 + 1e-9);
    min = Math.min(min, a); max = Math.max(max, a);
  }
  assert.ok(max > min + 0.2, 'the fade gradient exists');
});
