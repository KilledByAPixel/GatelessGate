// Procedural voices. Pure param tables are tested; the node builders are browser-only.
// (Audio is exempt from the determinism rule — Math.random for noise is fine here.)

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

export function bellPartials(f0 = 62) {
  return [
    [1.0, 1.0, 10], [1.5, 0.6, 8], [2.0, 0.45, 6], [2.66, 0.3, 4.5],
    [3.01, 0.22, 3], [4.13, 0.14, 2],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
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
export const WATER = { bedLevel: 0.022, bedFreq: 650, gap: 7, degree: 17, level: 0.05, sweep: 1.35, verbMix: 0.75 };

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
  let s = 4242;
  for (let i = 0; i < nd.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    nd[i] = (s / 1073741824 - 1) * (1 - i / nd.length);
  }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = f0 * 2.2; bp.Q.value = 1.1;
  const ng = ctx.createGain(); ng.gain.value = gain * 0.5;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

// The water bed: a low burble — seeded noise through a wandering bandpass.
// The wander (two incommensurate LFO nodes, fine here: the bed ties to no
// visual, so the audio clock is the right clock) is what separates "water"
// from "static": water's colour moves. Dry, like the wind — beds stay out of
// the room.
export function makeWaterBed(ctx, dest) {
  const SR = ctx.sampleRate, LOOP = 8, XF = 0.4;
  const n = Math.floor(SR * LOOP), x = Math.floor(SR * XF);
  const raw = new Float32Array(n + x);
  let s = 777, last = 0;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const w = s / 1073741824 - 1;
    last = (last + 0.06 * w) / 1.06;
    raw[i] = last * 3;
  }
  for (let i = 0; i < x; i++) { const k = i / x; raw[i] = raw[i] * k + raw[n + i] * (1 - k); }
  const buf = ctx.createBuffer(1, n, SR);
  buf.getChannelData(0).set(raw.subarray(0, n));
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = WATER.bedFreq; bp.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(bp); bp.connect(g); g.connect(dest);

  // connections to AudioParams SUM with their value, so these ride the bases
  const lfoA = ctx.createOscillator(); lfoA.frequency.value = 0.23;
  const lfoB = ctx.createOscillator(); lfoB.frequency.value = 0.37;
  const fWob = ctx.createGain(); fWob.gain.value = WATER.bedFreq * 0.09;
  const gWob = ctx.createGain(); gWob.gain.value = 0;
  lfoA.connect(fWob); lfoB.connect(fWob); fWob.connect(bp.frequency);
  lfoA.connect(gWob); lfoB.connect(gWob); gWob.connect(g.gain);
  src.start(); lfoA.start(); lfoB.start();

  return {
    setLevel(l) {
      g.gain.setTargetAtTime(l, ctx.currentTime, 0.3);
      gWob.gain.setTargetAtTime(l * 0.125, ctx.currentTime, 0.3);
    },
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
    stop() {
      try { src.stop(); } catch { /* already stopped */ }
      g.disconnect();
    },
  };
}

// One struck resonator for the whole palette. Wood, glass, bronze, bamboo and
// stone are this same function with a different partial table, decay and
// transient — which is why generalizing it while there were two callers was
// cheaper than doing it at six.
export function strike(ctx, dest, { partials, gain = 1, transient = {} } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  for (const p of partials) {
    for (const det of [-0.35, 0.35]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq + det;
      const g = ctx.createGain();
      const peak = (p.amp * 0.11) / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.015);
      g.gain.exponentialRampToValueAtTime(peak * 0.001, t + p.decay);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + p.decay + 0.1);
    }
  }
  // the mallet: a short filtered noise burst, the part that says what hit what
  const { dur = 0.08, freq = 620, q = 1.2, amp = 0.25 } = transient;
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const ng = ctx.createGain(); ng.gain.value = amp;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

export function strikeBell(ctx, dest, { f0 = 62, gain = 1 } = {}) {
  strike(ctx, dest, { partials: bellPartials(f0), gain });
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
  let s = 12345;
  for (let i = 0; i < nd.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    nd[i] = (s / 1073741824 - 1) * (1 - i / nd.length);
  }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = f0 * 1.4; bp.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0.05 * bright;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

// The drift layer's voice. Swelled, not struck: objects strike, the air breathes,
// and the two layers must not be mistakable for each other.
//
// Guard the attack in review. Stretch it past half a second and this stops being
// an ink painting and starts being a meditation app.
export function makeSwell(ctx, dry, verbIn, { freq, gain = 1, attack = 0.22, hold = 0.4, release = 6 } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = freq * 6; lp.Q.value = 0.3;
  lp.connect(out);
  // the swells live in the same room as the chime; without a room they sit
  // flat on the page instead of behind it
  const dryG = ctx.createGain(); dryG.gain.value = verbIn ? 0.5 : 1;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = 0.9;
    out.connect(sendG); sendG.connect(verbIn);
  }

  const end = attack + hold + release;
  // a detuned pair on the fundamental so it beats gently instead of sitting dead
  for (const [mult, amp, det] of [[1, 1, -0.25], [1, 1, 0.25], [2, 0.18, 0], [3, 0.07, 0]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult + det;
    const g = ctx.createGain(); g.gain.value = amp;
    osc.connect(g); g.connect(lp);
    osc.start(t); osc.stop(t + end + 0.2);
  }

  const peak = Math.max(1e-5, gain * 0.05);
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + attack);
  out.gain.setValueAtTime(peak, t + attack + hold);
  out.gain.exponentialRampToValueAtTime(peak * 0.001, t + end);
}
