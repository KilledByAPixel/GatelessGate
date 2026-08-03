import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windParams, bellPartials, bellVoice, bellTail, BELL_REF_HZ, barPartials, GUST_A, GUST_B, gustPhase, STRIKE_SCALE, BELL_PRESETS } from '../src/audio/synths.js';
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

test('bellPartials are a bonshō: hum tone, strike note, fast-dying upper modes', () => {
  const p = bellPartials(62);
  assert.ok(p.length >= 5);
  for (const x of p) {
    assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
    assert.ok(Number.isFinite(x.detune));
  }
  // not a pure harmonic stack (some ratio is non-integer)
  const ratios = p.map((x) => x.freq / 62);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));

  // THE HUM TONE outlasts everything: a struck bonshō leaves a clean low pitch
  // hanging, not a clang. The old table topped out at 10s on the fundamental
  // with the second partial at 8 — near enough to a clang.
  assert.equal(p[0].decay, Math.max(...p.map((x) => x.decay)), 'the fundamental is not the longest');
  assert.ok(p[0].decay >= 12, `the hum tone is too short: ${p[0].decay}s`);

  // and the upper modes get out of the way fast RELATIVE TO THE HUM. Task 5A
  // (the treble rebuild) coupled decay to the bell's implied SIZE, and f0=62
  // implies a size around 1.77 (BELL_REF_HZ / 62) — bigger than the size-1
  // bell the fixed "<2s" bound here used to assume. A bigger bell's clang
  // legitimately lasts more absolute seconds than a small one's, so a flat
  // ceiling checked at one specific low pitch is no longer meaningful; what
  // must hold at ANY size is that the clang is a small fraction of the hum's
  // duration, since decay = tableValue * size scales every mode by the same
  // factor and the ratio between modes cancels it out. See the size-1 version
  // of this same claim in "the bell has treble — it can actually ding" below.
  const upper = p.filter((x) => x.freq / 62 > 3);
  assert.ok(upper.length >= 2, 'no upper modes to speak of');
  for (const x of upper) {
    assert.ok(x.decay < p[0].decay * 0.35,
      `an upper mode rings for ${x.decay}s, too close to the hum's ${p[0].decay}s — that is the clang`);
  }
  // CODE REVIEW CAUGHT: the relative check above is where p[0].decay is ALSO
  // tableValue * size, so the size factor cancels on both sides of the ratio
  // and the assertion reduces to a statement about BELL_MODES's raw constants
  // alone (rawX < rawHum * 0.35) — true or false identically at every f0, so
  // testing it "at f0=62" added no coverage the table itself didn't already
  // have. It also turned out to be LOOSE: it tolerates a scaled decay up to
  // hum*0.35 = 4.968s at this pitch, nearly 2.5x the pre-Task-5A ceiling of
  // 2s. An absolute ceiling closes both gaps, but only if it is actually
  // TIGHTER than the relative one, or the relative check fails first and this
  // one never gets exercised. Today's worst upper mode at f0=62 is the 3.01x
  // tierce at 4.258s; 4.5s leaves ~6% headroom for a legitimate rebalance,
  // which is below the relative bound's 4.968s, so this check has real,
  // independent teeth (proven in the Task 5A code-review fix report: inflating
  // the 3.01x mode's raw decay to 2.6 — scaled 4.613s — passes the relative
  // check, which only trips past 2.8 raw, and fails THIS one).
  for (const x of upper) {
    assert.ok(x.decay < 4.5, `an upper mode rings for ${x.decay}s at f0=62 — the clang is lingering`);
  }
});

test('the bell beats at different rates per mode, which is the shimmer', () => {
  // strike() detunes each partial by +/- its own `detune`, so the beat rate of
  // a partial is 2x that number. The old code used one FIXED +/-0.35 Hz for
  // every partial of every voice. Because that offset is ABSOLUTE rather than
  // proportional, every mode beat at exactly the same 0.7 Hz whatever its
  // frequency — one uniform warble across the whole spectrum. Real bronze does
  // not do that: the low modes swell slowly and the rate tightens as they
  // climb, and that spread IS the shimmer.
  const p = bellPartials(62);
  const rates = p.map((x) => x.detune * 2);
  assert.ok(new Set(rates).size > 1, 'every mode still beats at the same rate');
  assert.ok(rates[0] >= 0.6 && rates[0] <= 2.6, `the hum tone's swell is wrong: ${rates[0]} Hz`);
  // widest on the low partials, tightening upward
  assert.ok(rates[0] > rates[rates.length - 1], 'the beat does not tighten as the modes climb');
});

