import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windParams, bellPartials, bellVoice, bellTail, BELL_REF_HZ, barPartials, GUST_A, GUST_B,
  gustPhase, windGust, gustSlope, WIND_FLAVORS, windFlavorParams, windMix, RUSTLE, rustleRate, STRIKE_SCALE, BELL_PRESETS, bellMacroPartials, applyBellPreset, NAMED_MODE_COUNT, strike,
  ceramicPartials, woodPartials, CERAMIC, WOOD, CLOTH, BREATH, WATER, CHIME, BRONZE, makeWind,
} from '../src/audio/synths.js';
import { noteForSize } from '../src/kit/cylinder.js';
import {
  parseRecipe, emitterCount, createAudio, hushSchedule, masterLevel, shouldPauseForHide, MASTER, DUCKED,
} from '../src/audio/engine.js';
import { hz, SCALES } from '../src/audio/tuning.js';
import { spatialFor } from '../src/audio/spatial.js';
import { graphAudioContext } from './helpers/audio-graph-context.js';

test('windParams monotonic and bounded', () => {
  const lo = windParams(0), hi = windParams(1);
  assert.ok(hi.gain > lo.gain && hi.cutoff > lo.cutoff);
  assert.ok(lo.gain >= 0 && hi.gain <= 1);
  const mid = windParams(0.5);
  assert.ok(mid.gain > lo.gain && mid.gain < hi.gain);
  assert.deepEqual(windParams(2), windParams(1)); // clamps
});

test('wind flavors: open is identity, unknown falls back, all values sane', () => {
  const open = windFlavorParams('open');
  assert.deepEqual(open, { bed: 1, canopy: 0, grain: 0, cutoff: 1 });
  assert.deepEqual(windFlavorParams('nonsense'), open);
  assert.deepEqual(windFlavorParams(null), open);
  for (const f of Object.values(WIND_FLAVORS)) {
    for (const v of Object.values(f)) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1.5);
  }
  assert.ok(windFlavorParams('pine').canopy > 0, 'pine has no canopy hiss');
  assert.ok(windFlavorParams('broadleaf').grain > 0, 'broadleaf has no grains');
});

test('windMix: open reproduces the old formula; canopy only speaks in gusts', () => {
  const p = windParams(0.5), open = windFlavorParams('open');
  for (const gust of [-0.8, 0, 0.6]) {
    const m = windMix(p, open, gust);
    assert.ok(Math.abs(m.bed - p.gain * (1 + gust * p.gust * 0.84)) < 1e-12);
    assert.ok(Math.abs(m.cutoff - p.cutoff * (1 + gust * p.gust)) < 1e-12);
    assert.equal(m.canopy, 0);
  }
  const pine = windFlavorParams('pine');
  const calm = windMix(p, pine, 0).canopy;
  const gusty = windMix(p, pine, 0.9).canopy;
  assert.ok(gusty > calm * 2.5, 'canopy must rise superlinearly with gust');
  // level 0 is true silence in every branch
  const z = windMix(windParams(0), pine, 0.9);
  assert.equal(z.bed, 0); assert.equal(z.canopy, 0);
});

test('rustleRate: zero without grains or level, driven by |slope|, capped', () => {
  assert.equal(rustleRate(0, 0.2, 1), 0);
  assert.equal(rustleRate(1, 0, 1), 0);
  const still = rustleRate(1, 0.2, 0);
  const moving = rustleRate(1, 0.2, 0.4);
  assert.ok(moving > still * 2, 'rustle must track the CHANGE in the wind');
  assert.ok(rustleRate(1, 1, 99) <= RUSTLE.max);
  assert.ok(rustleRate(1, 0.2, -0.4) === moving, 'sign of slope must not matter');
});

test('makeWind: flavors retune the live graph without restarting it', () => {
  const ctx = graphAudioContext();
  const dest = ctx.createGain();
  const wind = makeWind(ctx, dest);
  try {
    wind.setLevel(0.5);
    assert.equal(wind.flavor(), 'open');
    // open: the canopy branch exists but is silent
    const canopyTargets = () => ctx._gains.flatMap((g) => g.gain.targets);
    wind.setFlavor('pine');
    wind.setGust(0.8, 0);
    assert.equal(wind.flavor(), 'pine');
    assert.ok(canopyTargets().some((v) => v > 0), 'pine gusting must open some gain');
    // level 0 silences every branch
    wind.setLevel(0);
    const m = windMix(windParams(0), windFlavorParams('pine'), 0.8);
    assert.equal(m.bed, 0); assert.equal(m.canopy, 0);
  } finally {
    wind.stop();   // clears the grain timer — without this the test process hangs
  }
});

