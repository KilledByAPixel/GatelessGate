// The room. Every pitched voice in the book sounds inside this one reverb:
// seeded noise shaped by an exponential decay, convolved — the technique from
// Frank's music_tool and loopsong projects, where it is the difference between
// an instrument and an alarm. Two refinements for this palette: the noise is
// lowpassed before enveloping (a dark tail, not hiss), and the filter closes
// further along the tail, the way real rooms swallow highs first.
// Deterministic: same seeds, same room, every run.

export function reverbIR(sampleRate, seconds, seed) {
  const n = Math.round(seconds * sampleRate);
  const k = Math.log(0.001) / n;                       // -60 dB by the tail's end
  const out = new Float32Array(n);
  let s = seed >>> 0, lp = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const white = s / 1073741824 - 1;
    const fc = 4200 * Math.pow(0.25, i / n) + 250;     // ~4.4 kHz closing to ~1.3 kHz
    const a = 1 - Math.exp(-2 * Math.PI * fc / sampleRate);
    lp += (white - lp) * a;
    out[i] = lp * Math.exp(k * i) * 3;
  }
  return out;
}

// Browser-only. L and R get different seeds so the image decorrelates — the
// stereo width IS the difference between the ears.
export function makeVerb(ctx, dest, { seconds = 5 } = {}) {
  const conv = ctx.createConvolver();
  const buf = ctx.createBuffer(2, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  buf.copyToChannel(reverbIR(ctx.sampleRate, seconds, 1013), 0);
  buf.copyToChannel(reverbIR(ctx.sampleRate, seconds, 7331), 1);
  conv.buffer = buf;
  conv.connect(dest);
  return { in: conv };
}
