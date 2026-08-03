import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windParams, bellPartials, bellVoice, bellTail, BELL_REF_HZ, barPartials, GUST_A, GUST_B,
  gustPhase, STRIKE_SCALE, BELL_PRESETS, bellMacroPartials, applyBellPreset, NAMED_MODE_COUNT, strike,
} from '../src/audio/synths.js';
import { parseRecipe, emitterCount, createAudio, hushSchedule } from '../src/audio/engine.js';
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
  // the ratios are the bell's identity and must not drift with size — but a
  // SMALL bell (high f0) can legitimately have FEWER of them than a big one:
  // the Nyquist trim (synths.js's SHIMMER_MAX_HZ) drops shimmer modes above
  // ~16kHz per voice, and `small`'s higher f0 pushes more of them over that
  // line than `mid`'s does. The trim only ever removes a trailing suffix of
  // the (ascending-ratio) shimmer table, so the shorter list must still be
  // an exact prefix of the longer one — that is what "did not drift" means
  // once sizes are allowed to see different amounts of the same table.
  const ratios = (v) => v.partials.map((p) => +(p.freq / v.f0).toFixed(3));
  const shortRatios = ratios(small), longRatios = ratios(mid);
  assert.ok(shortRatios.length <= longRatios.length, 'the smaller bell somehow has MORE modes');
  assert.deepEqual(shortRatios, longRatios.slice(0, shortRatios.length),
    'the mode series changed with size');
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
  // CODE REVIEW CAUGHT (second pass): this test used to measure Hz GAPS
  // between consecutive modes, which widen with frequency on ANY ascending
  // log-spaced series regardless of regularity — a perfectly geometric comb
  // from 17x to 70x scores a Hz-gap spread of 3.69, comfortably past the old
  // 1.4 threshold, so this test could not fail no matter how regular the
  // table was; it only proved the series ascends. The quantity that is
  // CONSTANT for a geometric series and VARIES for an irregular one is the
  // ratio QUOTIENT between consecutive modes (r[i+1]/r[i]) — a perfect comb
  // scores exactly 1.0 on that measure regardless of range. See
  // task-5b-report.md for the non-vacuity proof: a perfectly geometric
  // SHIMMER_MODES table fails this rewritten test and passes the old one.
  const { partials } = bellVoice(1);
  const high = partials.filter((p) => p.freq > partials[10].freq).map((p) => p.freq);
  assert.ok(high.length >= 10, 'no shimmer cluster');
  // freq[i+1]/freq[i] === ratio[i+1]/ratio[i] exactly (f0 cancels), so the
  // frequencies already in hand are enough — no need to divide out f0.
  const quotients = high.slice(1).map((f, i) => f / high[i]);
  assert.ok(quotients.every((q) => q > 1), 'shimmer frequencies are not ascending');
  const spread = Math.max(...quotients) / Math.min(...quotients);
  assert.ok(spread > 1.3,
    `the shimmer's ratio steps are too even (spread ${spread.toFixed(2)}) — that is a comb, not a bell`);
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

// ---- fix round: the faithfulness deliverable itself was uncovered — a
// wrong-but-plausible refit passed every test above. These pin it down.

test("preset ampMult is EXACT, not fit — zero residual against Frank's original macros", () => {
  // CODE REVIEW CAUGHT: BELL_PRESETS used to store a lossy amplitude-weighted
  // FIT onto four bands (worst case: hand idx1, the strike note, at +140%).
  // ampMult must now reproduce EXACTLY what Frank's ORIGINAL, overlapping
  // macros (task-5b-brief.md's top table: brightness on freq > 700 Hz, hum
  // on mode 0 alone, clang on the top FOUR modes by INDEX) produced per
  // named mode — recomputed here from that formula, independently of
  // whatever synths.js currently ships, so a future refit that reintroduces
  // error trips this rather than a green suite hiding it again.
  const ORIGINAL = {
    hand:   { size: 0.38, brightness: 3, hum: 1.12, clang: 0.98 },
    temple: { size: 0.78, brightness: 3, hum: 1.00, clang: 1.52 },
    great:  { size: 2.36, brightness: 3, hum: 1.43, clang: 2.59 },
  };
  for (const [name, o] of Object.entries(ORIGINAL)) {
    const voice = bellVoice(o.size);
    const expected = voice.partials.slice(0, NAMED_MODE_COUNT).map((p, i) => {
      let mult = 1;
      if (i === 0) mult *= o.hum;
      if (p.freq > 700) mult *= o.brightness;
      if (i >= NAMED_MODE_COUNT - 4) mult *= o.clang;   // top FOUR by index — the old grouping
      return mult;
    });
    const actual = BELL_PRESETS[name].ampMult;
    assert.equal(actual.length, NAMED_MODE_COUNT, `${name}: ampMult is not one entry per named mode`);
    for (let i = 0; i < NAMED_MODE_COUNT; i++) {
      assert.ok(Math.abs(actual[i] - expected[i]) < 1e-9,
        `${name} mode ${i}: shipped ${actual[i]}, Frank's original macros produced ${expected[i]} — this is drift, not a rounding difference`);
    }
  }
});