test('the strike level scale is a named constant, not a magic number', () => {
  // strike() used to hard-code 0.11 as the peak scaling for every partial,
  // which is bell-sized. The odoshi's knock had to multiply its gain by 9 at
  // the call site to undo it. With four more voices arriving, each would have
  // fought the same number — so it is a parameter now.
  assert.equal(typeof STRIKE_SCALE, 'number');
  assert.ok(STRIKE_SCALE > 0 && STRIKE_SCALE < 1);
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

test('the engine carries the mood without needing a browser', () => {
  // createAudio touches no AudioContext until ensureCtx, so the mood state is
  // testable in Node — the node graph is not
  const save = { state: () => ({ soundOn: false }), setSound() {} };
  const audio = createAudio(save);
  assert.equal(audio.mood(), 'in', 'the book defaults dark');
  audio.setMood('yo');
  assert.equal(audio.mood(), 'yo');
  audio.setMood(undefined);
  assert.equal(audio.mood(), 'in', 'an absent mood falls back to the default');
  audio.setMood('nonsense');
  assert.equal(audio.mood(), 'in', 'an unknown mood cannot detune the book');
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
  // water is an object that makes noise, not a bed: the basin thins the swells
  assert.equal(emitterCount(['wind:0.14', 'water', 'music']), 1);
});

test('the bell has treble — it can actually ding', () => {
  // THE BUG Frank heard: "almost like a dull thud and then a bit of reverb,
  // rather than a ding and then a bit of a continued ring." The old table
  // stopped at 5.43x the fundamental, so case 16's bell (f0 98) had NOTHING
  // above 532 Hz. The ear peaks at 2-5 kHz and a struck-metal ding lives at
  // 1-4 kHz. It was not that the bell rang badly; there was no bell up there
  // to ring. Frank ranked case 26 (f0 150) over 16 (f0 98) over 9 (f0 49) —
  // exactly the order of their treble ceilings.
  const { partials } = bellVoice(1);
  const top = Math.max(...partials.map((p) => p.freq));
  assert.ok(top > 1200, `still no treble: the voice tops out at ${Math.round(top)} Hz`);
  assert.ok(partials.length >= 9, `too few modes for a clang: ${partials.length}`);

  // and the bright cluster must get OUT of the way fast, or it is a clang and
  // not a ding — the bell should leave a clean low pitch hanging
  const bright = partials.filter((p) => p.freq > 700);
  assert.ok(bright.length >= 3, 'no bright cluster to speak of');
  for (const p of bright) assert.ok(p.decay < 1.2, `a bright mode rings for ${p.decay}s`);
});

test('the upper modes arrive first — the attack IS the metal', () => {
  // strike() used to ramp every partial in over the same 15 ms. A struck
  // bell's high modes arrive in under 2 ms, and that onset is what the ear
  // reads as "metal struck" rather than "a tone swelled".
  const { partials } = bellVoice(1);
  for (const p of partials) {
    assert.ok(Number.isFinite(p.attack) && p.attack > 0, 'a partial has no attack');
    assert.ok(p.attack <= 0.014, `partial at ${Math.round(p.freq)} Hz swells over ${p.attack}s`);
  }
  const low = partials[0];
  const high = partials[partials.length - 1];
  assert.ok(high.attack < low.attack, 'the top mode does not arrive before the hum');
  assert.ok(high.attack < 0.003, `the top mode takes ${high.attack}s to speak`);
});

test('size is one knob: a bigger bell is lower AND rings longer', () => {
  // Real physics, and the reason a case names a size rather than a pitch and a
  // decay it could set in contradiction. Frequency goes as 1/size, decay as
  // size — they can never disagree.
  const small = bellVoice(0.35);
  const mid = bellVoice(1);
  const great = bellVoice(2.2);
  assert.ok(small.f0 > mid.f0 && mid.f0 > great.f0, 'bigger is not lower');
  const hum = (v) => v.partials[0].decay;
  assert.ok(hum(small) < hum(mid) && hum(mid) < hum(great), 'bigger does not ring longer');
  // the ratios are the bell's identity and must not drift with size
  const ratios = (v) => v.partials.map((p) => +(p.freq / v.f0).toFixed(3));
  assert.deepEqual(ratios(small), ratios(mid), 'the mode series changed with size');
  // a hand bell must not ring like a temple bell
  assert.ok(hum(small) < 4, `a small bell hums for ${hum(small)}s`);
  assert.ok(great.f0 < 90 && small.f0 > 250, `register is wrong: ${great.f0} / ${small.f0}`);
});

test('bellPartials still answers by pitch, from the same table', () => {
  // Eight case modules call bell({ f0 }) and must keep their pitches.
  const p = bellPartials(150);
  assert.ok(Math.abs(p[0].freq - 150) < 1e-6, 'f0 is not honoured');
  const v = bellVoice(1);
  const ratios = (list, f0) => list.map((x) => +(x.freq / f0).toFixed(3));
  assert.deepEqual(ratios(p, 150), ratios(v.partials, v.f0), 'two tables, not one');
});

test('bellTail tracks the voice actually struck, not a guess sized to one pitch', () => {
  // CODE REVIEW CAUGHT: BELL used to carry a flat `tail: 16` for the spatial
  // bus's release. Decay is now coupled to size, so the hum's real length
  // varies per call — k9's f0:49 implies a hum decay near 18s, already past
  // the old flat 16 — and spatial.js's bus.release() disconnects the bus
  // unconditionally at whatever time it is given, with no second chance.
  const k9Voice = { f0: 49, partials: bellPartials(49) };   // k9's actual call site
  const longestPartial = Math.max(...k9Voice.partials.map((p) => p.decay));
  assert.ok(longestPartial > 17, `expected a long hum at f0 49, got ${longestPartial}s`);
  assert.ok(longestPartial > 16, 'this is exactly the case the flat tail:16 would have cut short');

  const tail = bellTail(k9Voice);
  assert.ok(tail > longestPartial, 'the release must outlast the longest partial');
  assert.ok(tail < longestPartial + 2, 'and not by an arbitrary amount — a small, fixed margin');

  // and it genuinely tracks the voice: a small bell does not carry a great
  // bell's release, because the two have different longest partials
  const hand = bellVoice(0.35);
  const great = bellVoice(2.2);
  assert.ok(bellTail(hand) < bellTail(great), 'tail did not vary with the voice it was given');
});

test('the shimmer cluster gives even a great bell some treble', () => {
  // Frank pinned `brightness` at its maximum on all three presets — he was
  // asking for treble the model could not make. The named series stops at
  // 15.1x, so the ceiling falls with the pitch: the `great` bell at 46.6 Hz
  // had NOTHING above 704 Hz, which is why he hauled its clang to 2.59 and
  // its brightness to the stop. A real bell's modal density RISES with
  // frequency; the shimmer cluster is that, and it is what fills the gaps a
  // sparse sine stack leaves in the 1-6 kHz band.
  const great = bellVoice(2.36);
  const top = Math.max(...great.partials.map((p) => p.freq));
  assert.ok(top > 2500, `a great bell still has no treble: tops out at ${Math.round(top)} Hz`);

  const bright = great.partials.filter((p) => p.freq > 1000);
  assert.ok(bright.length >= 8, `too sparse up top to read as bronze: ${bright.length} modes above 1 kHz`);

  // the shimmer must get out of the way fast, or it is a cymbal
  for (const p of bright) assert.ok(p.decay < 1.0, `a shimmer mode rings for ${p.decay}s`);
});

test('the shimmer is irregularly spaced — a regular series is a comb', () => {
  const { partials } = bellVoice(1);
  const high = partials.filter((p) => p.freq > partials[10].freq).map((p) => p.freq);
  assert.ok(high.length >= 10, 'no shimmer cluster');
  const gaps = high.slice(1).map((f, i) => f - high[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const spread = Math.max(...gaps) / Math.min(...gaps);
  assert.ok(spread > 1.4, `the shimmer is evenly spaced (spread ${spread.toFixed(2)}) — that is a comb, not a bell`);
  assert.ok(mean > 0, 'shimmer frequencies are not ascending');
});

test('the shimmer is deterministic — the same bell twice is the same bell', () => {
  // Audio is exempt from the no-Math.random rule, but a bell whose overtones
  // moved between strikes would be a different bell each time.
  const a = bellVoice(1).partials.map((p) => p.freq);
  const b = bellVoice(1).partials.map((p) => p.freq);
  assert.deepEqual(a, b);
});

test('shimmer modes are single oscillators, not wasted pairs', () => {
  // A 0.3 Hz beat needs three seconds to be heard; a mode that dies in 0.1 s
  // cannot use one. detune 0 now means ONE oscillator rather than two
  // coincident sines.
  const { partials } = bellVoice(1);
  const shimmer = partials.slice(11);
  assert.ok(shimmer.length > 0);
  for (const p of shimmer) assert.equal(p.detune, 0, 'a shimmer mode still pays for a detuned pair');
  // and the named modes keep their beat
  for (const p of partials.slice(0, 11)) assert.ok(p.detune > 0);
});

test("the three presets are Frank's bells: bigger is lower, longer, clangier", () => {
  // The family he arrived at by ear, which is real bell physics: a bigger bell
  // is lower AND rings longer AND clangs harder AND pings LOWER AND sits in
  // more room. If a change breaks this ordering it has broken his tuning.
  const { hand, temple, great } = BELL_PRESETS;
  assert.ok(hand.size < temple.size && temple.size < great.size);
  assert.ok(hand.ring < temple.ring && temple.ring <= great.ring);
  assert.ok(hand.pingFreq > temple.pingFreq && temple.pingFreq > great.pingFreq,
    'a small bell must ping HIGHER than a great one');
  assert.ok(hand.verbMix < temple.verbMix && temple.verbMix < great.verbMix);
  assert.ok(hand.beam < temple.beam && temple.beam < great.beam);
});
