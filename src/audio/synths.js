// Procedural voices. Pure param tables are tested; the node builders are browser-only.
// (Audio is exempt from the determinism rule — Math.random for noise is fine here.)

import { mulberry32 } from './verb.js';

export function windParams(level) {
  const l = Math.max(0, Math.min(1, level));
  return {
    // A bed, not a feature. Note the gust LFOs ride ON TOP of this, so the true
    // peak is roughly gain * 1.7 — the ceiling has to leave room for that.
    gain: (0.03 + 0.07 * l) * Math.min(1, l / 0.05),   // reaches true silence at level 0
    cutoff: 320 + 700 * l,
    gust: 0.35 + 0.45 * l,                              // how far the breeze swings
  };
}

// A size-1 bell's fundamental. Bells are addressed by SIZE, not pitch — see
// bellVoice — and this is the one number that anchors the scale.
export const BELL_REF_HZ = 110;

// The bonshō, rebuilt after Frank heard the first two attempts as "a dull thud
// and then a bit of reverb, rather than a ding and then a bit of a continued
// ring." The fault was not the ring, it was that there was nothing up there TO
// ring: the old table stopped at 5.43x, so case 16's bell had no content above
// 532 Hz, in a band where the ear is barely awake. He ranked the three bell
// cases 26 > 16 > 9, which is precisely the order of their treble ceilings.
//
// So the series now runs past 15x. The upper cluster is the CLANG — it speaks
// first, dies inside a second, and leaves the hum behind; that sequence is the
// "goーn" a temple bell is named for in Japanese. The strike note at 2x leads
// the amplitude table rather than the fundamental, because a 110 Hz sine is
// nearly inaudible on the speakers anyone will actually read this book on, and
// letting it dominate spent all the headroom on something no one can hear.
//
// `attack` is per-partial and short at the top: a struck bell's high modes
// arrive in under 2 ms and that onset is what the ear reads as METAL. strike()
// used to ramp every mode over a uniform 15 ms, which turns a strike into a
// swell — the third of the three causes of the thud.
//
// `detune` is the half-width of the pair strike() splits each partial into, so
// the mode beats at twice it. NOTE: unlike the previous table's comment
// claimed, the low modes here beat FASTEST. Real bronze splits roughly in
// proportion to frequency, so this is worth revisiting at audition; it is left
// as-is for now because only the hum and strike note live long enough to be
// heard beating at all.
const BELL_MODES = [
  // ratio,  amp,  decay, detune
  [1.00,   0.50,  8.0,  0.55],   // hum — present, not dominant
  [2.00,   0.90,  5.5,  0.42],   // strike note — the pitch the bell is named by
  [2.42,   0.60,  3.5,  0.34],   // tierce
  [3.01,   0.50,  2.4,  0.28],
  [4.10,   0.55,  1.6,  0.22],   // nominal
  [5.43,   0.45,  1.0,  0.18],
  [6.81,   0.38,  0.70, 0.15],
  [8.21,   0.30,  0.50, 0.12],
  [10.10,  0.24,  0.36, 0.10],
  [12.40,  0.17,  0.26, 0.08],
  [15.10,  0.11,  0.18, 0.06],   // the clang cluster — this is the ding
];

// Task 5B, the third pass. Frank tuned three presets against the eleven modes
// above and still heard it as only "okay" — the diagnosis (task-5b-brief.md
// section on `brightness`) is that the named series stops at 15.1x, so a big
// bell's ceiling falls with its pitch: `great` at 46.6 Hz has NOTHING above
// 704 Hz, which is exactly why he hauled `brightness` to its stop on all
// three presets and `clang` to 2.59 on `great` — those controls had nothing
// left to lift. A real bell shell's modal density RISES with frequency; a
// sparse 11-partial stack cannot fake that, however well it is tuned.
//
// So above the named modes, a SHIMMER cluster: ~14 more partials from about
// 17x to about 70x, irregularly spaced (a regular series is a comb, not
// bronze) so they interleave rather than standing in a row, falling steeply
// in amplitude, and gone fast — 0.05s to 0.30s raw, so even `great` at its
// 2.36 size (0.7s) clears well inside a second and leaves the hum clean. At
// 46.6 Hz, 70x reaches 3.3 kHz: the first treble `great` has ever had.
//
// The ratios/amps/decays are a literal table, not a live RNG — generated
// once offline and pasted in, so there is no seeded generator to keep
// synchronized with the house's Math.random exemption at strike time: two
// strikes of the same bell read this same array and are the same bell, by
// construction.
//
// CODE REVIEW CAUGHT (second pass): the first version of this table used a
// log-spaced grid plus +/-7% jitter, which the reviewer correctly called a
// "jittered grid," not irregular — consecutive ratio QUOTIENTS (r[i+1]/r[i],
// the thing that is constant for a true comb and varies for an irregular
// one) only spread 1.15x, barely past the old test's threshold and visually
// still a comb. This table instead draws its 13 gaps from an EXPONENTIAL
// distribution (-ln(rand()), a Poisson point process — genuinely irregular
// spacing, with real crowding and real gaps, floored so no two modes
// collapse onto each other) over the same log(17)-log(70) span, then falls
// back to a literal table the same way. Quotient spread 1.512x (see
// tests/audio.test.js's rewritten comb test, which measures quotients, not
// Hz gaps — a log-spaced series' Hz gaps widen with frequency regardless of
// regularity, which is exactly why the first version of that test could not
// fail).
const SHIMMER_MODES = [
  // ratio,  amp,     decay
  [17.00, 0.1006, 0.273],
  [17.22, 0.0946, 0.280],
  [17.44, 0.0981, 0.280],
  [26.71, 0.0680, 0.238],
  [31.23, 0.0553, 0.216],
  [34.39, 0.0397, 0.201],
  [36.83, 0.0385, 0.217],
  [40.00, 0.0403, 0.175],
  [41.47, 0.0403, 0.197],
  [46.09, 0.0329, 0.183],
  [54.61, 0.0298, 0.142],
  [56.80, 0.0281, 0.140],
  [58.08, 0.0210, 0.110],
  [70.00, 0.0188, 0.068],
];

