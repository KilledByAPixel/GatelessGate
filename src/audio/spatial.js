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
  // Was 2.5 — a distance nothing in the book is ever viewed from. Every
  // case's `camera.distance` (src/koans/k*.js, default 11.5 in main.js's
  // buildKoan for the five cases that don't set their own) runs 8.6 to 17
  // across all 49 cases plus the two matter pages and the hub/menu, with
  // 11.5 both the median AND the single most common value (10 of 49 cases
  // use it outright — see task-12-report.md for the full distribution). So
  // every placed sound was being attenuated by the distance curve for no
  // reason, permanently: Frank heard it on case 16's bell as "I could barely
  // hear it." 11.5 is that measured value, not a round guess.
  ref: 11.5,
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

  const wet = wetAt(d, tune);

  return { d, pan, gain, tone, wet };
}

// The distance-only half of the wet curve, factored out of spatialFor so
// calibrateMix() below can ask "what fraction would the shared curve send at
// THIS distance" without a second copy of the formula.
export function wetAt(d, tune = SPATIAL) {
  return tune.nearWet + (tune.farWet - tune.nearWet) * (d / (d + tune.wetHalf));
}

// Pre-spatial one-shots split dry/send as `dry = 1 - verbMix*kd`,
// `send = verbMix*ks` — see each strike*() function in synths.js. The two
// coefficients are NOT uniform across voices: bell/sit-bell use 0.7/1.2,
// drip/chime use 0.85/1.4, the odoshi's knock (built inline in engine.js)
// uses 0.8/1.1. Read straight from git history at f5a12b7, the branch point
// — do not assume a family's numbers from another family's.
//
// makeSpatialBus's placed path multiplies a SHARED distance curve (gain,
// wet) by per-voice constants instead. calibrateMix() computes the pair that
// makes the two paths agree exactly at SPATIAL.ref: gain is 1 there by
// construction, so dryLevel/character only have to undo whatever
// (1-wet)/wet the shared curve already contributes at that one distance,
// landing on the voice's own old absolute dry/send. Away from ref the shared
// curve still drives the shape (nearer drier, farther wetter, behind
// duller) — only the anchor moves, per voice.
export function calibrateMix(verbMix, kd, ks, tune = SPATIAL) {
  const w = wetAt(tune.ref, tune);
  return {
    dryLevel: (1 - verbMix * kd) / (1 - w),
    character: w > 0 ? (verbMix * ks) / w : 0,
  };
}

// ---- the bus (browser-only) ----
// One of these per one-shot. The dry and wet legs are BOTH scaled by the
// distance gain, and the wet/dry RATIO is what shifts with distance — that
// ratio is the cue. Scaling only the dry leg would make a far sound swim in
// room; scaling neither would make it as loud as a near one.
//
// `character` and `dryLevel` are per-voice calibration constants from
// calibrateMix() above — not raw verbMix. Passing verbMix straight through
// as `character` was the branch's second bug: it reused a number that used
// to mean "how much of the signal is sent to the room" as though it meant
// "how much MORE than the shared distance curve already sends", collapsing
// the send by roughly an order of magnitude at the reference distance. Both
// default to 1 (no correction) for voices with no pre-spatial history to
// match — the four touch voices born on this branch need none.
//
// The send taps after the panner so the room hears the placement too: a bell
// on your left has its early reflections on your left.
export function makeSpatialBus(ctx, dry, verbIn, { character = 1, dryLevel = 1 } = {}) {
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
      dryG.gain.value = s.gain * (1 - s.wet) * dryLevel;
      sendG.gain.value = s.gain * s.wet * character;
    },
    // Not because a connected bus otherwise LEAKS — Web Audio reclaims a node
    // once nothing references it and any source feeding it has stopped,
    // disconnect() or not, so the unplaced fallback path (engine.js's
    // knock(), which never releases its own dest/dryG/sendG trio) is not
    // actually leaking either. This is belt-and-braces: cheap insurance so a
    // page left open for an hour, striking hundreds of chimes, is not left
    // holding hundreds of live buses wired into the graph at once.
    //
    // The timer is wall-clock (setTimeout), not audio-clock, so it keeps
    // running even while pauseForHide() has suspended ctx: a bell struck
    // shortly before the page is hidden can have this timer fire and cut its
    // bus loose mid-ring while the context is frozen, so the tail that would
    // have played on resume is silently gone instead. That is almost
    // certainly the outcome we want — the ring was already faded to nothing
    // by pauseForHide's own fade before the suspend ever landed — but it is
    // the one place the disconnect itself, not just the sound, has an
    // observable effect, so it is worth naming rather than leaving implicit.
    release(seconds) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        for (const n of [input, lp, pan, dryG, sendG]) { try { n.disconnect(); } catch { /* already gone */ } }
      }, Math.max(0.1, seconds) * 1000);
    },
  };
}
