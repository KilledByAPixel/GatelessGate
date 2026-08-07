import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grainPixels } from '../src/render/grain.js';

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