// Above this, a shimmer mode is wasted at best (most speakers/ears do
// little with it) and aliased at worst: `bellVoice(0.2)` — the size slider's
// low end — implies f0 550 Hz, and 72x of that cleared 39 kHz, well past a
// 44.1 kHz context's 22.05 kHz Nyquist ceiling, folding back down as a
// spurious tone rather than actually ringing. modesAt() drops any shimmer
// mode above this per VOICE (not from the table itself), since the cutoff
// in ratio-space depends on f0.
const SHIMMER_MAX_HZ = 16000;

// How many entries of a voice's partials array are the NAMED modes — the
// boundary bellMacroPartials() bands against, and where a shimmer mode
// starts (partials.slice(NAMED_MODE_COUNT)). A constant rather than a
// literal 11 so the two tables can never silently drift apart.
export const NAMED_MODE_COUNT = BELL_MODES.length;

// High modes speak almost instantly, the hum takes a beat to build — shared
// by named and shimmer modes alike, so a shimmer partial arrives exactly as
// fast as a named one at the same frequency.
function attackFor(freq) {
  return Math.max(0.0009, Math.min(0.012, 120 / freq * 0.01));
}

// Frequency goes as 1/size, decay goes as size: a bigger bell is lower AND
// rings longer, and because one number drives both they can never contradict
// each other the way a hand-set f0 and decay could.
export function bellVoice(size = 1) {
  const s = Math.max(0.15, Math.min(4, size));
  const f0 = BELL_REF_HZ / s;
  return { f0, partials: modesAt(f0, s) };
}

function modesAt(f0, s) {
  const named = BELL_MODES.map(([r, a, d, det]) => {
    const freq = f0 * r;
    return { freq, amp: a, decay: d * s, detune: det, attack: attackFor(freq) };
  });
  // Shimmer modes are all `detune: 0` — see strike()'s handling of that value.
  // A mode that dies in well under a second cannot afford a detuned pair: the
  // beat it would produce needs several seconds just to become audible, so
  // the second oscillator was pure waste, coincident with the first.
  const shimmer = SHIMMER_MODES
    .map(([r, a, d]) => {
      const freq = f0 * r;
      return { freq, amp: a, decay: d * s, detune: 0, attack: attackFor(freq) };
    })
    // dropped per VOICE, not from the table — see SHIMMER_MAX_HZ's comment.
    // A hand-sized bell (high f0) loses its top few shimmer modes; a great
    // bell (low f0) keeps all fourteen.
    .filter((p) => p.freq <= SHIMMER_MAX_HZ);
  return named.concat(shimmer);
}

// The pitch-addressed form. Eight case modules still call bell({ f0 }), and
// this keeps their pitches while giving them the new voice. Same table.
export function bellPartials(f0 = BELL_REF_HZ) {
  return modesAt(f0, BELL_REF_HZ / f0);
}

// How long a spatial bus must stay open before it is safe to release — see
// `BELL`'s own comment for why this used to be a flat constant and why that
// was wrong: decay is now coupled to size, so the hum's actual length varies
// per call (k9's f0:49 implies a hum decay near 18s) and a fixed number sized
// to whatever pitch someone had in mind when they wrote it will silently cut
// a bigger bell's tail short — release() in spatial.js disconnects the bus
// unconditionally at the time it is given, so there is no second chance.
// +0.5s covers strike()'s own `decay + 0.1` osc.stop() margin plus the last
// sliver of its exponential ramp to -60dB, which is inaudible but not zero.
export function bellTail(voice) {
  return Math.max(...voice.partials.map((p) => p.decay)) + 0.5;
}

