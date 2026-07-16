import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blobPixels } from '../src/render/blobshadow.js';
import { grainPixels } from '../src/render/grain.js';
import { INK, hexToRgb } from '../src/palette.js';

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
  const [r, g, b] = hexToRgb(INK);
  const center4 = (32 * size + 32) * 4;
  assert.equal(px[center4], r);
  assert.equal(px[center4 + 1], g);
  assert.equal(px[center4 + 2], b);
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

test('grain fibers run horizontally (slow variation along x, fast along y)', () => {
  const size = 64;
  const a = grainPixels(size, 42);
  const at = (x, y) => a[(y * size + x) * 4];
  let dx = 0, dy = 0, n = 0;
  for (let y = 1; y < size - 1; y += 2) {
    for (let x = 1; x < size - 1; x += 2) {
      dx += Math.abs(at(x + 1, y) - at(x, y));
      dy += Math.abs(at(x, y + 1) - at(x, y));
      n++;
    }
  }
  assert.ok(dx / n < dy / n, `horizontal fibers need dx (${(dx / n).toFixed(3)}) < dy (${(dy / n).toFixed(3)})`);
});
