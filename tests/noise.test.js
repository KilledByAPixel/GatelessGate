import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash1, noise1, noise2, noise3, fbm2 } from '../src/util/noise.js';

test('deterministic: same inputs give same outputs', () => {
  for (let i = 0; i < 50; i++) {
    const x = i * 0.73, y = i * 1.31, z = i * 0.17;
    assert.equal(noise2(x, y, 7), noise2(x, y, 7));
    assert.equal(noise3(x, y, z, 3), noise3(x, y, z, 3));
    assert.equal(fbm2(x, y, 11), fbm2(x, y, 11));
  }
});

test('outputs stay in [0,1]', () => {
  for (let i = 0; i < 500; i++) {
    const x = (i - 250) * 0.37, y = i * 0.91;
    for (const v of [hash1(i, 5), noise1(x, 5), noise2(x, y, 5), noise3(x, y, x, 5), fbm2(x, y, 5)]) {
      assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
    }
  }
});

test('different seeds give different fields', () => {
  let differs = false;
  for (let i = 0; i < 20; i++) {
    if (noise2(i * 0.61, i * 0.37, 1) !== noise2(i * 0.61, i * 0.37, 2)) differs = true;
  }
  assert.ok(differs);
});

test('noise2 is continuous (small step, small change)', () => {
  for (let i = 0; i < 100; i++) {
    const x = i * 0.219, y = i * 0.173;
    const d = Math.abs(noise2(x, y, 9) - noise2(x + 0.001, y, 9));
    assert.ok(d < 0.05, `discontinuity ${d} at ${x},${y}`);
  }
});
