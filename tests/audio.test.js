import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windParams, bellPartials, barPartials, GUST_A, GUST_B, gustPhase } from '../src/audio/synths.js';
import { parseRecipe, emitterCount, createAudio } from '../src/audio/engine.js';
import { hz, SCALES } from '../src/audio/tuning.js';

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

test('the mood family: yo is the bright sibling on the same root', () => {
  // both moods exist, five notes each, so the drift range maths is mood-blind
  assert.deepEqual(Object.keys(SCALES).sort(), ['in', 'yo']);
  assert.equal(SCALES.in.length, SCALES.yo.length);
  // the default mood IS today's behaviour — nothing already shipped moves
  for (let d = -3; d < 12; d++) assert.equal(hz(d), hz(d, 'in'));
  // the root does not move between moods: one root, two colours
  assert.equal(hz(0, 'yo'), hz(0, 'in'));
  assert.equal(hz(5, 'yo'), hz(5, 'in'));
  // yo has no half-steps: degree 1 is a whole step, not hirajoshi's semitone
  assert.ok(Math.abs(hz(1, 'yo') / hz(0, 'yo') - Math.pow(2, 2 / 12)) < 1e-6);
  assert.ok(Math.abs(hz(1, 'in') / hz(0, 'in') - Math.pow(2, 1 / 12)) < 1e-6);
  // still strictly rising in both moods
  for (let d = -5; d < 15; d++) {
    assert.ok(hz(d + 1, 'yo') > hz(d, 'yo'));
    assert.ok(hz(d + 1, 'in') > hz(d, 'in'));
  }
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

test('barPartials is a struck bar, not a bell', () => {
  const c = barPartials(523, 5);
  assert.equal(c.length, 4);
  // the free-free bar mode series — the reason a chime does not sound like a bell
  const ratios = c.map((x) => x.freq / 523);
  assert.ok(Math.abs(ratios[1] - 2.756) < 1e-9);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
  // the fundamental keeps the passed decay; upper modes die away faster
  assert.equal(c[0].decay, 5);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i].decay < c[i - 1].decay);
    assert.ok(c[i].amp < c[i - 1].amp);
  }
});

test('emitterCount counts sound sources, not beds', () => {
  // wind is a bed and music is the thing being thinned; neither is an emitter
  assert.equal(emitterCount([]), 0);
  assert.equal(emitterCount(['wind:0.25']), 0);
  assert.equal(emitterCount(['wind:0.25', 'music']), 0);
  assert.equal(emitterCount(['wind:0.25', 'furin:0.4', 'music']), 1);
  assert.equal(emitterCount(['furin:0.4', 'furin:0.2']), 2);
});