test('bellMacroPartials bands partition every mode — no overlap, no gap', () => {
  // hum = mode 0, body = modes 1-5, clang = modes 6..(NAMED_MODE_COUNT-1),
  // shimmer = everything after. Verified with four DISTINCT prime
  // multipliers: every partial's resulting amp must factor as EXACTLY one
  // of the four primes — never a product of two (overlap) and never left at
  // the base amp because no band reached it (a gap).
  const voice = bellVoice(1);
  const PRIMES = { hum: 2, body: 3, clang: 5, shimmer: 7 };
  const dressed = bellMacroPartials(voice, PRIMES);
  assert.equal(dressed.length, voice.partials.length);
  const nameOf = { 2: 'hum', 3: 'body', 5: 'clang', 7: 'shimmer' };
  for (let i = 0; i < dressed.length; i++) {
    const factor = dressed[i].amp / voice.partials[i].amp;
    const expected = i === 0 ? PRIMES.hum
      : i <= 5 ? PRIMES.body
      : i < NAMED_MODE_COUNT ? PRIMES.clang
      : PRIMES.shimmer;
    assert.ok(Math.abs(factor - expected) < 1e-9,
      `mode ${i} factored as ${factor}, expected the ${nameOf[expected]} band's prime (${expected}) alone`);
  }
});

test('shimmer modes above ~16kHz are dropped, not aliased', () => {
  // `bellVoice(0.38)` is the coordinator's own example (hand's size): several
  // top shimmer ratios clear 16 kHz there and must be gone, not just loud.
  const hand = bellVoice(0.38);
  for (const p of hand.partials) assert.ok(p.freq <= 16000, `a partial at ${Math.round(p.freq)} Hz survived the trim`);
  assert.ok(hand.partials.length < bellVoice(1).partials.length,
    'a high-pitched bell kept just as many shimmer modes as a low one — the trim did nothing');

  // and the size slider's own low end (0.15, clamped) is the worst case
  const tiny = bellVoice(0.15);
  for (const p of tiny.partials) assert.ok(p.freq <= 16000);
});

test('applyBellPreset renormalizes so a dressed preset never sums louder than its own bare voice', () => {
  // CODE REVIEW CAUGHT: BELL.level is calibrated against the UNDRESSED
  // partial-table sum (see BELL's own comment). Frank's per-mode multipliers
  // push a dressed sum well past that with no cap otherwise — measured:
  // hand ~2.24x, temple ~1.85x, great ~1.39x — a real clip risk on a path no
  // case calls yet. applyBellPreset must claw the sum back to parity, per
  // voice, exactly, for every preset.
  for (const [name, preset] of Object.entries(BELL_PRESETS)) {
    const voice = bellVoice(preset.size);
    const rawSum = voice.partials.reduce((s, p) => s + p.amp, 0);
    const dressed = applyBellPreset(voice, preset);
    const dressedSum = dressed.reduce((s, p) => s + p.amp, 0);
    assert.ok(Math.abs(dressedSum - rawSum) < 1e-9,
      `${name}: dressed sum ${dressedSum.toFixed(4)} != bare sum ${rawSum.toFixed(4)} — the preset path can clip`);
  }
});

test('applyBellPreset renormalization preserves every ratio between two modes exactly', () => {
  // A single scalar over the whole voice corrects the OVERALL level; it must
  // not touch the SHAPE Frank tuned between any two of his own modes — the
  // ratio of dressed amps must equal the ratio of (base amp * ampMult) for
  // every pair, unchanged by whatever the normalizer turns out to be.
  const preset = BELL_PRESETS.hand;
  const voice = bellVoice(preset.size);
  const dressed = applyBellPreset(voice, preset);
  for (let i = 1; i < NAMED_MODE_COUNT; i++) {
    const expected = (voice.partials[i].amp * preset.ampMult[i])
      / (voice.partials[0].amp * preset.ampMult[0]);
    const actual = dressed[i].amp / dressed[0].amp;
    assert.ok(Math.abs(actual - expected) < 1e-9,
      `renormalization distorted the shape at idx${i}: got ${actual}, expected ${expected}`);
  }
});

