import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windParams, bellPartials, chimePartials, GUST_A, GUST_B, gustPhase } from '../src/audio/synths.js';
import { parseRecipe } from '../src/audio/engine.js';
import { hz } from '../src/audio/tuning.js';

test('windParams monotonic and bounded', () => {
  const lo = windParams(0), hi = windParams(1);
  assert.ok(hi.gain > lo.gain && hi.cutoff > lo.cutoff);
  assert.ok(lo.gain >= 0 && hi.gain <= 1);
  const mid = windParams(0.5);
  assert.ok(mid.gain > lo.gain && mid.gain < hi.gain);
  assert.deepEqual(windParams(2), windParams(1)); // clamps
});

test('bellPartials are inharmonic and decaying', () => {
  const p = bellPartials(62);
  assert.ok(p.length >= 4);
  assert.ok(p[0].freq > 0);
  for (const x of p) {
    assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
  }
  // not a pure harmonic stack (some ratio is non-integer)
  const ratios = p.map((x) => x.freq / 62);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
});

test('parseRecipe', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25 });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1 });
});

test('hz maps scale degrees across octaves', () => {
  assert.ok(Math.abs(hz(0) - 146.83) < 0.01);          // the root, D3
  assert.ok(Math.abs(hz(5) - 293.66) < 0.02);          // degree 5 is the root an octave up
  assert.ok(Math.abs(hz(10) - 587.32) < 0.05);         // two octaves — the drift ceiling
  // the half-step at degree 1 is what makes this scale hirajoshi and not pentatonic
  assert.ok(Math.abs(hz(1) / hz(0) - Math.pow(2, 1 / 12)) < 1e-6);
  // negative degrees wrap down into the octave below rather than going nonsense
  assert.ok(hz(-1) < hz(0) && hz(-1) > hz(0) / 2);
  // strictly rising, so a walk never doubles back on pitch
  for (let d = -5; d < 15; d++) assert.ok(hz(d + 1) > hz(d));
});

test('gustPhase is bounded, irregular, and crests at chime rate', () => {
  for (let t = 0; t < 600; t += 0.37) {
    const v = gustPhase(t);
    assert.ok(v >= -1 && v <= 1, `out of range at ${t}: ${v}`);
  }
  // Two incommensurate rates: never actually periodic inside a scene's lifetime.
  assert.ok(Math.abs(gustPhase(0) - gustPhase(120)) > 0.05);

  // Rising crossings of the chime threshold land 13-31s apart: often enough to
  // feel like weather, never a dead minute, never a double-ring.
  const THR = 0.45;
  const hits = [];
  let prev = gustPhase(0);
  for (let t = 0.05; t < 1800; t += 0.05) {
    const v = gustPhase(t);
    if (prev <= THR && v > THR) hits.push(t);
    prev = v;
  }
  assert.ok(hits.length > 60, `too few crests: ${hits.length}`);
  const gaps = hits.slice(1).map((t, i) => t - hits[i]);
  assert.ok(Math.min(...gaps) > 13, `crests too close: ${Math.min(...gaps)}`);
  assert.ok(Math.max(...gaps) < 31, `dead air: ${Math.max(...gaps)}`);
});

test('chimePartials is glass, not bronze', () => {
  const c = chimePartials(2349);
  assert.ok(c.length >= 3);
  for (const x of c) assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
  // inharmonic, like the bell
  const ratios = c.map((x) => x.freq / 2349);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
  // amplitudes fall away from the fundamental
  for (let i = 1; i < c.length; i++) assert.ok(c[i].amp < c[i - 1].amp);
  // glass rings BRIEFLY and HIGH: a bonsho hangs on for ten seconds, this does not
  const bell = bellPartials(62);
  assert.ok(c[0].decay < 2, `chime decay too long: ${c[0].decay}`);
  assert.ok(c[0].decay < bell[0].decay / 4);
  assert.ok(c[0].freq > bell[0].freq * 10);
  assert.ok(c.length < bell.length);
});
