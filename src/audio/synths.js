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

  // Gusts: two very slow LFOs at incommensurate rates, so the breeze rises and
  // falls without ever settling into a period you can predict. In raw WebAudio a
  // connection to an AudioParam SUMS with its value, so these ride the base level.
  const lfoA = ctx.createOscillator(); lfoA.frequency.value = 0.043;
  const lfoB = ctx.createOscillator(); lfoB.frequency.value = 0.071;
  const gustGain = ctx.createGain(); gustGain.gain.value = 0;
  const gustCut = ctx.createGain(); gustCut.gain.value = 0;
  lfoA.connect(gustGain); lfoB.connect(gustGain);
  lfoA.connect(gustCut); lfoB.connect(gustCut);
  gustGain.connect(g.gain);
  gustCut.connect(lp.frequency);

  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dest);
  src.start(); lfoA.start(); lfoB.start();

  return {
    setLevel(v) {
      const p = windParams(v);
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(p.gain, t, 0.4);
      lp.frequency.setTargetAtTime(p.cutoff, t, 0.4);
      // Depths stay well under the base so a trough thins the breeze without
      // inverting it, and a crest doesn't spike. Two LFOs sum, so the real swing
      // is twice each depth.
      gustGain.gain.setTargetAtTime(p.gain * p.gust * 0.42, t, 0.4);
      gustCut.gain.setTargetAtTime(p.cutoff * p.gust * 0.5, t, 0.4);
    },
    stop() {
      for (const node of [src, lfoA, lfoB]) { try { node.stop(); } catch { /* already stopped */ } }
      g.disconnect();
    },
  };
}

export function strikeBell(ctx, dest, { f0 = 62, gain = 1 } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  for (const p of bellPartials(f0)) {
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
  const dur = 0.08;
  const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 1.2;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}
