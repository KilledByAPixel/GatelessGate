import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sitOutcome, clockText } from '../src/sit.js';
import { BELL_PRESETS, SIT_BELL, bellVoice, applyBellPreset, BELL } from '../src/audio/synths.js';

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

// The timer used to ring a bespoke voice nobody else in the book used, struck up
// where the ear is most sensitive — which is what made it read as harsh rather
// than as a bell. It now names one of the auditioned presets, so retuning it is
// a word rather than a table of modes.
test('the sit bell is one of the book\'s own bells', () => {
  assert.ok(BELL_PRESETS[SIT_BELL.preset], `no such preset: ${SIT_BELL.preset}`);
  // null takes the preset's own body size; a number overrides it, and bellVoice
  // clamps well before either end of that range.
  assert.ok(SIT_BELL.size === null || (SIT_BELL.size > 0.15 && SIT_BELL.size < 4));
});

test('the sit bell is a ting, not a clang and not a bong', () => {
  const p = BELL_PRESETS[SIT_BELL.preset];
  const voice = bellVoice(SIT_BELL.size === null ? p.size : SIT_BELL.size);
  // A hand bell's register: above the temple bell it is not, below the sting the
  // old voice sat at. The band is wide on purpose — it is there to catch a
  // preset swapped to `great` by accident, not to pin a taste decision.
  assert.ok(voice.f0 > 180 && voice.f0 < 700, `the timer rings at ${voice.f0.toFixed(0)} Hz`);
  const partials = applyBellPreset(voice, p);
  // it has to RING: a struck bell hangs in the room, a click does not
  assert.ok(partials[0].decay > 2, `the hum dies in ${partials[0].decay.toFixed(2)}s`);
  assert.ok(partials.every((x) => Number.isFinite(x.freq) && Number.isFinite(x.amp)));
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

test('the reader\'s bell is quieter than a bell in a scene', () => {
  // Nothing in the diorama strikes this one, so it arrives at a fraction of a
  // case bell's velocity — gain here is the plain velocity strikeBell()
  // multiplies by BELL.level.
  assert.ok(SIT_BELL.gain > 0 && SIT_BELL.gain < 1, `gain ${SIT_BELL.gain}`);
  assert.ok(BELL.level > 0);
  // ...and it is nearly pure room. A dry bell reads as a thud at any pitch, and
  // this one is allowed further into the room than any bell a case owns.
  assert.ok(SIT_BELL.verbMix > 0.5, 'a dry sit bell reads as a thud');
  for (const [name, preset] of Object.entries(BELL_PRESETS)) {
    assert.ok(SIT_BELL.verbMix >= preset.verbMix, `the ${name} preset is wetter than the reader's bell`);
  }
});