// A chime tube is a free-free bar, whose mode series is famously inharmonic:
// 1 : 2.756 : 5.404 : 8.933. That series is WHY a wind chime sounds like a
// wind chime and not a bell — the first voice here used bell-ish ratios at
// 2.3 kHz, bone dry, and Frank rightly called it an alarm. Upper modes die
// much faster than the fundamental.
export function barPartials(f0, decay = 5) {
  return [
    [1.000, 1.00], [2.756, 0.32], [5.404, 0.11], [8.933, 0.04],
  ].map(([r, a]) => ({ freq: f0 * r, amp: a, decay: decay * Math.pow(0.45, Math.log2(r)) }));
}

// The shipped chime — Frank's audition numbers (the "Garden" preset).
export const CHIME = { degree: 8, tubes: 5, decay: 5, level: 0.03, bright: 0.35, verbMix: 0.7 };

// The shipped water — Frank's audition numbers (the "Basin" preset). Drips are
// pitched to the scale in a high register, so every basin in the book is
// quietly a suikinkutsu.
export const WATER = { bedLevel: 0.022, bedTone: 2200, gap: 7, degree: 17, level: 0.05, sweep: 1.35, verbMix: 0.75 };

// A drip is a detaching bubble, and a bubble's pitch RISES as it necks off
// (Minnaert resonance) — a falling sweep reads as a laser, a rising one as
// water. An impact tick, then the bubble speaks.
export function strikeDrip(ctx, dry, verbIn, { f0, gain = WATER.level, sweep = WATER.sweep, verbMix = WATER.verbMix } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const dryG = ctx.createGain(); dryG.gain.value = 1 - verbMix * 0.85;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = verbMix * 1.4;
    out.connect(sendG); sendG.connect(verbIn);
  }

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0 / sweep, t);
  osc.frequency.exponentialRampToValueAtTime(f0, t + 0.025);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(gain * 0.001, t + 0.16);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + 0.2);

  const dur = 0.008;
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  const rand = mulberry32(4242);
  for (let i = 0; i < nd.length; i++) {
    nd[i] = (rand() * 2 - 1) * (1 - i / nd.length);
  }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = f0 * 2.2; bp.Q.value = 1.1;
  const ng = ctx.createGain(); ng.gain.value = gain * 0.5;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

// The shishi-odoshi's knock — struck bamboo on stone: hollow, woody, dry.
// Few, loosely-stretched partials (the knock lands on the tube's body, so the
// series is loose), everything gone fast; the character is mostly the
// TRANSIENT — wood on stone — with the tube's low "aw" underneath.
// Frank's audition numbers (the "Garden clock" preset).
export const ODOSHI = { f0: 220, level: 0.11, decay: 0.35, verbMix: 0.5, pourLevel: 0.03, period: 32 };

export function bambooPartials(f0 = ODOSHI.f0, decay = ODOSHI.decay) {
  return [
    [1.00, 1.00], [2.28, 0.40], [3.85, 0.16], [5.10, 0.07],
  ].map(([r, a]) => ({ freq: f0 * r, amp: a, decay: decay * Math.pow(0.5, Math.log2(r)) }));
}

