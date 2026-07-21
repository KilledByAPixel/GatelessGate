import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchDensity, makeGrassField } from '../src/kit/grassfield.js';

// These guard a bug that reached Frank's screen: the meadow cut a huge SQUARE
// out of itself around the staging. One octave of bilinear value noise on an
// integer lattice, thresholded to zero, leaves holes whose edges follow
// lattice-aligned iso-contours — and at the frequency it ran, one cell was wider
// than the visible field, so a single hash decided whether the middle of the
// shot had grass at all.
//
// Measured against the old code, the FLOOR assertion below is the one that
// catches it. The stand-size and isotropy assertions do not: value noise's
// autocorrelation is near-isotropic (ratio 1.31) even where its thresholded
// contours are square, so those two are supporting guards on stand scale, not
// proof that the squares are gone. What removed them is having no hard-zero
// region to draw an edge around.

const GRID = (fn) => {
  const out = [];
  for (let x = -18; x <= 18; x += 1.5) for (let z = -18; z <= 18; z += 1.5) out.push(fn(x, z));
  return out;
};

test('patchiness thins the meadow but never bares it', () => {
  const d = GRID((x, z) => patchDensity(x, z, 2349, 0.42));
  const min = Math.min(...d);
  const max = Math.max(...d);
  // Deliberately well under PATCH_FLOOR: this asserts the PROPERTY (thin grass
  // everywhere, never bare earth) rather than restating the constant, so the
  // floor stays free to be tuned for density without touching the test. The old
  // code scored 0.000 here.
  assert.ok(min > 0.15, `no bald ground anywhere: min ${min.toFixed(3)}`);
  assert.ok(max > 0.95, `full stands still exist: max ${max.toFixed(3)}`);

  // and it must still VARY — a flat field is the other failure, no visual rest
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length);
  assert.ok(sd > 0.15, `stands and clearings, not a uniform lawn: sd ${sd.toFixed(3)}`);
});

test('every case is staged on ground that has grass', () => {
  // composeWorld seeds the field with koan seed * 81
  for (const [name, x, z, seed] of [
    ['k1 dog', 0, 0, 1], ['k6 assembly', 1.2, -2.2, 6], ['k7 basin', 2.15, 0.9, 7],
    ['k29 monks', 1.4, 1.7, 29], ['k29 gate', 1.4, -2.6, 29], ['k37 buffalo', 1.0, 0.1, 37],
  ]) {
    let sum = 0;
    for (let a = 0; a < 8; a++) {
      sum += patchDensity(x + Math.cos(a / 8 * 6.28318) * 2.5,
        z + Math.sin(a / 8 * 6.28318) * 2.5, seed * 81, 0.42);
    }
    // guaranteed by the floor rather than by luck of the seed — which is the
    // point: before it existed, k29's gate and k6's assembly both scored 0.00
    assert.ok(sum / 8 > 0.18, `${name} stands in grass, not on a bald patch: ${(sum / 8).toFixed(2)}`);
  }
});

test('grass stands are smaller than the shot, and not axis-aligned', () => {
  // Autocorrelation length along each axis. The old lattice put one cell at
  // ~11.8 units, wider than the near field; stands must decorrelate well inside
  // it or a single patch can blank the whole view again.
  const at = (x, z) => patchDensity(x, z, 2349, 0.42);
  const samples = [];
  for (let x = -16; x <= 16; x += 0.5) for (let z = -16; z <= 16; z += 0.5) samples.push([x, z]);
  const base = samples.map(([x, z]) => at(x, z));
  const mean = base.reduce((s, v) => s + v, 0) / base.length;
  const varr = base.reduce((s, v) => s + (v - mean) ** 2, 0) / base.length;

  const corrAt = (dx, dz) => {
    let c = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, z] = samples[i];
      c += (base[i] - mean) * (at(x + dx, z + dz) - mean);
    }
    return c / samples.length / varr;
  };

  const dirs = { '+x': [1, 0], '+z': [0, 1], 'diag': [0.7071, 0.7071], 'anti': [0.7071, -0.7071] };
  const lengths = {};
  for (const [name, [ux, uz]] of Object.entries(dirs)) {
    let d = 0.5;
    while (d < 20 && corrAt(ux * d, uz * d) > 0.5) d += 0.5;
    lengths[name] = d;
  }
  // measured 3.5-5.5 units; the old single octave sat at 6.5-8.5
  for (const [name, d] of Object.entries(lengths)) {
    assert.ok(d < 6.5, `${name} stands decorrelate well inside the shot: ${d} units`);
  }
});

test('the field actually places the blades it is asked for', () => {
  // The old rejection rates were so high the placement loop ran out of candidate
  // budget and quietly delivered half a meadow.
  const f = makeGrassField({ count: 6000, radius: 20, seed: 2349 });
  assert.ok(f.blades > 6000 * 0.98, `placed ${f.blades} of 6000`);
});
