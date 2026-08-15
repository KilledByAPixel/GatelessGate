import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitOutcome, clockText } from '../src/sit.js';
import { BELL_PRESETS, SIT_BELL, barPartials, CHIME, BRONZE } from '../src/audio/synths.js';
import { hz, SCALES } from '../src/audio/tuning.js';

// makeSit is browser glue — it builds DOM in its constructor, so there is no
// seam to drive it from Node. The rule below is worth pinning anyway (it has
// already been changed once in each direction), so it is pinned in the source.
const SIT_SRC = readFileSync(new URL('../src/sit.js', import.meta.url), 'utf8');

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

// Both scales are five notes, so a root degree is the same note in `in` and in
// `yo` and the timer never retunes with the case. This has held across three
// different voices and is the one property of the sit bell that is not taste.
test('the sit bell sits on the root, so it is mood-blind', () => {
  assert.equal(SIT_BELL.degree % 5, 0, 'not a root degree — the bell would retune per case');
  for (const mood of Object.keys(SCALES)) {
    assert.equal(hz(SIT_BELL.degree, mood), hz(SIT_BELL.degree, 'in'), `mood ${mood} moved the timer`);
  }
});

// It is a struck BAR, not a struck bell — an inkin's free-free mode series is
// what makes it one clean pitch hanging in the room. Twice this shipped as a
// bell: a bonshō at 70 Hz that read as a thud, then a five-mode voice up at
// 1.2 kHz that read as harsh. The register below is the band between those two
// failures, wide on purpose: it exists to catch a slip back into either, not to
// pin a taste decision.
test('the sit bell is a ting, not a clang and not a bong', () => {
  const f0 = hz(SIT_BELL.degree, 'in');
  assert.ok(f0 > 300 && f0 < 900, `the timer rings at ${f0.toFixed(0)} Hz`);
  const p = barPartials(f0, SIT_BELL.decay);
  // it has to RING: a struck bar hangs in the room, a click does not
  assert.ok(p[0].decay >= 5, `the fundamental dies in ${p[0].decay.toFixed(2)}s`);
  // ...and the upper modes have to go FIRST, which is what leaves a pitch
  // behind rather than a clatter
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].decay < p[i - 1].decay, 'upper modes must die first');
    assert.ok(p[i].amp < p[i - 1].amp, 'upper modes must be quieter');
  }
  assert.ok(p.every((x) => Number.isFinite(x.freq) && Number.isFinite(x.amp)));
});

// `bright` is strikeBar's lowpass, and it is the knob that killed the last
// voice: the ear peaks around 2-5 kHz and an unrolled top up there is the
// difference between a ting and a sting. Nothing about the sit bell is heard
// across a garden, so it has no distance to carry a bright top through.
test('the reader\'s bell is no brighter than a chime in a scene', () => {
  assert.ok(SIT_BELL.bright > 0 && SIT_BELL.bright <= CHIME.bright,
    `bright ${SIT_BELL.bright} against the fūrin's ${CHIME.bright}`);
});

// Every way a sitting ends is marked by the bell: the timer running out, and
// the reader tapping out early. Leaving on silence made ending early read as
// walking out — and it also meant the reader could go a whole sitting without
// hearing the sound the timer closes with.
test('both endings ring, and a finished sitting rings exactly once', () => {
  const leave = SIT_SRC.slice(SIT_SRC.indexOf('function leave()'));
  const body = leave.slice(0, leave.indexOf('\n  }'));
  assert.match(body, /audio\.sitBell\(\)/, 'tapping out ends a sitting in silence');
  // ...but only out of 'sitting'. From 'done' the closing bell has already rung
  // and the tap is just leaving the scene; ringing there is two bells for one
  // ending, a few seconds apart.
  assert.match(body, /phase === 'sitting'/, 'the exit bell is not gated on the phase');
  assert.ok(body.indexOf('phase === \'sitting\'') < body.indexOf('sitBell()'),
    'the gate must come before the strike');
});

test('the reader\'s bell is the wettest thing in the book', () => {
  // A dry bell reads as a thud at any pitch, and this one is allowed further
  // into the room than anything a case owns: it is not IN the diorama, so there
  // is no scene for it to sit wrong in.
  assert.ok(SIT_BELL.verbMix > 0.5, 'a dry sit bell reads as a thud');
  for (const [name, preset] of Object.entries(BELL_PRESETS)) {
    assert.ok(SIT_BELL.verbMix >= preset.verbMix, `the ${name} preset is wetter than the reader's bell`);
  }
  assert.ok(SIT_BELL.verbMix >= CHIME.verbMix && SIT_BELL.verbMix >= BRONZE.verbMix);
  // strikeBar applies `level` whole, so it is directly comparable with the two
  // other voices that go through it — and it is far above both, because those
  // are struck across a scene and arrive through spatial attenuation while this
  // one is at the reader's ear with nothing between.
  assert.ok(SIT_BELL.level > CHIME.level, 'the timer is quieter than a distant wind chime');
  assert.ok(SIT_BELL.level < 1, `level ${SIT_BELL.level} will clip`);
});