// the tube emptying: a short burst of the water-static, swelling and dying
export function pourBurst(ctx, dest, { level = ODOSHI.pourLevel, dur = 1.3 } = {}) {
  const t0 = ctx.currentTime;
  const n = Math.ceil(ctx.sampleRate * dur);
  const nb = ctx.createBuffer(1, n, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  const rand = mulberry32(60660);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    last = (last + 0.4 * w) / 1.4;
    nd[i] = last * 1.2;
  }
  const src = ctx.createBufferSource(); src.buffer = nb;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(level, t0 + 0.25);
  g.gain.setValueAtTime(level, t0 + dur - 0.5);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

// The water bed — Frank's spec, arrived at over three auditions: "like the
// wind but a little more staticky." So it IS the wind's architecture: a LONG
// seeded noise loop (14s — short loops are audibly periodic), wide gentle
// filters, and only SLOW swells (the gust idiom). Whiter noise and a higher
// band make the static. Nothing modulates fast, nothing sweeps, nothing
// resonates — the three lessons of the wah, in order of discovery: a swept
// resonance is a wah pedal, a 2 Hz tremolo is a wah rhythm, and a short-cycle
// RNG is a comb filter wearing a noise costume. Dry, like the wind — beds
// stay out of the room.
export function makeWaterBed(ctx, dest) {
  const SR = ctx.sampleRate, LOOP = 14, XF = 1.2;
  const n = Math.floor(SR * LOOP), x = Math.floor(SR * XF);
  const raw = new Float32Array(n + x);
  const rand = mulberry32(31337);
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rand() * 2 - 1;
    last = (last + 0.35 * w) / 1.35;          // much whiter than the wind's brown
    raw[i] = last * 1.15;
  }
  for (let i = 0; i < x; i++) { const k = i / x; raw[i] = raw[i] * k + raw[n + i] * (1 - k); }
  const buf = ctx.createBuffer(1, n, SR);
  buf.getChannelData(0).set(raw.subarray(0, n));
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 300;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = WATER.bedTone; lp.Q.value = 0.4;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);

  // slow water-swells, the gust idiom: connections SUM onto the params
  const lfoA = ctx.createOscillator(); lfoA.frequency.value = 0.053;
  const lfoB = ctx.createOscillator(); lfoB.frequency.value = 0.083;
  const gWob = ctx.createGain(); gWob.gain.value = 0;
  const cWob = ctx.createGain(); cWob.gain.value = 260;
  lfoA.connect(gWob); lfoB.connect(gWob); gWob.connect(g.gain);
  lfoA.connect(cWob); lfoB.connect(cWob); cWob.connect(lp.frequency);
  src.start(); lfoA.start(); lfoB.start();

  return {
    setLevel(l) {
      g.gain.setTargetAtTime(l, ctx.currentTime, 0.3);
      gWob.gain.setTargetAtTime(l * 0.18, ctx.currentTime, 0.3);
    },
    gain() { return g.gain.value; },   // headless probe read; never drives anything
    stop() {
      for (const node of [src, lfoA, lfoB]) { try { node.stop(); } catch { /* already stopped */ } }
      g.disconnect();
    },
  };
}

// The gust envelope. Two very slow incommensurate sine sums: the breeze rises
// and falls without ever settling into a period you could predict. This is pure
// JS, evaluated at the sim clock — makeWind's setGust(v) and the fūrin's own
// gustPhase read the SAME clock, so what you HEAR gusting and what you SEE
// ringing are the same weather. That causality is the entire point of the wind
// chime, and it only holds if there is exactly one clock driving both.
export const GUST_A = 0.043;
export const GUST_B = 0.071;
export const gustPhase = (t) =>
  (Math.sin(2 * Math.PI * GUST_A * t) + Math.sin(2 * Math.PI * GUST_B * t)) / 2;

export function makeWind(ctx, dest) {
  const SR = ctx.sampleRate;
  const LOOP = 10;        // a 2s loop is short enough that the ear hears it repeat
  const XF = 0.5;         // crossfade the overhang back over the head: no seam click
  const n = Math.floor(SR * LOOP);
  const x = Math.floor(SR * XF);

  const raw = new Float32Array(n + x);
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;    // leaky integrator -> brown noise
    raw[i] = last * 3.5;
  }
  for (let i = 0; i < x; i++) {
    const k = i / x;
    raw[i] = raw[i] * k + raw[n + i] * (1 - k);
  }
  const buf = ctx.createBuffer(1, n, SR);
  buf.getChannelData(0).set(raw.subarray(0, n));

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = ctx.createBiquadFilter();          // drop subsonic drift from the integrator
  hp.type = 'highpass'; hp.frequency.value = 45;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start();

  // The gust is driven from gustPhase(simTime) in JS rather than from oscillators
  // in this graph. The sim clock is then the one source of truth for both the
  // audible wind and the fūrin's visible ring, so the two cannot drift apart —
  // which was the whole point of pairing a chime with this synth.
  let params = windParams(0);
  let gust = 0;
  function apply() {
    const t = ctx.currentTime;
    g.gain.setTargetAtTime(params.gain * (1 + gust * params.gust * 0.84), t, 0.4);
    lp.frequency.setTargetAtTime(params.cutoff * (1 + gust * params.gust), t, 0.4);
  }

  return {
    setLevel(v) {
      params = windParams(v);
      apply();
    },
    setGust(v) {
      gust = v;
      apply();
    },
    gain() { return g.gain.value; },   // headless probe read; never drives anything
    stop() {
      try { src.stop(); } catch { /* already stopped */ }
      g.disconnect();
    },
  };
}

// The peak level one partial reaches, per unit amplitude. Bell-sized, because
// the bell is what strike() was written for — every other voice scales relative
// to it. A parameter rather than a literal so a voice with a different natural
// loudness (a knock is a THUMP, a breath is barely there) says so in its own
// table instead of undoing this number at its call site.
export const STRIKE_SCALE = 0.11;

