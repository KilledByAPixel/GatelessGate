# The Gateless Gate — Ambient Sound: the drift layer and the fūrin (design)

- **Date:** 2026-07-22
- **Status:** design approved; pending spec review
- **Extends:** `docs/gateless-gate-design-doc.md` §9 (Audio & Speech), revision note 8
- **Supersedes:** the M2 spec's "fold in Frank's Suno ambient tracks as a per-scene
  music bed" — those tracks are deleted (commit `5881282 remove music`) and the
  per-case `music:` track-name field with them. Nothing in this book plays a file.

## Goal

Give the book an atmosphere it currently doesn't have, without ever giving it a
soundtrack. Two layers, both synthesized, both tiny:

1. **Diegetic** — objects that make sound *because they exist in the scene*. First
   one: the fūrin, the glass wind bell, which rings when the wind actually gusts.
2. **Non-diegetic** — a sparse drift of swelled tones with no visible source, to
   carry the scenes that have nothing in them to make a noise.

The layers are not independent: **the more diegetic sound a scene makes, the less
the drift layer plays.** A scene with a chime already has a pulse and doesn't need
music; a bare hillside gets the drift at full sparseness. That relationship is
computed, not hand-tuned per case — nobody is mixing 48 scenes by hand.

Success = a scene with a fūrin rings on the gusts you can see in the grass; a scene
with nothing in it still feels inhabited; no loop is ever audible; and the whole
thing is code, no assets.

## Non-goals

- No chanting, no voice, no singing bowl (design doc §9 stands).
- No audio files, no pre-rendered tracks, no loops of any kind.
- Not in this pass: shishi-odoshi, suikinkutsu, the han, bamboo clack, water beds,
  flame crackle. They're in the palette and the architecture is built to take them;
  they're just not first.
- No per-case tuning. One tuning for the whole book (below).
- No separate music volume control in the UI. It rides the existing sound toggle.
- No drone mode yet. The drift layer may move toward drone later; it starts swelled.

## One tuning for the book

The book has one palette and one accent hue; it gets one tuning the same way. Every
pitched thing — the drift notes, the fūrin, any future chime — draws from it, so a
case can never have two things in it that disagree.

**`src/audio/tuning.js`** (new), deliberately parallel to `palette.js`:

```js
// The entire tuning. One scale for all 48 cases, the way there is one ink and
// one accent. Semitone offsets, hirajōshi — the koto tuning; the half-step at
// degree 1 is the interval that makes it unmistakable.
export const SCALE = [0, 1, 5, 7, 8];
export const ROOT_HZ = 146.83;            // D3
export const DRIFT_OCTAVES = 2;           // how far the drift layer's walk may roam
export function hz(degree) { ... }        // degree index -> Hz, wrapping octaves
```

`hz` treats `degree` as an index into the scale repeated across octaves, so degree 5
is the root an octave up. It is unbounded — `DRIFT_OCTAVES` constrains only the drift
layer's random walk, not the function; the fūrin calls `hz` with a much higher degree
and is not limited by it. Pure, and tested.

## The drift layer

### Character

**Swelled, not struck.** Attack 150–300 ms — soft enough to be clearly a different
gesture from a bell, sharp enough to keep an edge. Brief hold, then a 4–8 s release.
A detuned pair per note (the trick `strikeBell` already uses) so it beats slightly
instead of sitting dead. Sine fundamental plus two quiet harmonics under a gentle
lowpass.

The attack is the thing to protect in review. Stretch it past half a second and this
stops being an ink painting and starts being a meditation app.

### Structure

Random, but not shuffled. Four rules, all pure functions, all unit-tested with an
injected rng:

**Interval.** Next note at `t + nextInterval(...)`, drawn from 6–20 s. Scheduling
runs on `setTimeout` and the note envelopes on `ctx.currentTime` — both independent
of the sim clock, which pauses whenever the preview panel is hidden. The music
should not stop just because nothing is being drawn. Nothing quantized, no beat.

