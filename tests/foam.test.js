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