// One struck resonator for the whole palette. Wood, glass, bronze, bamboo and
// stone are this same function with a different partial table, decay and
// transient — which is why generalizing it while there were two callers was
// cheaper than doing it at six.
//
// `transientGain` defaults to `gain` so every caller that never knew this
// split existed (bar, bamboo, sit bell, drip — none of them pass it) keeps
// behaving exactly as before, one number scaling the whole strike. Only
// strikeBell() passes them apart now, so BELL.level — which moves whenever
// the partial table does, as it just did for the shimmer cluster — can no
// longer silently rescale the mallet too. See BELL's own comment and
// TRANSIENT_SCALE for why that split exists.
export function strike(ctx, dest, { partials, gain = 1, transient = {}, scale = STRIKE_SCALE, transientGain = gain } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dest);
  const partialsBus = ctx.createGain();
  partialsBus.gain.value = gain;
  partialsBus.connect(out);
  for (const p of partials) {
    // A partial is normally a PAIR, split either side of its centre; the
    // difference is what beats. Per-partial when the table says so,
    // otherwise the old fixed width, so bronze can breathe unevenly while
    // bar and bamboo do not move. `detune: 0` is the one exception: an
    // EXPLICIT zero (not the absent-field fallback) means a mode dies too
    // fast for a beat to ever be heard — the shimmer cluster's case, at
    // 0.05-0.30s a 0.3 Hz beat would need three seconds just to show up —
    // so it gets a single oscillator at full peak instead of two coincident
    // sines at half peak each (an earlier reviewer's catch: that pair was
    // pure waste, not a beat).
    const explicitZero = p.detune === 0;
    const det = Number.isFinite(p.detune) ? p.detune : 0.35;
    // Per-partial attack, defaulting to the old fixed 15 ms so bar/bamboo/
    // sit-bell — none of which sets `attack` — ramp exactly as before. Only
    // the bonshō's table opts into a shorter, per-mode rise.
    const rise = Number.isFinite(p.attack) ? p.attack : 0.015;
    if (explicitZero) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq;
      const g = ctx.createGain();
      const peak = p.amp * scale;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + rise);
      g.gain.exponentialRampToValueAtTime(peak * 0.001, t + p.decay);
      osc.connect(g); g.connect(partialsBus);
      osc.start(t); osc.stop(t + p.decay + 0.1);
    } else {
      for (const sign of [-1, 1]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = p.freq + sign * det;
        const g = ctx.createGain();
        const peak = (p.amp * scale) / 2;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + rise);
        g.gain.exponentialRampToValueAtTime(peak * 0.001, t + p.decay);
        osc.connect(g); g.connect(partialsBus);
        osc.start(t); osc.stop(t + p.decay + 0.1);
      }
    }
  }
  // the mallet: a short filtered noise burst, the part that says what hit what.
  // `transient` is one spec or an ARRAY of them — a real strike can be two
  // events at once (a beam's thump AND the bronze's own ping), which one bare
  // object could never express. A single spec keeps working unchanged.
  const transientBus = ctx.createGain();
  transientBus.gain.value = transientGain;
  transientBus.connect(out);
  for (const spec of Array.isArray(transient) ? transient : [transient]) {
    const { dur = 0.08, freq = 620, q = 1.2, amp = 0.25 } = spec;
    const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const ng = ctx.createGain(); ng.gain.value = amp;
    nsrc.connect(bp); bp.connect(ng); ng.connect(transientBus);
    nsrc.start(t);
  }
}

// The temple bell. The only pitched voice in the book that never took a room —
// see the sit bell's comment below: a dry bell reads as a thud at ANY pitch,
// a lesson learned on the inkin and never back-ported to the bonshō. `degree`
// and `level` sit alongside the routing fields for the callers that pitch and
// gain by them, matching the shape of every other voice's table.
//
// `level`: the partial table (named + shimmer) now sums to 5.4137 against
// the pre-Task-5A table's 2.47 (a real bonshō's upper register is loud, not
// an afterthought), so a straight swap would have played the rebuilt bell
// more than twice as loud and risked clipping. 2.47 / 5.4137 = 0.4563 brings
// the voice's summed peak back to that same original reference — level, not
// either table, is what moves to fix this, so what Frank hears at audition
// is not also fighting an unrelated loudness jump. (Task 5A's own migration,
// for the 11-mode-only table, landed on 0.5255 = 2.47 / 4.70 the same way;
// the shimmer cluster's added 0.7137 is why this number moved again.)
//
// There used to be a `tail: 16` here for the spatial bus's release timer. A
// code review caught it: k9's f0:49 implies a hum decay near 18s, so a flat
// 16s release would cut that hum audibly short the moment a bell call site
// gets a position (today none do, so it was latent — but the spatial
// migration is a later task in this plan and would have hit it live). See
// `bellTail()`, which derives the release from the voice actually struck.
export const BELL = { degree: 0, level: 0.4563, size: 1, verbMix: 0.7 };

