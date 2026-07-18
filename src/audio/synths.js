// Procedural voices. Pure param tables are tested; the node builders are browser-only.
// (Audio is exempt from the determinism rule — Math.random for noise is fine here.)

export function windParams(level) {
  const l = Math.max(0, Math.min(1, level));
  return { gain: (0.08 + 0.22 * l) * Math.min(1, l / 0.05), cutoff: 400 + 1000 * l, lfoDepth: 0.3 + 0.5 * l };
}

export function bellPartials(f0 = 62) {
  return [
    [1.0, 1.0, 10], [1.5, 0.6, 8], [2.0, 0.45, 6], [2.66, 0.3, 4.5],
    [3.01, 0.22, 3], [4.13, 0.14, 2],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
}

export function makeWind(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(dest); src.start();
  return {
    setLevel(v) {
      const p = windParams(v);
      g.gain.setTargetAtTime(p.gain, ctx.currentTime, 0.3);
      lp.frequency.setTargetAtTime(p.cutoff, ctx.currentTime, 0.3);
    },
    stop() { try { src.stop(); } catch { /* already stopped */ } g.disconnect(); },
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
