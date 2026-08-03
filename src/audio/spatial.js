// Where a sound is. The book used to be mono: every dry source summed into one
// master gain, with a stereo reverb behind it and nothing in front of it with a
// position. This is the missing axis.
//
// Pure and Node-tested; the node graph that applies these numbers is in the
// same file below, browser-only, per the codebase's split. Nothing here imports
// THREE — positions cross the boundary as plain {x, y, z}, which is also why
// engine.js can stay THREE-free.

export const SPATIAL = {
  // Distance at which gain is unity, and how fast it falls past that.
  // Inverse-square (rolloff 2) is far too violent for a diorama spanning
  // roughly +/-10 units — a bell across the yard would be inaudible.
  ref: 2.5,
  rolloff: 0.9,

  // Air absorption. Distance reads as FAR through the loss of highs more
  // strongly than through the loss of level, which is why this matters as much
  // as the gain curve does.
  toneNear: 20000,
  toneFar: 2500,
  toneHalf: 9,        // distance at which tone sits halfway between the two

  // How much room a sound picks up. The near end is what stops a drip at
  // arm's length sounding like a cistern; the far end is what puts a bell
  // across the yard across the yard.
  nearWet: 0.12,
  farWet: 0.55,
  wetHalf: 6,

  panWidth: 0.9,      // full hard-left/right is disorienting under an orbit

  // The poor man's HRTF: sources behind you are quieter and duller. Two
  // multiplies, and it is the whole difference between a stereo line and a
  // circle around the reader.
  backGain: 0.85,
  backTone: 0.55,
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function spatialFor(source, listener, tune = SPATIAL) {
  const p = listener.pos;
  const dx = source.x - p.x, dy = source.y - p.y, dz = source.z - p.z;
  const d = Math.hypot(dx, dy, dz);

  // A source standing exactly on the listener has no direction. Guard here
  // rather than after the divide: a NaN reaching an AudioParam throws and
  // takes the whole graph down with it.
  const inv = d > 1e-6 ? 1 / d : 0;
  const ux = dx * inv, uy = dy * inv, uz = dz * inv;

  const r = listener.right, f = listener.forward;
  const side = ux * r.x + uy * r.y + uz * r.z;
  const front = ux * f.x + uy * f.y + uz * f.z;
  const behind = front < 0;

  // No distance term in the pan, on purpose. The unit direction already does
  // it: a source 2 units to your left is hard left at arm's length and nearly
  // dead ahead from across the field, because from there it IS nearly ahead.
  const pan = clamp(side * tune.panWidth, -1, 1);

  const gain = Math.pow(tune.ref / Math.max(tune.ref, d), tune.rolloff)
    * (behind ? tune.backGain : 1);

  const tone = (tune.toneFar + (tune.toneNear - tune.toneFar) * (tune.toneHalf / (tune.toneHalf + d)))
    * (behind ? tune.backTone : 1);

  const wet = tune.nearWet + (tune.farWet - tune.nearWet) * (d / (d + tune.wetHalf));

  return { d, pan, gain, tone, wet };
}

// ---- the bus (browser-only) ----
// One of these per one-shot. The dry and wet legs are BOTH scaled by the
// distance gain, and the wet/dry RATIO is what shifts with distance — that
// ratio is the cue. Scaling only the dry leg would make a far sound swim in
// room; scaling neither would make it as loud as a near one.
//
// The send taps after the panner so the room hears the placement too: a bell
// on your left has its early reflections on your left.
export function makeSpatialBus(ctx, dry, verbIn, { character = 1 } = {}) {
  const input = ctx.createGain();

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;                    // gentle: air absorption is a slope, not a shelf

  const pan = ctx.createStereoPanner();
  const dryG = ctx.createGain();
  const sendG = ctx.createGain();

  input.connect(lp);
  lp.connect(pan);
  pan.connect(dryG); dryG.connect(dry);
  if (verbIn) { pan.connect(sendG); sendG.connect(verbIn); }

  let timer = null;

  return {
    in: input,
    place(s) {
      lp.frequency.value = s.tone;
      pan.pan.value = s.pan;
      dryG.gain.value = s.gain * (1 - s.wet);
      sendG.gain.value = s.gain * s.wet * character;
    },
    // A page left open for an hour strikes a chime hundreds of times, and a
    // bus still wired to master is still reachable from the graph. Cut it
    // loose once the voice that owns it has certainly decayed.
    release(seconds) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const n of [input, lp, pan, dryG, sendG]) { try { n.disconnect(); } catch { /* already gone */ } }
      }, Math.max(0.1, seconds) * 1000);
    },
  };
}