test('engine: recipe flavor reaches the wind and survives a keep', () => {
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  const ctx = graphAudioContext();
  global.window = { AudioContext: function FakeAudioContext() { return ctx; } };
  let audio;
  try {
    audio = createAudio({ state: () => ({ soundOn: true }), setSound() {} });
    audio.startAmbience(['wind:0.2:pine', 'music']);
    assert.equal(audio.debugState().layers.wind.flavor, 'pine');
    const epoch = audio.debugState().layers.wind.epoch;
    audio.transition(['wind:0.3:broadleaf', 'music']);
    assert.equal(audio.debugState().layers.wind.flavor, 'broadleaf');
    assert.equal(audio.debugState().layers.wind.epoch, epoch, 'flavor change must not restart the bed');
  } finally {
    if (audio) audio.stopAmbience();
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
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
  // not do that: BELL_MODES' detune column runs 0.55 -> 0.06 as the modes
  // climb (see its own comment in synths.js), so the HUM beats fastest
  // (1.1 Hz) and the rate slows toward the top — that spread IS the shimmer.
  const p = bellPartials(62);
  const rates = p.map((x) => x.detune * 2);
  assert.ok(new Set(rates).size > 1, 'every mode still beats at the same rate');
  assert.ok(rates[0] >= 0.6 && rates[0] <= 2.6, `the hum tone's swell is wrong: ${rates[0]} Hz`);
  // fastest on the hum, slowing upward
  assert.ok(rates[0] > rates[rates.length - 1], 'the hum does not beat fastest — the beat should slow as the modes climb');
});

test('the strike level scale is a named constant, not a magic number', () => {
  // strike() used to hard-code 0.11 as the peak scaling for every partial,
  // which is bell-sized. The odoshi's knock had to multiply its gain by 9 at
  // the call site to undo it. With four more voices arriving, each would have
  // fought the same number — so it is a parameter now.
  assert.equal(typeof STRIKE_SCALE, 'number');
  assert.ok(STRIKE_SCALE > 0 && STRIKE_SCALE < 1);
});

// ---- Task 9: the touch voices — ceramic, wood, cloth, breath --------------
//
// Seven cases answer a touch with silence (tests/staging.test.js's
// SILENT_BY_HISTORY). The palette had bronze, struck bar, bamboo, and water,
// and none of those is a robe, a pot, a tree, or a petal.

test('ceramic and wood are struck objects, each with its own decay character', () => {
  for (const [name, table] of [['ceramic', ceramicPartials(520)], ['wood', woodPartials(190)]]) {
    assert.ok(table.length >= 3, `${name} has too few modes`);
    for (const x of table) {
      assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0, `${name} has a bad partial`);
    }
    // higher modes die first — true of every struck object in the palette
    for (let i = 1; i < table.length; i++) {
      assert.ok(table[i].decay < table[i - 1].decay, `${name} mode ${i} outlasts the one below it`);
      assert.ok(table[i].amp < table[i - 1].amp, `${name} mode ${i} is louder than the one below it`);
    }
  }
  // Wood is DEAD and ceramic RINGS: that difference is the whole point of
  // having both. A quarter-second thunk versus a pot you can hear.
  assert.ok(woodPartials(190)[0].decay < 0.4, 'wood rings like a bell');
  assert.ok(ceramicPartials(520)[0].decay > 0.5, 'ceramic is as dead as wood');
  assert.ok(ceramicPartials(520)[0].decay < 2.5, 'ceramic rings like bronze');
});

