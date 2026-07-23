// Procedural voices. Pure param tables are tested; the node builders are browser-only.
// (Audio is exempt from the determinism rule — Math.random for noise is fine here.)

import { hz } from './tuning.js';

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

// Glass, not bronze: fewer partials, much higher, gone in about a second. A
// furin is one bright ting — a Western multi-tube chime would put far more
// events into the air than this book can absorb.
export function chimePartials(f0 = 2349) {
  return [
    [1.0, 1.0, 1.2], [2.4, 0.5, 0.8], [4.5, 0.28, 0.5], [6.8, 0.15, 0.3],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
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

export function strikeChime(ctx, dest, { f0 = hz(20), gain = 1 } = {}) {
  strike(ctx, dest, {
    partials: chimePartials(f0), gain,
    transient: { dur: 0.03, freq: 4200, q: 2.0, amp: 0.18 },
  });
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