// A minimal fake AudioContext — just enough surface for strike() to build
// its graph without throwing, with every createGain() node RECORDED so a
// test can see which numeric gains actually got wired to which bus. This
// is the one place in this file that reaches into strike()'s own graph
// rather than treating it as opaque/browser-only, because the thing under
// test — transientGain is a SEPARATE bus from gain — is exactly the kind of
// wiring mistake a param-table test cannot see.
function fakeAudioCtx() {
  const gains = [];
  return {
    currentTime: 0,
    sampleRate: 44100,
    createGain() {
      const node = {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, disconnect() {},
      };
      gains.push(node);
      return node;
    },
    createOscillator() {
      return { type: 'sine', frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
    },
    createBufferSource() {
      return { buffer: null, connect() {}, start() {}, stop() {} };
    },
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    },
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 }, connect() {} };
    },
    _gainValues() { return gains.map((g) => g.gain.value); },
  };
}

test('strike() puts the mallet on its own gain bus, separate from the partials', () => {
  // CODE REVIEW CAUGHT, deferred from Task 5A: strike() used to apply ONE
  // `gain` to the whole strike, so BELL.level (a partial-table calibration)
  // silently rescaled the mallet too. `transientGain` must land on a
  // DIFFERENT bus than `gain` when the two differ.
  const ctx = fakeAudioCtx();
  strike(ctx, { connect() {} }, {
    partials: [{ freq: 440, amp: 1, decay: 0.1, detune: 0.35 }],
    gain: 0.4563,
    transientGain: 0.5255,
    transient: { dur: 0.01, freq: 500, amp: 0.3 },
  });
  const values = ctx._gainValues();
  assert.ok(values.includes(0.4563), 'no bus carries the partials gain (BELL.level path)');
  assert.ok(values.includes(0.5255), 'no bus carries the transient gain (TRANSIENT_SCALE path)');
});

test('strike() defaults transientGain to gain — every other voice is unaffected', () => {
  // bar/bamboo/sit-bell/drip never pass transientGain, so both buses must
  // still read the SAME single number, exactly as strike() behaved before
  // this split existed.
  const ctx = fakeAudioCtx();
  strike(ctx, { connect() {} }, {
    partials: [{ freq: 440, amp: 1, decay: 0.1 }],
    gain: 0.73,
    transient: { dur: 0.01, freq: 500, amp: 0.3 },
  });
  const at073 = ctx._gainValues().filter((v) => v === 0.73);
  assert.equal(at073.length, 2, `expected exactly two 0.73 gain nodes (partials bus + transient bus), got ${at073.length}`);
});

// ---- Task 5C: hushVoices — nothing follows the reader off the page --------
//
// `great` rings 57s and nothing before this task could cut a ringing one-shot
// short at a page turn. hushVoices() closes two gain nodes every one-shot
// funnels through; hushSchedule is the pure timing arithmetic behind it.

test('hushSchedule: fade and restore are ordered, finite, and monotonic in both arguments', () => {
  const a = hushSchedule(0.5, 0.15);
  assert.ok(Number.isFinite(a.fadeEndsAt) && Number.isFinite(a.restoreAt));
  assert.ok(a.fadeEndsAt > 0, 'fadeEndsAt must be positive');
  assert.ok(a.restoreAt > a.fadeEndsAt, 'the restore cannot begin before the fade finishes');

  // monotonic in fade: a longer fade pushes BOTH times later
  const longerFade = hushSchedule(1.2, 0.15);
  assert.ok(longerFade.fadeEndsAt > a.fadeEndsAt, 'a longer fade did not push fadeEndsAt later');
  assert.ok(longerFade.restoreAt > a.restoreAt, 'a longer fade did not push restoreAt later');

  // monotonic in hold: a longer hold pushes restoreAt later, but never touches
  // fadeEndsAt — the two knobs are independent
  const longerHold = hushSchedule(0.5, 0.6);
  assert.ok(longerHold.restoreAt > a.restoreAt, 'a longer hold did not push restoreAt later');
  assert.equal(longerHold.fadeEndsAt, a.fadeEndsAt, 'hold leaked into fadeEndsAt');

  // a zero hold is legal — an instant hush-and-restore, still ordered
  const noHold = hushSchedule(0.5, 0);
  assert.equal(noHold.restoreAt, noHold.fadeEndsAt);
});

