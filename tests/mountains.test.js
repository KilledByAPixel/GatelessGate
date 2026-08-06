import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountainFootprints } from '../src/kit/mountains.js';

// The mountains' layout as a pure, askable fact. composeWorld uses these
// footprints to keep scatter trees out of the rock (and the road audit to
// see where the roads actually go), so the one hard requirement is that
// makeMountains and mountainFootprints can never disagree — the mesh builder
// consumes this function rather than repeating its math.

test('mountainFootprints is pure, seeded, and matches its own defaults', () => {
  const a = mountainFootprints({ seed: 31 });
  const b = mountainFootprints({ seed: 31 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 7);            // default count
  for (const f of a) {
    assert.ok(Number.isFinite(f.x) && Number.isFinite(f.z) && f.r > 0);
    const d = Math.hypot(f.x, f.z);
    assert.ok(d > 20 && d < 70, `peak at implausible distance ${d}`);
  }
  assert.notDeepEqual(a, mountainFootprints({ seed: 32 }));
});

test('hScale scales the footprint radius the way it scales the peak', () => {
  const tall = mountainFootprints({ seed: 31 });
  const low = mountainFootprints({ seed: 31, hScale: 0.65 });
  for (let i = 0; i < tall.length; i++) {
    assert.ok(Math.abs(low[i].r - tall[i].r * 0.65) < 1e-9, 'r rides h, h rides hScale');
    assert.equal(low[i].x, tall[i].x, 'placement does not depend on height');
  }
});
