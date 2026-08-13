// The room. Every pitched voice in the book sounds inside this one reverb:
// seeded noise shaped by an exponential decay, convolved — the technique that
// makes the difference between an instrument and an alarm. Two refinements for this palette: the noise is
// lowpassed before enveloping (a dark tail, not hiss), and the filter closes
// further along the tail, the way real rooms swallow highs first.
// Deterministic: same seeds, same room, every run.

// The seeded noise source for every generated buffer in the audio layer.
// NOT the classic integer LCG: in JS floats its multiply overflows 2^53 and
// the degraded sequence collapses into ONE shared 10,466-sample cycle — which
// at 48 kHz is a pattern repeating 4.6 times a second. It was audible as a
// wah in every noise bed, and the reverb tail carried it as a 4.6 Hz
// flutter-echo. Mulberry32 is 32-bit-safe (Math.imul) with a full
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

export function reverbIR(sampleRate, seconds, seed, fcScale = 1) {
  const n = Math.round(seconds * sampleRate);
  const k = Math.log(0.001) / n;                       // -60 dB by the tail's end
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
    // ~3 kHz closing to ~0.7 kHz. The first room opened at 4.2 kHz and closed
    // to 1.3 kHz over five seconds, which is a tiled interior — correct for a
    // cave case and wrong for the other forty-eight. Outdoor air is darker at
    // the head and swallows the rest fast. fcScale darkens the OPENING only —
    // the 200 Hz floor stays, so even the snow room keeps some low-end body
    // rather than becoming a muffled blanket with nothing left below it.
    const fc = 3000 * fcScale * Math.pow(0.18, i / n) + 200;
    const a = 1 - Math.exp(-2 * Math.PI * fc / sampleRate);
    lp += (white - lp) * a;
    out[i] = lp * Math.exp(k * i) * 3;
  }
  return out;
}

// The two rooms. `open` is the book's one outdoor air, unchanged — 1.8
// seconds, not five (see makeVerb's own comment below for why). `snow` is
// case 41's: fresh snow is an open-cell absorber, so the tail is half the
// length and the head is darker — the hush of a snowfield is a ROOM
// property, not a volume property. PROVISIONAL pending an ear on the case.
export const ROOMS = {
  open: { seconds: 1.8, fcScale: 1 },
  snow: { seconds: 0.9, fcScale: 0.45 },
};

// Browser-only. L and R get different seeds so the image decorrelates — the
// stereo width IS the difference between the ears.
//
// 1.8 seconds, not five. Distance is what decides how much room a sound picks
// up now (see spatial.js) rather than a fixed per-voice mix into a long tail,
// and a long tail under a distance-driven send is just mud. The highpass on
// the RETURN is the other half of staying out of the mud: lows dry, mids and
// highs carry the space.
//
// Both rooms are always built and always connected (an idle 0.9s stereo
// convolver — two seeds, like the open room — is cheap next to the open
// room's 1.8s); setRoom crossfades
// their returns, so a page turn into case 41 darkens the air on the same
// curve every other transition rides.
export function makeVerb(ctx, dest) {
  const input = ctx.createGain();
  input.gain.value = 1;
  const returns = {};
  for (const [name, room] of Object.entries(ROOMS)) {
    const conv = ctx.createConvolver();
    const buf = ctx.createBuffer(2, Math.round(room.seconds * ctx.sampleRate), ctx.sampleRate);
    buf.copyToChannel(reverbIR(ctx.sampleRate, room.seconds, 1013, room.fcScale), 0);
    buf.copyToChannel(reverbIR(ctx.sampleRate, room.seconds, 7331, room.fcScale), 1);
    conv.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = name === 'open' ? 1 : 0;
    input.connect(conv); conv.connect(hp); hp.connect(g); g.connect(dest);
    returns[name] = g;
  }
  let current = 'open';
  return {
    in: input,
    setRoom(name) {
      current = ROOMS[name] ? name : 'open';
      const t = ctx.currentTime;
      for (const [n, g] of Object.entries(returns)) {
        g.gain.setTargetAtTime(n === current ? 1 : 0, t, 0.4);
      }
    },
    room() { return current; },
  };
}