test('audio.hushVoices() is safe with no AudioContext', () => {
  // createAudio(save) is contractually Node-safe until ensureCtx() succeeds,
  // and there is no `window` under node --test — so this must be a clean
  // no-op, not a crash, exactly like every other engine method's guard.
  const save = { state: () => ({ soundOn: false }), setSound() {} };
  const audio = createAudio(save);
  assert.doesNotThrow(() => audio.hushVoices());
  assert.doesNotThrow(() => audio.hushVoices({ fade: 2, hold: 1 }));
  assert.doesNotThrow(() => audio.hushVoices({}));
});

// A fake AudioContext with enough surface for ensureCtx() to build the WHOLE
// real graph (master, musicGain, the reverb, and the hush pair) rather than
// the narrower fakeAudioCtx() above, which stops short of createConvolver
// and createStereoPanner. Every connect() is recorded as a [from, to] edge so
// a test can ask a real structural question — "does this node's output reach
// that node?" — instead of trusting a comment. This is the harness the brief
// asked for: proof by reachability, or an honest admission that none exists.
function graphAudioContext() {
  const edges = [];
  const gains = [];
  const gainParam = () => ({
    value: 1,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: { connect() {} },
    resume() {},
    createGain() {
      const n = { gain: gainParam(), connect(dst) { edges.push([n, dst]); }, disconnect() {} };
      gains.push(n);
      return n;
    },
    createOscillator() {
      const n = { type: 'sine', frequency: { value: 0 }, connect(dst) { edges.push([n, dst]); }, start() {}, stop() {} };
      return n;
    },
    createBufferSource() {
      const n = { buffer: null, loop: false, connect(dst) { edges.push([n, dst]); }, start() {}, stop() {} };
      return n;
    },
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length), copyToChannel() {} };
    },
    createBiquadFilter() {
      const n = {
        type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 },
        connect(dst) { edges.push([n, dst]); },
      };
      return n;
    },
    createConvolver() {
      const n = { buffer: null, connect(dst) { edges.push([n, dst]); } };
      return n;
    },
    createStereoPanner() {
      const n = { pan: { value: 0 }, connect(dst) { edges.push([n, dst]); } };
      return n;
    },
    _edges: edges,
    _gains: gains,
  };
  return ctx;
}

test('structurally: the sit bell bypasses the hush pair; an ordinary bell does not', () => {
  // See the brief's own warning: a test that cannot fail is worse than none.
  // This one can — see task-5c-report.md for the break-it/fix-it proof (route
  // sitBell() through voicesDry/voicesWet and this assertion trips).
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);   // no listener -> placed() is null -> every call below takes the unplaced fallback path
    audio.sitBell();
    const ctx = audio.ctx;
    assert.ok(ctx, 'ensureCtx() did not build a context off the faked window');

    // ensureCtx() creates exactly four gain nodes, in this order, before any
    // voice is struck: master, musicGain, voicesDry, voicesWet. Pinning them
    // by creation order is the same trade fakeAudioCtx() above already makes
    // (reaching into strike()'s own graph because a param-table test cannot
    // see a wiring mistake); if ensureCtx() ever creates a gain node in a
    // different order this test's own assertion below on gains[0] catches it.
    const [master, , voicesDry, voicesWet] = ctx._gains;
    assert.equal(master, audio.master, 'gains[0] is not the exposed master — creation order assumption is wrong');
    assert.ok(voicesDry && voicesWet, 'ensureCtx() did not build the hush pair');

    const sitBellEdges = ctx._edges;
    const sitBellTouchesHush = sitBellEdges.some(([, to]) => to === voicesDry || to === voicesWet);
    assert.ok(!sitBellTouchesHush, 'the sit bell routed through a hush node — it would go quiet mid-sit on a page turn');
    const sitBellReachesMaster = sitBellEdges.some(([, to]) => to === master);
    assert.ok(sitBellReachesMaster, 'the sit bell never reached master at all — the harness is not wired right');

    // Contrast: an ordinary bell, struck the same way (no listener), DOES
    // route through the pair — this is what makes the assertion above mean
    // something, rather than every node just never reaching voicesDry/Wet.
    const before = ctx._edges.length;
    audio.bell({ f0: 100 });
    const bellEdges = ctx._edges.slice(before);
    assert.ok(bellEdges.some(([, to]) => to === voicesDry), 'an ordinary bell must route through voicesDry, or hushVoices() would do nothing');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});