test('the noise voices are quiet and pitchless, and breath is the quietest thing in the book', () => {
  // Cloth and breath have no fundamental at all — they are the only voices in
  // the palette that are pure air. A petal genuinely does not make a sound;
  // the most that is honest is a suggestion of one.
  for (const v of [CLOTH, BREATH]) {
    assert.ok(v.level > 0 && v.level < 0.2, `too loud to be ambient: ${v.level}`);
    assert.ok(v.freq > 0 && v.dur > 0);
    assert.equal(v.degree, undefined, 'a noise voice must not be pitched to the scale');
  }
  assert.ok(BREATH.level < CLOTH.level * 0.5, 'breath should be well under cloth');
  assert.ok(BREATH.freq < CLOTH.freq, 'breath sits below cloth');
  // CODE REVIEW CAUGHT: this used to compare CLOTH.level against CHIME.level
  // (0.03) with a bound of 0.08 — wrong twice over, since 0.08 does not even
  // enforce "under the chime" (nearly 3x CHIME.level would still pass), and
  // the two numbers were never commensurable anyway: CHIME/CERAMIC/WOOD/BELL
  // all pick up a further downstream multiplier (STRIKE_SCALE, or strikeBar's
  // own partial-amp split) that noiseSwell's raw `level` never does. WATER is
  // the one voice built the same way noiseSwell is — strikeDrip ramps its
  // envelope straight to `gain` (WATER.level's own downstream value), no
  // scale constant in between — so it is the one genuinely comparable "quiet
  // one-shot" reference in the palette: cloth must not outdo even a firm tap
  // on the water (WATER.level's 1.5x "loud" ceiling).
  assert.ok(CLOTH.level < WATER.level * 1.5, `cloth is louder than a firm tap on the water: ${CLOTH.level}`);
});

test('parseRecipe', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25, flavor: null });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1, flavor: null });
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

// graphAudioContext (the fake AudioContext ensureCtx()/makeSpatialBus() build
// their whole graph against, with every connect() recorded as a [from, to]
// edge) now lives in tests/helpers/audio-graph-context.js — spatial.test.js
// needs the same harness for the `at` finiteness guard, and two drifting
// copies of a fake Web Audio graph is worse than one shared one.

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