**Pitch.** `nextDegree(prev, rng)` is a weighted random walk over the scale, not a
uniform pick: adjacent degree ~60%, two away ~25%, a leap of three or four ~15%,
and never the same degree twice running. Reflects at the ends of the range rather
than clamping, so the register drifts instead of piling up at the top.

**Rests.** ~20% of the time the scheduled note is skipped entirely, producing a gap
of double length or more. This is what breaks the steady-drip quality that kills
most generative ambient — regular spacing reads as a machine no matter how random
the pitches are.

**Overlap.** Because releases run 4–8 s and intervals can be as short as 6 s, notes
sometimes ring together. That's the only harmony in the system; no chord is ever
written.

### Density

`nextInterval` scales with the number of registered sound emitters in the current
scene:

```
interval = base * min(3, 1 + 0.7 * emitterCount)
```

Zero emitters → the full 6–20 s drift. One fūrin → ×1.7. Two emitters → ×2.4, and
the drift is nearly gone. Capped at ×3 so it thins toward silence but never stops
entirely.

### Unseeded

The rest of the sim is deterministic by rule; this layer is the exception, and
deliberately so. `src/audio/**` is already exempt from the no-`Math.random` rule.
Music that replayed the same sequence every time you opened a case would become
recognizable, and recognizable is the one thing an ambient bed must never be. The
*logic* is still tested deterministically by injecting an rng — only production is
unseeded.

## The fūrin

A small glass wind bell with a clapper and a paper tag, hung under an eave. One
bright *ting*, never a cascade — a Western multi-tube chime would put far more
events into the air than this book can absorb.

### Ringing on the actual wind

The chime must ring *on* the gusts, not merely near them, or the causality is lost
and it's just decoration. The gust envelope is two incommensurate sine sums, pure JS
evaluated at the sim clock — no `AnalyserNode`, no mirroring required, because the
WebAudio graph no longer holds a copy of this math to drift out of sync with:

```js
export const GUST_A = 0.043, GUST_B = 0.071;
export const gustPhase = (t) => (Math.sin(2*Math.PI*GUST_A*t) + Math.sin(2*Math.PI*GUST_B*t)) / 2;
```

`gustPhase` is pure and tested. `gustPhase(simTime)` is the one source of truth:
`main.js`'s per-frame `tick()` feeds it to `wind.setGust(v)`, which writes it straight
into `g.gain` and `lp.frequency` as `level * (1 + gust * levelGust * k)` (`k` is 0.84
for gain, 1 for cutoff — the algebra that falls out of substituting `gustPhase` for
the old LFO sum), and the fūrin reads the same `gustPhase(simTime + offset)` for its
sway and ring threshold. The sim clock drives both; there is nothing left in the
WebAudio graph that could disagree with it.

The chime rings on a **rising crossing** of a threshold, with hysteresis so a
jittery crest can't double-fire. Because the two rates are incommensurate the sum
crests irregularly, which is already the right chime rate — no extra clock needed.

The threshold is **0.45**, measured rather than guessed: it puts crests 13.5–30 s
apart (mean 23 s). At 0.55 the mean stretches to 27 s with a 44-second hole in it,
which reads as a broken chime; at 0.25 they bunch to 9 s and read as a doorbell.
Anyone changing this number should re-measure it.

Two details that matter:

- Each instance gets a small phase offset from its seed, so two chimes in one scene
  never ring in unison.
- Ring gain scales with the wind level the case asked for. **At wind zero the chime
  is silent** — which means in case 29, stilling the flag stills the chime too. The
  interaction that's already there gets a second consequence for free.

### As a kit component

`src/kit/furin.js`, following the absolute reuse rule: the behavior lives in the
component, not the case. Wherever a fūrin is hung, it carries its sway, its hover
response, and its ring. Geometry is a small lathed bell, a clapper, and a paper tag
that flutters — it sways with the same gust phase that rings it.

Interaction follows the flag's restraint model: hover gives the tiniest motion,
click rings it. `fragment()` exposes `{ rings, gust }` for headless verification.

### Voice

