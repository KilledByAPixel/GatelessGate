// The room. Every pitched voice in the book sounds inside this one reverb:
// seeded noise shaped by an exponential decay, convolved — the technique from
// Frank's music_tool and loopsong projects, where it is the difference between
// an instrument and an alarm. Two refinements for this palette: the noise is
// lowpassed before enveloping (a dark tail, not hiss), and the filter closes
// further along the tail, the way real rooms swallow highs first.
// Deterministic: same seeds, same room, every run.

// The seeded noise source for every generated buffer in the audio layer.
// NOT the classic integer LCG: in JS floats its multiply overflows 2^53 and
// the degraded sequence collapses into ONE shared 10,466-sample cycle — which
// at 48 kHz is a pattern repeating 4.6 times a second. Frank heard the bug
// verbatim ("wah wah wah") in every noise bed, and the reverb tail carried it
// as a 4.6 Hz flutter-echo. Mulberry32 is 32-bit-safe (Math.imul) with a full
// 2^32 period. Returns [0, 1).
export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function reverbIR(sampleRate, seconds, seed) {
  const n = Math.round(seconds * sampleRate);
  const k = Math.log(0.001) / n;                       // -60 dB by the tail's end
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
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
