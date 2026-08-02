import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitOutcome, clockText } from '../src/sit.js';
import { sitBellPartials, bellPartials, SIT_BELL } from '../src/audio/synths.js';

test('sitOutcome: complete only when elapsed reaches duration', () => {
  assert.equal(sitOutcome(120, 120), 'complete');
  assert.equal(sitOutcome(121, 120), 'complete');
  assert.equal(sitOutcome(119.9, 120), 'early');
  assert.equal(sitOutcome(0, 120), 'early');
});

// The clock reads the time you asked for the moment it starts. Flooring would
// show 9:59 for a ten-minute sit, which reads as a timer that has already lost a
// second before the bell has finished.
test('the clock counts down from the full minute to a clean zero', () => {
  assert.equal(clockText(600), '10:00');
  assert.equal(clockText(599.99), '10:00');
  assert.equal(clockText(599), '9:59');
  assert.equal(clockText(60), '1:00');
  assert.equal(clockText(59.5), '1:00');
  assert.equal(clockText(9), '0:09');
  assert.equal(clockText(0.4), '0:01');
  assert.equal(clockText(0), '0:00');
});

test('the clock never runs backwards past zero', () => {
  assert.equal(clockText(-0.5), '0:00');
  assert.equal(clockText(-90), '0:00');
});

test('seconds are always two digits, minutes never padded', () => {
  for (let s = 0; s <= 3600; s += 7) {
    const t = clockText(s);
    assert.match(t, /^\d+:[0-5]\d$/, `${s}s rendered as ${t}`);
  }
});

// Frank on the old timer: "that bell that rings when it starts the sit is just
// such a low thud — it should be a nice ting, a ding kind of bell". The bell was
// bellPartials at 70 Hz, a bonshō an octave below anything you could call a
// ding. The sit bell is its own voice now, four octaves up.
test('the sit bell is a ting, not a thud', () => {
  const p = sitBellPartials(1174);
  assert.ok(p[0].freq > 900, `the fundamental is ${p[0].freq} Hz — still a bong`);
  assert.ok(p[0].freq > bellPartials(70)[0].freq * 8, 'no brighter than the old temple bell');
  // near-harmonic with a slight stretch: that stretch is what makes it a small
  // struck bell rather than an organ pipe
  const ratios = p.map((x) => x.freq / p[0].freq);
  assert.equal(ratios[0], 1);
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(ratios[i] > ratios[i - 1], 'modes must ascend');
    assert.ok(ratios[i] > i + 0.9 - 0.2 && ratios[i] < i + 1.6, `mode ${i} at ${ratios[i]} is not bell-like`);
  }
  // it has to RING: a long fundamental under fast-dying upper modes is the whole
  // difference between a bell hanging in the room and a click
  assert.ok(p[0].decay >= 8, `fundamental decays in ${p[0].decay}s`);
  for (let i = 1; i < p.length; i++) assert.ok(p[i].decay < p[i - 1].decay, 'upper modes must die first');
  for (let i = 1; i < p.length; i++) assert.ok(p[i].amp < p[i - 1].amp, 'upper modes must be quieter');
});

// Degree 15 is the root four octaves up: five-note scales both, so it is the
// same note in `in` and `yo` and the timer never changes pitch with the case.
test('the sit bell sits on the root, so it is mood-blind', () => {
  assert.equal(SIT_BELL.degree % 5, 0, 'not a root degree — the bell would retune per case');
  assert.ok(SIT_BELL.level > 0 && SIT_BELL.level <= 1);
  assert.ok(SIT_BELL.verbMix > 0.5, 'a dry bell reads as a thud at any pitch');
});