Glass, not bronze: fewer partials, higher, faster decay. `chimePartials(f0)` returns
ratios near `[1.0, 2.4, 4.5, 6.8]` with falling amplitudes and ~1.2 s decay, against
the temple bell's six partials and 10 s. Pitched from `tuning.js`, several octaves up.

## Architecture

The one structural change worth making: **`strikeBell` is already a generic
inharmonic struck resonator** — partial stack, detuned pairs, filtered noise
transient. Wood, glass, bronze, bamboo and stone are that same function with a
different partial table, decay and transient. Generalize it now, while there are two
callers, so the rest of the palette costs a table each later.

```js
strike(ctx, dest, { partials, decay, transient, gain })   // the primitive
bellPartials(f0)    // existing, unchanged in output
chimePartials(f0)   // new
```

Everything pure stays pure and tested; every node builder stays browser-only. This
is the existing split in `src/audio/synths.js` and nothing here departs from it.

### Files

| File | Change |
|---|---|
| `src/audio/tuning.js` | **new** — `SCALE`, `ROOT_HZ`, `OCTAVES`, `hz(degree)` |
| `src/audio/synths.js` | generalize to `strike()`; add `chimePartials`, `gustPhase`, `GUST_A/B`, `makeSwell()`; `makeWind` exposes `setGust(v)`, driven from `gustPhase(simTime)` in `main.js` rather than its own LFOs |
| `src/audio/music.js` | **new** — `nextInterval`, `nextDegree` (pure), `makeMusic(ctx, dest)` scheduler (browser-only) |
| `src/audio/engine.js` | implement `playMusic`/`stopMusic` for real; `registerEmitter`/`emitterCount` for the density rule; parse `furin:` and `music` in `startAmbience` |
| `src/kit/furin.js` | **new** kit component; exported from `src/kit/index.js` |
| `tests/music.test.js` | **new** — walk, intervals, rests, density |
| `tests/audio.test.js` | extend — `gustPhase`, `chimePartials`, `hz` |
| `src/koans/k1.js`, `k6.js`, `k7.js`, `k37.js` | **cleanup** — drop the dead `music:` fields |

### Dead track references

Four cases still carry a `music:` field naming a deleted Suno track — `k1`
(`temple-ruin`), `k6` and `k7` (`stone-mistress`), `k37`
(`slow-stone-breath-flute`). Nothing reads them (`playMusic` is a stub), but they
are references to files that no longer exist and they encode the abandoned
one-track-per-case model. They come out.

Five tests (`k5`, `k16`, `k23`, `k40`, `k46`) assert `music === undefined` as a way
of saying "this case is deliberately silent." Those assertions still pass, but under
this design the field they're guarding no longer exists as a concept — silence is
now the absence of `'music'` from the `ambience` array. Retarget them to assert on
the recipe instead, so they keep testing the intent rather than a vestige.

### Recipe

The declarative form already parses. A case's ambience becomes, e.g.:

```js
ambience: ['wind:0.25', 'furin:0.4', 'music']
```

`music` takes no level — its level is the density rule's business, not the case's.

## Testing

Everything load-bearing is a pure function over an injected rng, so the generative
layer is testable despite being unseeded in production:

- `nextDegree` never returns the previous degree; stays in range; reflects at edges;
  the weight distribution is roughly as specified over many draws.
- `nextInterval` respects the density multiplier and its ×3 cap.
- Rest probability produces gaps at the expected rate.
- `gustPhase` is bounded, crosses the threshold at the expected irregular spacing,
  and does not repeat within a scene-length window.
- `hz` maps degrees to the right frequencies across octave wrap.
- `chimePartials` ratios and decay differ from `bellPartials` as specified.

Browser verification: enter a case with a fūrin, confirm the ring lands on a visible
gust in the grass and that stilling case 29's flag silences it.

## Open questions

- The drift layer's root (D3) is a guess to be tuned by ear against the fūrin's
  register. The scale is settled; the root is not.
- Whether the drift layer should thin out further, or stop entirely, while the sit
  timer is running. Leaning: keep it, at reduced density — the sit already has its
  bells at start and end.
