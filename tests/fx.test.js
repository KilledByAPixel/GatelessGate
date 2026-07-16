import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobPixels } from '../src/render/blobshadow.js';
import { grainPixels } from '../src/render/grain.js';

test('blobPixels: opaque center, transparent corners, smooth falloff', () => {
  const size = 64;
  const px = blobPixels(size);
  assert.equal(px.length, size * size * 4);
  const alphaAt = (x, y) => px[(y * size + x) * 4 + 3];
  const center = alphaAt(32, 32);
  const mid = alphaAt(48, 32);
  const corner = alphaAt(0, 0);
  assert.ok(center > 200, `center alpha ${center}`);
  assert.ok(mid > 0 && mid < center, `mid alpha ${mid}`);
  assert.equal(corner, 0);
});

test('grainPixels: near-white, varied, deterministic', () => {
  const a = grainPixels(64, 42);
  const b = grainPixels(64, 42);
  const c = grainPixels(64, 43);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.notDeepEqual(Array.from(a), Array.from(c));
  let min = 255, max = 0;
  for (let i = 0; i < a.length; i += 4) {
    min = Math.min(min, a[i]);
    max = Math.max(max, a[i]);
    assert.equal(a[i], a[i + 1]); // grayscale
    assert.equal(a[i + 3], 255);
  }
  assert.ok(min >= 225, `too dark: ${min}`);
  assert.ok(max <= 255 && max > min, `no variation: ${min}..${max}`);
});