// The mallet's OWN calibration, decoupled from BELL.level and frozen at what
// it was worth when Frank tuned beam/ping/pingFreq on the audition page
// (Task 5A's 0.5255). CODE REVIEW CAUGHT, deferred from Task 5A: the level
// correction above is computed purely from the PARTIAL table's amplitude
// sum, but strike() used to apply that single `gain` to the whole strike —
// partials AND the mallet transient together — so every future change to
// the partial table (this task's shimmer cluster included) silently
// rescaled the mallet too, landing it well under what its own amp numbers
// say. Freezing this constant means beam/ping keep meaning what Frank's ear
// approved however BELL.level moves from here on — see strike()'s
// `transientGain` param, which is how the two are kept apart.
export const TRANSIENT_SCALE = 0.5255;

// Non-overlapping macro bands over a struck voice's partials, by MODE INDEX
// — never by an absolute Hz threshold, which is exactly what made the old
// `brightness`/`clang` sliders (freq > 700, top four) impossible to reason
// about: the same slider covered a different set of modes at every size.
// `ring` only stretches the NAMED modes' decay — the sustained tone Frank
// actually hears ring on — not the shimmer, whose entire design goal is to
// be gone well inside a second (see SHIMMER_MODES' comment); letting `ring`
// scale it too would stretch `great`'s shimmer past a second at its own
// ring of 3.00, undoing that goal on the very first preset to use it.
//
// This stays as an AUDITION control — the four bands are a good way to
// explore a bell by ear — but a SHIPPED preset no longer stores band values
// (see BELL_PRESETS below for why: two boundary redefinitions in three
// passes already changed what a stored band value meant, silently). The
// audition page bakes whatever this function currently produces into an
// exact per-mode array before it prints a preset.
export function bellMacroPartials(voice, { hum = 1, body = 1, clang = 1, shimmer = 1, ring = 1 } = {}) {
  return voice.partials.map((p, i) => {
    const named = i < NAMED_MODE_COUNT;
    const band = i === 0 ? hum : i <= 5 ? body : named ? clang : shimmer;
    return { ...p, amp: p.amp * band, decay: named ? p.decay * ring : p.decay };
  });
}

// Frank's three audition presets, baked as an EXACT per-mode amplitude
// multiplier per named mode — `ampMult[i]` is precisely the multiplier his
// ORIGINAL, overlapping `brightness`/`hum`/`clang` sliders produced on mode
// `i`, computed directly from that old formula (freq > 700 for brightness,
// index 0 for hum, top-four-BY-INDEX for clang), not through any macro band
// defined later. Zero residual, by construction — there is nothing to fit
// or approximate here, which is the whole point: a stored preset must not
// mean something different every time a macro's band boundary moves, and
// this round moved one (see the correction below).
//
// CODE REVIEW CAUGHT — this was shipped as a lossy amplitude-weighted fit
// onto four bands, and TWO things about that were wrong, not one:
//
// 1. The fit itself was the wrong shape of failure: an amplitude-weighted
//    least-squares fit places its largest ERROR on the LOUDEST partial by
//    construction (a large absolute deviation on a loud mode costs the same
//    in the objective as a large deviation on a quiet one, so the fit
//    "spends" its budget evening out relative error, not absolute). On
//    `hand`, mode 1 — amp 0.90, the STRIKE NOTE, the pitch a bell is
//    literally named by — shipped at a +140% multiplier (2.16 actual vs.
//    the tuned 0.90). That is not a rounding drift; it is a different bell
//    than the one Frank approved. Exact per-mode storage has no fitting
//    error to place anywhere.
//
// 2. My own causal explanation for the worst residual (`great` mode 6,
//    +156%) was WRONG and shipped anyway. I attributed it to the old
//    `brightness > 700 Hz` threshold cutting across the new index-based
//    clang band. It does not: `great` has exactly ONE mode above 700 Hz
//    (mode 10, at 703.9 Hz — the diagnosis table's other, already-flagged
//    inconsistency), and mode 6 (317 Hz) was never anywhere near that
//    threshold. The real cause is a boundary the brief itself moved without
//    saying so: the OLD `clang` macro was top-FOUR by index — modes 7-10 —
//    while the brief defines the NEW `clang` band as modes 6-10, five wide.
//    Mode 6 therefore received NEITHER macro under the old scheme (its old
//    effective multiplier is 1, untouched) and receives the new `clang`
//    band's fitted value under the new one. Had the new band matched the
//    old grouping (modes 7-10, with mode 6 left in `body`) the fit would
//    have been substantially better on every preset with no other change:
//    `great` clang alone improves from {+156%, -67%} to roughly {+27%,
//    -58%}, and `hand`/`temple` body improve too, since mode 6 stops being
//    forced into whichever band it lands in. This stopped mattering for
//    correctness the moment presets became exact arrays — but the WRONG
//    explanation should not stand uncorrected in the historical record; see
//    task-5b-report.md's fix section for the full recomputation.
//
// `shimmer` still has no old-macro history to reproduce — the cluster did
// not exist when Frank tuned these three presets — so it stays a single
// scalar (not folded into the array padded with fourteen 1s: there is no
// fidelity target to encode for those modes, and a scalar says that
// honestly) at 1, the cluster's own designed balance, pending his ear on
// the A/B toggle.
//
// `size`/`ring`/`beam`/`ping`/`pingFreq`/`verbMix` are copied verbatim from
// the brief's top table — untouched, as always.
export const BELL_PRESETS = {
  hand: {
    size: 0.38, ring: 1.43,
    ampMult: [1.12, 1.00, 3.00, 3.00, 3.00, 3.00, 3.00, 2.94, 2.94, 2.94, 2.94],
    shimmer: 1, beam: 0.18, ping: 0.30, pingFreq: 3400, verbMix: 0.50,
  },
  temple: {
    size: 0.78, ring: 2.65,
    ampMult: [1.00, 1.00, 1.00, 1.00, 1.00, 3.00, 3.00, 4.56, 4.56, 4.56, 4.56],
    shimmer: 1, beam: 0.30, ping: 0.34, pingFreq: 2800, verbMix: 0.70,
  },
  great: {
    size: 2.36, ring: 3.00,
    ampMult: [1.43, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 2.59, 2.59, 2.59, 7.77],
    shimmer: 1, beam: 0.42, ping: 0.30, pingFreq: 2200, verbMix: 0.85,
  },
};