test('structurally: the four touch voices route through the hush pair, not straight to master/verb', () => {
  // The brief's own illustrative code for ceramic/wood/cloth/breath connected
  // their unplaced fallback to `master` — exactly the bug the sit bell test
  // above exists to catch on the OLD voices: a one-shot wired past
  // voicesDry/voicesWet keeps sounding after hushVoices() (a page turn) has
  // silenced everything else in the diorama. This pins the fix down.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);   // no listener -> placed() is null -> every call below takes the unplaced fallback
    audio.unlock();
    const ctx = audio.ctx;
    // Same creation-order assumption as the sit-bell test above (master,
    // musicGain, voicesDry, voicesWet) — pinned here too, so a future change
    // to ensureCtx()'s node order fails this test loudly instead of quietly
    // shifting which index "voicesDry" actually reads.
    const [master, , voicesDry] = ctx._gains;
    assert.equal(master, audio.master, 'gains[0] is not the exposed master — creation order assumption is wrong');

    for (const [name, call] of [
      ['ceramic', () => audio.ceramic({})],
      ['wood', () => audio.wood({})],
      ['cloth', () => audio.cloth({})],
      ['breath', () => audio.breath({})],
    ]) {
      const before = ctx._edges.length;
      call();
      const edges = ctx._edges.slice(before);
      assert.ok(edges.length > 0, `${name} built no graph at all`);
      assert.ok(edges.some(([, to]) => to === voicesDry),
        `${name} did not reach voicesDry — it would keep sounding after the page turned`);
    }
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

// ---- the spatial bus itself: dry/send legs, pan/tone/wet applied ----------
//
// makeSpatialBus has no caller outside engine.js, and both structural tests
// above deliberately setListener(null) to force the UNPLACED fallback — so
// the placed path, which is the entire point of this branch, had no
// graph-level coverage at all: verified by ear only. A listener off to one
// side of the source gives a real pan/distance to check, so a wrong-but-
// plausible implementation (bus.place() never called, dry and send both
// wired to the same leg, tone/pan left at their construction-time defaults)
// has somewhere to be caught.

test('structurally: a placed one-shot builds a real bus — both legs land, and pan/tone/gain are actually applied', () => {
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    // off to the right and well away, so pan and gain both move off whatever
    // a construction-time default would read as
    const listener = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
    const source = { x: 6, y: 0, z: -8 };
    // the exact numbers place() must have applied — computed independently of
    // engine.js, so a place() that got the geometry wrong (not just skipped a
    // field) fails this too
    const expected = spatialFor(source, listener);
    audio.setListener(listener);
    audio.unlock();
    const ctx = audio.ctx;
    const [master, , voicesDry, voicesWet] = ctx._gains;
    assert.equal(master, audio.master, 'gains[0] is not the exposed master — creation order assumption is wrong');

    audio.bell({ f0: 300, at: source });

    // ensureCtx()'s four gains exist before this call; makeSpatialBus() then
    // creates exactly three more (input, dryG, sendG, in that order) before
    // strikeBell() adds its own oscillator/gain nodes on top — so this slice
    // is stable regardless of how many partials the voice has.
    const [input, dryG, sendG] = ctx._gains.slice(4, 7);
    assert.ok(input && dryG && sendG, 'the bus did not build its three gain nodes in the expected order');

    // the panner and lowpass are not gain nodes and so are not in _gains, but
    // every connect() is an edge: walk input -> lowpass -> panner
    const edgesFrom = (n) => ctx._edges.filter(([from]) => from === n).map(([, to]) => to);
    const lp = edgesFrom(input)[0];
    const pan = edgesFrom(lp)[0];
    assert.ok(lp && pan, 'input did not chain lowpass -> panner the way makeSpatialBus wires it');

    assert.notEqual(pan.pan.value, 0, 'pan was never applied — still at its construction default');
    // The fake's frequency param defaults to 1, which already satisfies a
    // bare "0 < x < toneNear" range check — so a place() that set pan and
    // gain but dropped the `lp.frequency.value = s.tone` line would pass
    // that silently. Pin it to the actual number spatialFor computes for
    // this source/listener pair instead.
    assert.ok(Math.abs(lp.frequency.value - expected.tone) < 1e-9,
      `tone was not the value spatialFor computed: got ${lp.frequency.value}, expected ${expected.tone}`);

    assert.ok(edgesFrom(dryG).includes(voicesDry), 'the dry leg does not reach voicesDry');
    assert.ok(edgesFrom(sendG).includes(voicesWet), 'the send leg does not reach voicesWet');

    // and the split actually happened — a place() that forgot to set the
    // gains would leave both at gainParam's default of 1
    assert.notEqual(dryG.gain.value, 1, 'dry gain was never set from the placement');
    assert.notEqual(sendG.gain.value, 1, 'send gain was never set from the placement');
    assert.ok(dryG.gain.value > 0 && sendG.gain.value > 0, 'placement zeroed a leg out entirely');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('structurally: a punctuation chime bypasses the hush pair; an ordinary chime does not', () => {
  // chimeStrike({ punctuate: true }) belongs to the READING, not the
  // diorama — see its own comment in engine.js. A punctuation chime cut off
  // mid-sentence by hushVoices() at a page turn would be a live regression
  // this suite could not otherwise see. Same shape as the sit-bell test
  // above: no listener, so every call below takes the unplaced fallback.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);
    audio.unlock();
    const ctx = audio.ctx;
    assert.ok(ctx, 'ensureCtx() did not build a context off the faked window');

    const [master, , voicesDry, voicesWet] = ctx._gains;
    assert.equal(master, audio.master, 'gains[0] is not the exposed master — creation order assumption is wrong');

    // CODE REVIEW CAUGHT: ensureCtx() already wires voicesDry/musicGain into
    // master during setup, so reading ALL of ctx._edges here made
    // reachesMaster true before chimeStrike ever ran — it would pass for an
    // implementation that ignored `punctuate` entirely. Slice to only the
    // edges this call actually creates, same as the ordinary-chime contrast
    // below already does.
    const before = ctx._edges.length;
    audio.chimeStrike({ tube: 0, punctuate: true });
    const chimeEdges = ctx._edges.slice(before);
    const touchesHush = chimeEdges.some(([, to]) => to === voicesDry || to === voicesWet);
    assert.ok(!touchesHush, 'a punctuation chime routed through a hush node — it would cut off mid-sentence at a page turn');
    const reachesMaster = chimeEdges.some(([, to]) => to === master);
    assert.ok(reachesMaster, 'a punctuation chime never reached master at all — the harness is not wired right');

    // Contrast: an ordinary (unpunctuated) chime DOES route through the pair
    const before2 = ctx._edges.length;
    audio.chimeStrike({ tube: 0 });
    const ordinaryEdges = ctx._edges.slice(before2);
    assert.ok(ordinaryEdges.some(([, to]) => to === voicesDry),
      'an ordinary chime must route through voicesDry, or hushVoices() would do nothing');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('structurally: cylinderStrike (the large hanging cylinder) routes through the hush pair, unplaced and placed', () => {
  // task-cylinder-brief.md's own warning, twice-shipped already on this
  // branch: a voice wired past voicesDry/voicesWet keeps ringing after a
  // page turn, and a voice that never reaches placed()'s bus is never
  // spatialised. Same two checks the ordinary-chime and placed-bell tests
  // above run, aimed at the new voice specifically rather than trusting it
  // by resemblance.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);   // no listener -> placed() is null -> the unplaced fallback
    audio.unlock();
    const ctx = audio.ctx;
    const [master, , voicesDry, voicesWet] = ctx._gains;
    assert.equal(master, audio.master, 'gains[0] is not the exposed master — creation order assumption is wrong');

    const before = ctx._edges.length;
    audio.cylinderStrike({ note: 0 });
    const edges = ctx._edges.slice(before);
    assert.ok(edges.length > 0, 'cylinderStrike built no graph at all');
    assert.ok(edges.some(([, to]) => to === voicesDry),
      'an unplaced cylinderStrike did not reach voicesDry — it would keep ringing after the page turned');

    // and a PLACED call actually builds a real spatial bus — not just
    // "doesn't reach master," which an implementation that silently ignored
    // `at` and fell through to the unplaced voicesDry path would also
    // satisfy (voicesDry != master already, so that check alone proves
    // nothing about placement specifically). Same technique the placed-bell
    // test above uses: an off-axis listener/source pair with a real
    // expected pan/tone, and walk input -> lowpass -> panner to confirm
    // THIS call's own bus actually applied them.
    const listener = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 } };
    const source = { x: 4, y: 0, z: -5 };
    const expected = spatialFor(source, listener);
    audio.setListener(listener);

    const gainsBefore = ctx._gains.length;
    audio.cylinderStrike({ note: -2, at: source });
    // makeSpatialBus() creates exactly three gain nodes (input, dryG, sendG)
    // before strikeBar() adds its own oscillator/gain nodes on top — same
    // assumption the placed-bell test makes, pinned the same way.
    const [input, dryG, sendG] = ctx._gains.slice(gainsBefore, gainsBefore + 3);
    assert.ok(input && dryG && sendG, 'a placed cylinderStrike did not build the bus\'s three gain nodes');

    const edgesFrom = (n) => ctx._edges.filter(([from]) => from === n).map(([, to]) => to);
    const lp = edgesFrom(input)[0];
    const pan = edgesFrom(lp)[0];
    assert.ok(lp && pan, 'input did not chain lowpass -> panner the way makeSpatialBus wires it');
    assert.notEqual(pan.pan.value, 0, 'pan was never applied — still at its construction default');
    assert.ok(Math.abs(lp.frequency.value - expected.tone) < 1e-9,
      `tone was not the value spatialFor computed: got ${lp.frequency.value}, expected ${expected.tone}`);
    assert.ok(edgesFrom(dryG).includes(voicesDry), 'the placed dry leg does not reach voicesDry');
    assert.ok(edgesFrom(sendG).includes(voicesWet), 'the placed send leg does not reach voicesWet');
    assert.notEqual(dryG.gain.value, 1, 'dry gain was never set from the placement');
    assert.notEqual(sendG.gain.value, 1, 'send gain was never set from the placement');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test("BRONZE's register clears the 110Hz risk the bonshō's own history flagged, and stays below CHIME's", () => {
  // Code review caught a real register bug: a first draft (BRONZE.degree=-4)
  // put barPartials' amp-1.0 FUNDAMENTAL as low as ~39-78 Hz across the size
  // range — below BELL_REF_HZ=110, which bellVoice's own comment already
  // names "nearly inaudible" on typical speakers, and the bell only survives
  // that by leaning its amplitude on the 2x mode instead of the fundamental
  // (BELL_MODES), a trick barPartials does not have (CHIME shares the same
  // amp-1.0-on-the-fundamental shape and is not spared either). This is
  // exactly the failure the bonshō went through three audition passes to
  // fix (532 Hz treble ceiling, "I could barely hear it") — except a
  // register failure on the fundamental itself is worse than a missing
  // treble ceiling.
  //
  // Pinned directly: every size in the brief's stated range (0.6-1.0) must
  // clear 110 Hz with real margin, and the family must sit entirely below
  // CHIME's own register (no shared pitch class at the two families'
  // defaults).
  const sizes = [0.6, 0.7, 0.8, 0.9, 1.0];
  const freqs = sizes.map((s) => hz(BRONZE.degree + noteForSize(s), 'in'));
  for (let i = 0; i < sizes.length; i++) {
    assert.ok(freqs[i] > 140, `size ${sizes[i]} -> ${freqs[i].toFixed(1)} Hz, too close to the 110 Hz risk zone`);
  }
  const chimeMin = Math.min(hz(CHIME.degree, 'in'), hz(CHIME.degree + CHIME.tubes - 1, 'in'));
  assert.ok(Math.max(...freqs) < chimeMin,
    `BRONZE's highest note (${Math.max(...freqs).toFixed(1)} Hz) reaches into CHIME's own register (from ${chimeMin.toFixed(1)} Hz)`);
});

// ---- Task 8: silence when nobody is listening ------------------------------
//
// Hidden means silent, everywhere, except during a running sitting — that
// exemption is the owner's explicit call, not a default. `masterLevel` and
// `shouldPauseForHide` are the pure rules; pauseForHide/resumeFromHide are the
// wiring, deliberately NOT built on hushVoices() (see its own comment in
// engine.js for why a fade/hold/restore CYCLE is the wrong shape for a hold
// that can last an hour).

test('masterLevel: hidden is silent, and coming back does not un-mute you', () => {
  assert.equal(masterLevel({ soundOn: true, ducked: false, hidden: false }), MASTER);
  assert.equal(masterLevel({ soundOn: true, ducked: true, hidden: false }), DUCKED);
  assert.equal(masterLevel({ soundOn: true, ducked: false, hidden: true }), 0);
  assert.equal(masterLevel({ soundOn: false, ducked: false, hidden: false }), 0);
  // the one that matters: a muted page that was hidden and came back is STILL
  // muted. Hidden and muted are separate reasons for silence, and clearing one
  // must not clear the other.
  assert.equal(masterLevel({ soundOn: false, ducked: false, hidden: true }), 0);
  assert.equal(masterLevel({ soundOn: false, ducked: true, hidden: false }), 0);
});

test('a sitting keeps the sound alive when the page is hidden', () => {
  // Someone who sets twenty minutes and puts the laptop down came here to sit,
  // not to watch a screen. The closing bell has to ring whether or not the tab
  // is in front. Everywhere else in the book, hidden means silent.
  assert.equal(shouldPauseForHide(true, 'sitting'), false);
  assert.equal(shouldPauseForHide(true, 'off'), true);
  // 'done' is the timer run out with the reader still in the scene — the bell
  // has already rung, so there is nothing left to protect
  assert.equal(shouldPauseForHide(true, 'done'), true);
  // and a visible page is never paused, sitting or not
  assert.equal(shouldPauseForHide(false, 'sitting'), false);
  assert.equal(shouldPauseForHide(false, 'off'), false);
});

test('the engine tracks hidden as state, readable before any context exists', () => {
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const audio = createAudio(save);
  assert.equal(audio.isHidden(), false);
  audio.pauseForHide();
  assert.equal(audio.isHidden(), true, 'hidden must be set even with no AudioContext yet');
  audio.resumeFromHide();
  assert.equal(audio.isHidden(), false);
});

test('a page that loads already hidden creates its AudioContext already silent', () => {
  // The scenario main.js's boot-time hidden check exists for: a page loaded
  // in a background tab never gets a visibilitychange event (nothing changed
  // — it was never visible), so pauseForHide() has to be called once at boot,
  // before any user gesture has built a context. If master's initial gain
  // ignored `hidden`, the first unlock() (the reader's own later click, or
  // the intro's own listeners) would build a context at full volume and only
  // pull it down a beat afterward — audible. ensureCtx() reads `hidden` into
  // master's OWN gain.value at construction, so this must hold with no ramp
  // involved at all: hide, THEN build, and the context is born at 0.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.pauseForHide();                 // no context yet — must still take
    assert.equal(audio.isHidden(), true, 'hidden must be tracked with no context at all');
    audio.unlock();                       // first gesture: ensureCtx() runs now
    assert.ok(audio.ctx, 'a context was actually built');
    assert.equal(audio.master.gain.value, 0, 'master must be born silent, not silenced a beat later');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

// The three tests above are pure-function truth tables and no-context state
// tracking; these three exercise the actual wiring against a real (faked)
// AudioContext, because a correct masterLevel() and a correct
// shouldPauseForHide() are worthless if pauseForHide()/resumeFromHide() never
// call them, or call ctx.suspend() before the fade has had time to reach
// silence (a click), or leave the context permanently suspended when a
// resume was supposed to reverse it.

test('pauseForHide rides the live master gain to silence; resumeFromHide restores it (not muted)', () => {
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);
    audio.unlock();   // forces ensureCtx() so `master` exists to inspect
    const master = audio.ctx._gains[0];
    assert.equal(master, audio.master, 'creation-order assumption (gains[0] is master) no longer holds');

    const targets = [];
    const nativeSet = master.gain.setTargetAtTime.bind(master.gain);
    master.gain.setTargetAtTime = (v, t, tau) => { targets.push(v); nativeSet(v, t, tau); };

    audio.pauseForHide();
    assert.deepEqual(targets, [0], 'hiding must ramp master toward silence at once, not wait on the suspend timer');

    audio.resumeFromHide();
    assert.deepEqual(targets, [0, MASTER], 'coming back unmuted must restore full volume, not leave master at 0');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('a page muted before it was hidden is still muted when resumeFromHide runs', () => {
  // CODE REVIEW's own target case: if resumeFromHide forced master back up
  // unconditionally instead of re-deriving it from masterLevel(), this is the
  // scenario that would catch it — soundOn is false throughout, so every
  // target pushed, hidden or not, must be 0.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);
    audio.unlock();
    const master = audio.ctx._gains[0];
    const targets = [];
    const nativeSet = master.gain.setTargetAtTime.bind(master.gain);
    master.gain.setTargetAtTime = (v, t, tau) => { targets.push(v); nativeSet(v, t, tau); };

    audio.setSound(false);          // muted while still visible
    audio.pauseForHide();
    audio.resumeFromHide();
    // Guards the assertion below from passing vacuously if nothing were ever
    // recorded (e.g. a rewrite that stopped calling applyMaster() at all).
    assert.ok(targets.length >= 3, `expected at least 3 target pushes (mute, hide, resume), got ${targets.length}`);
    assert.ok(targets.every((v) => v === 0), `a muted+hidden page came back at a nonzero target: ${targets}`);
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('the suspend is deferred behind the fade, and a quick un-hide cancels it entirely', async () => {
  // Fade THEN suspend: a bare ctx.suspend() is a hard cut that can click, so
  // the real suspend() call must not happen the instant pauseForHide() is
  // called — only after the fade has had time to reach silence. And if the
  // hide is reversed before that timer fires (the tab-hide/page-turn-speed
  // overlap the brief calls out), the context must never actually suspend at
  // all, or resumeFromHide would be undoing a suspend that hadn't happened
  // yet and racing the deferred callback that still thinks it should.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  const ctx = graphAudioContext();
  let suspendCalls = 0;
  ctx.suspend = () => { suspendCalls++; ctx.state = 'suspended'; };
  const nativeResume = ctx.resume.bind(ctx);
  ctx.resume = () => { nativeResume(); ctx.state = 'running'; };
  global.window = { AudioContext: function FakeAudioContext() { return ctx; } };
  try {
    const audio = createAudio(save);
    audio.setListener(null);
    audio.unlock();
    assert.equal(ctx.state, 'running');

    // Reversed well within the 300ms fade window: must never suspend at all.
    audio.pauseForHide();
    audio.resumeFromHide();
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(suspendCalls, 0, 'a hide reversed before the fade finished still suspended the context');
    assert.equal(ctx.state, 'running');

    // Now let a hide run its full course.
    audio.pauseForHide();
    assert.equal(ctx.state, 'running', 'suspend fired before the fade had time to reach silence — that is the click');
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(suspendCalls, 1);
    assert.equal(ctx.state, 'suspended');

    audio.resumeFromHide();
    assert.equal(ctx.state, 'running', 'resumeFromHide must un-suspend the context');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('a hide/show/hide burst inside one fade window does not let the FIRST hide\'s stale timer suspend mid-way through the second fade', async () => {
  // CODE REVIEW CAUGHT: an ordinary quick alt-tab (hide, show, hide again, all
  // inside the 300ms fade-then-suspend window) used to leave the first hide's
  // deferred timer live. It would fire at its own original ~300ms mark — by
  // then only partway into the SECOND fade — and find `hidden` true and
  // `ctx.state` still 'running', so it suspended right there: a quieter
  // version of the exact click the defer exists to prevent. `hideGen` mirrors
  // hushGen — only the most recently armed timer can still match it when it
  // fires, so a superseded one is a silent no-op instead of an early cut.
  //
  // This has to use real waits (not just call the three methods back to back
  // and check synchronously) — the bug is specifically about what happens
  // when hide #1's timer callback actually FIRES at its original real-time
  // mark, not about anything observable before then.
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  const ctx = graphAudioContext();
  let suspendCalls = 0;
  ctx.suspend = () => { suspendCalls++; ctx.state = 'suspended'; };
  const nativeResume = ctx.resume.bind(ctx);
  ctx.resume = () => { nativeResume(); ctx.state = 'running'; };
  global.window = { AudioContext: function FakeAudioContext() { return ctx; } };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const audio = createAudio(save);
    audio.setListener(null);
    audio.unlock();

    audio.pauseForHide();       // hide #1 at t=0 — arms a timer for real t~300
    await wait(100);
    audio.resumeFromHide();     // shown again at t=100, well inside that window
    audio.pauseForHide();       // hide #2 at t=100 — arms its OWN timer for real t~400

    // t~320: past hide #1's original mark, well before hide #2's. If hide
    // #1's timer were not invalidated, THIS is where it would wrongly suspend
    // — only ~220ms into hide #2's own fade.
    await wait(220);
    assert.equal(suspendCalls, 0, "hide #1's stale timer suspended before hide #2's own fade finished");
    assert.equal(ctx.state, 'running');

    // t~420: past hide #2's own mark — the mechanism must still work, not be
    // permanently disabled by the guard.
    await wait(120);
    assert.equal(suspendCalls, 1, "hide #2's own timer never suspended at all");
    assert.equal(ctx.state, 'suspended');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

test('windGust keeps gustPhase\'s slow weather and adds faster texture', () => {
  // bounded
  for (let t = 0; t < 900; t += 0.31) {
    const v = windGust(t);
    assert.ok(v >= -1 && v <= 1, `out of range at ${t}: ${v}`);
  }
  // shares the slow core: correlated with gustPhase over half an hour
  let sxy = 0, sxx = 0, syy = 0;
  for (let t = 0; t < 1800; t += 0.5) {
    const x = gustPhase(t), y = windGust(t);
    sxy += x * y; sxx += x * x; syy += y * y;
  }
  const corr = sxy / Math.sqrt(sxx * syy);
  assert.ok(corr > 0.55, `lost the shared weather: corr ${corr}`);
  // and has short-lag movement gustPhase lacks — the added texture
  let dNew = 0, dOld = 0, n = 0;
  for (let t = 0; t < 1800; t += 0.5) {
    dNew += Math.abs(windGust(t + 0.25) - windGust(t));
    dOld += Math.abs(gustPhase(t + 0.25) - gustPhase(t));
    n++;
  }
  assert.ok(dNew / n > (dOld / n) * 1.3,
    `no added texture: ${dNew / n} vs ${dOld / n}`);
});

test('gustSlope is the derivative of windGust and is bounded', () => {
  for (let t = 3; t < 600; t += 7.7) {
    const h = 0.25;
    const expect = (windGust(t + h) - windGust(t - h)) / (2 * h);
    assert.ok(Math.abs(gustSlope(t) - expect) < 1e-12);
    assert.ok(Math.abs(gustSlope(t)) < 4, `implausible slope at ${t}`);
  }
});