// Applies a BELL_PRESETS entry to a bellVoice() — exact per-mode multiply
// for the named modes (`ampMult[i]`), one scalar for every surviving
// shimmer mode, `ring` stretching only the named modes' decay (see
// bellMacroPartials' comment for why).
//
// Then RENORMALIZED back to what the same, undressed voice would have
// summed to (`rawSum`) — a per-voice ratio, not a hardcoded constant, so it
// keeps working as the Nyquist trim removes a different number of shimmer
// modes at every size. CODE REVIEW CAUGHT: `BELL.level` is calibrated
// against that undressed sum (5.4137 at size 1 — see BELL's own comment),
// but Frank's per-mode multipliers push a dressed voice's sum well past it
// — measured at size 1's table: hand 2.24x, temple 1.85x, great 1.39x,
// reaching a summed peak of ~0.60 against the 0.2717 reference BELL.level
// was calibrated to hold, a real clip risk on a path no case calls yet.
// Renormalizing here means BELL.level's calibration is valid for every
// preset AND the bare `size`/`f0` forms, always, without a second constant
// to keep in sync — and it changes nothing about the SHAPE Frank tuned: a
// single scalar over the whole voice moves every mode by the same amount,
// so every ratio between two of `ampMult`'s entries survives exactly.
export function applyBellPreset(voice, preset) {
  const dressed = voice.partials.map((p, i) => {
    const mult = i < NAMED_MODE_COUNT ? preset.ampMult[i] : preset.shimmer;
    const decay = i < NAMED_MODE_COUNT ? p.decay * preset.ring : p.decay;
    return { ...p, amp: p.amp * mult, decay };
  });
  const rawSum = voice.partials.reduce((s, p) => s + p.amp, 0);
  const dressedSum = dressed.reduce((s, p) => s + p.amp, 0);
  const norm = rawSum / dressedSum;
  return dressed.map((p) => ({ ...p, amp: p.amp * norm }));
}

export function strikeBell(ctx, dry, verbIn, { partials, gain = 1, verbMix = BELL.verbMix, beam = 0.30, ping = 0.34, pingFreq = 2800 } = {}) {
  const out = ctx.createGain();
  out.gain.value = 1;
  const dryG = ctx.createGain(); dryG.gain.value = 1 - verbMix * 0.7;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = verbMix * 1.2;
    out.connect(sendG); sendG.connect(verbIn);
  }
  // The bonshō is struck with a suspended WOODEN BEAM — but the beam is only
  // half the event. Task 5 replaced the mallet's bright tick with the beam's
  // low thump instead of layering them, and that trade IS the thud Frank
  // heard: a real strike is wood landing AND bronze answering, at once.
  // `beam`/`ping`/`pingFreq` default to the pre-preset hardcoded numbers, so
  // the eight `bell({ f0 })` call sites (none of which pass these) sound
  // exactly as before.
  strike(ctx, out, {
    partials,
    gain: gain * BELL.level,
    transientGain: gain * TRANSIENT_SCALE,
    transient: [
      // the beam: low, woody, with body
      { dur: 0.055, freq: 350, q: 0.8, amp: beam },
      // and the bronze answering it
      { dur: 0.006, freq: pingFreq, q: 0.9, amp: ping },
    ],
  });
}

// ---- the sit bell ----
// The inkin: the small hand bell that opens and closes a sitting. It is NOT the
// book's temple bell. The timer used to ring bellPartials at 70 Hz straight into
// master, and Frank heard it for what it was — "such a low thud... it should be
// a nice ting, a ding kind of bell". Three things make that difference and all
// three are here: a small bell's pitch (degree 15 is the root four octaves up,
// the same note in either mood), a hard bright tick for the mallet, and a heavy
// send to the room. A dry bell reads as a thud at ANY pitch.
//
// Raised from 0.80 against the shorter room (verb.js went 5s -> 1.8s). The sit
// bell belongs to the READER, not to any diorama — it is never spatialized and
// it is the one sound in the book allowed to be pure room.
export const SIT_BELL = { degree: 15, level: 0.45, verbMix: 0.92 };

// A small bell's modes are near-harmonic with a slight stretch — that stretch is
// the shimmer. Long on the fundamental (a struck inkin rings for ten seconds),
// and the upper modes die away quickly, which is what leaves a clean pitch
// hanging in the room instead of a clang.
export function sitBellPartials(f0 = 1174) {
  return [
    [1.0, 1.0, 9], [2.02, 0.5, 5], [3.01, 0.26, 3], [4.21, 0.14, 1.8], [5.43, 0.07, 1.1],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
}

export function strikeSitBell(ctx, dry, verbIn, { f0 = 1174, gain = SIT_BELL.level, verbMix = SIT_BELL.verbMix } = {}) {
  const out = ctx.createGain();
  out.gain.value = 1;
  const dryG = ctx.createGain(); dryG.gain.value = 1 - verbMix * 0.7;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = verbMix * 1.2;
    out.connect(sendG); sendG.connect(verbIn);
  }
  strike(ctx, out, {
    partials: sitBellPartials(f0),
    gain,
    transient: { dur: 0.02, freq: f0 * 2.6, q: 1.0, amp: 0.35 },
  });
}

export function strikeBar(ctx, dry, verbIn, { f0, gain = 1, decay = CHIME.decay, bright = CHIME.bright, verbMix = CHIME.verbMix } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;

  // The ear peaks around 2-5 kHz; a gentle low-Q roll-off is the whole
  // difference between shimmer and pierce.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700 + 4200 * bright;
  lp.Q.value = 0.2;
  lp.connect(out);

  // the chime lives mostly in the room; the beds stay dry (mud avoidance:
  // lows dry, mids and highs carry the space)
  const dryG = ctx.createGain(); dryG.gain.value = 1 - verbMix * 0.85;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = verbMix * 1.4;
    out.connect(sendG); sendG.connect(verbIn);
  }

  for (const p of barPartials(f0, decay)) {
    for (const det of [-0.22, 0.22]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq + det;
      const g = ctx.createGain();
      const peak = p.amp / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(peak * 0.0008, t + p.decay);
      osc.connect(g); g.connect(lp);
      osc.start(t); osc.stop(t + p.decay + 0.05);
    }
  }

  // the mallet: a soft knock, not a click — seeded, the same knock every time
  const dur = 0.02;
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  const rand = mulberry32(12345);
  for (let i = 0; i < nd.length; i++) {
    nd[i] = (rand() * 2 - 1) * (1 - i / nd.length);
  }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = f0 * 1.4; bp.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0.05 * bright;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

// The drift layer's voice: THE FAR BELL. The original "swelled" voice — a
// sourceless synthesized tone — was the one sound in the book with no physical
// referent, and Frank's ears rejected it twice ("the lone notes are harsh").
// Everything that works here is a physical event: wind, struck tubes, struck
// bronze, falling water. So the background layer is now rebuilt from the voice
// that already works — the chime's own bar, pitched low, at a fraction of the
// chime's loudness, almost entirely room: someone far away touched a chime.
//
// gain calibrated to the WET path, which at verbMix 0.97 is the voice: the
// verb send returns straight to master and never passes musicGain, so the
// audition's 0.012 (into a 0.9 master) maps to 0.0135 here. The dry sliver
// lands at half its audition level — inaudible at a 22% dry fraction, and a
// first calibration to the dry path shipped the wet 6 dB hot (review catch).
//
// Raised from 0.92 for the same reason. This voice is DEFINED as distance —
// "someone far away touched a chime" — so it pins to the far end of the wet
// curve and never moves, rather than being placed like a thing in the scene.
export const FARBELL = { gain: 0.0135, decay: 7, bright: 0.2, verbMix: 0.97 };
