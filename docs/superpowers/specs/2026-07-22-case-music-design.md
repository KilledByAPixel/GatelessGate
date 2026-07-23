# The Gateless Gate — Case Music: rosters, the room, and the mood family (design)

- **Date:** 2026-07-22 (evening — same day as the ambient-sound spec, after Frank
  heard the first implementation)
- **Status:** design approved in conversation; voice parameters pending Frank's
  audition (`local/audition/chime.html`, gitignored)
- **Revises:** `2026-07-22-ambient-sound-design.md`. That spec's architecture
  (tuning module, gust clock, strike primitive, drift scheduler, emitter-density
  rule) stands and is built. What changes: the fūrin's *voice* is rejected, a
  reverb becomes shared infrastructure, the "one tuning" rule widens to a
  two-mood family, and the drift layer grows into a per-case instrument-roster
  system plus menu music.

## What Frank's ears said

The shipped chime — one strike, bell-ratio partials at 2.3 kHz, bone dry — is
harsh. "A very jarring noise… it sounds really bad." Two structural reasons,
both now understood:

1. **No reverb.** Frank's own music projects (`../music_tool`, `../loopsong`)
   both treat a synthesized convolution reverb as foundational: seeded noise ×
   exponential decay fed to a `ConvolverNode`, L/R decorrelated by seed. A dry
   strike in an anechoic void reads as an alarm; the same strike with air around
   it reads as an instrument. The book's audio has no room at all.
2. **Wrong instrument.** A single loud ting every ~23 s is an *event*; Frank
   wants *weather* — a wind chime proper: several quiet tubes, long decays,
   overlapping freely, a flurry when the gust swells and silence in the lulls.

## The revised shape

### 1. The room (reverb bus)

One shared convolution reverb in the audio engine, built exactly the way
`music_tool/src/effects/seededNoise.ts` does it, with two refinements: the noise
is lowpassed before enveloping (a dark tail, not hiss), and the filter closes
further along the tail the way real rooms swallow highs first. Deterministic
(seeded), ~15 lines, no assets.

Send staging follows the music_tool lesson: **lows stay dry.** The wind bed does
not feed the verb; the chime lives mostly *in* it; drift swells sit in the same
room. Every pitched voice gets a dry/wet split, with the send level a per-voice
constant, not a per-case knob.

### 2. The chime replaces the fūrin's voice

The fūrin *object* (kit component, gust-driven, deterministic, hang-point
origin) stays. Its single-strike voice is replaced by a multi-tube wind chime:

- **Tubes:** 3–6, tuned to consecutive degrees of the case's scale. Free-free
  bar partials (1 : 2.756 : 5.404 : 8.933) — the series that makes a chime sound
  like a chime and not a bell — upper modes decaying much faster than the
  fundamental, soft low-passed mallet knock, detuned pairs.
- **Excitation** *(revised across audition rounds 3–4)*: the chime is **paced by
  its own weather, not the wind's gust.** An activity wave (periods ~21 s and
  ~32 s, gated high) brings flurries of **3–10 s separated by 16–33 s breaks**,
  active ~26% of the time; within a flurry each tube's own slow eddy scatters
  the strikes. Round 3's slower wave (flurries ~40 s, holes up to ~90 s) read
  as broken — Frank's spec is "chime for five to ten seconds, then a break." Frank tried tight gust-coupling and rejected
  it — the soundscape breathed in lockstep and chirped constantly; untied, "your
  brain fills in the details." A `couple` parameter (default 0) can blend back
  toward the audible gust. The wind level still *gates* the chime (a stilled
  scene is silent, so case 29's flag still silences it), and the visual sway
  still follows the real gust — only the strike *pacing* is free. Deterministic
  throughout; the one-ring-per-crest hysteresis is gone.
- **Future knob (Frank's inverse idea, not in this pass):** heavy wind could
  *mask* the instruments — activity scaling down as wind level rises, the way a
  real garden's delicate sounds vanish in a storm and come forward in calm.
- **Level discipline:** individual strikes are quiet — well under the wind bed —
  and loudness comes from overlap, never from any one strike.
- **Final numbers** (register, tube count, decay, density, brightness, verb mix,
  tail) come from Frank's audition page, not from this spec. The page's
  "Garden" preset is the starting guess.

### 3. The mood family (revises "one tuning for the book")

One root (D3), one scale *family*, two moods:

- **Hirajōshi** `[0, 1, 5, 7, 8]` — the shipped scale. Dark, shadowed; the
  book's default. The "minor" that isn't minor.
- **Yo** `[0, 2, 5, 7, 9]` — no half-steps, bright, open. The "major" that
  isn't major.

Same root, three shared tones; switching cases can shift mood without ever
sounding like the app changed genres. A case declares its mood (default:
hirajōshi); everything pitched in the case — tubes, drift, future voices —
draws from the declared scale. Case 5 (the man in the tree) stays dark; washing
the bowl or the oak tree can go bright. `tuning.js` grows a second scale and a
mood parameter on `hz`; nothing else about it changes.

Mood assignment is editorial, done case-by-case as cases gain sound — not a
mechanical mapping from the text.

> **Naming:** the non-diegetic layer previously called "the drift layer" is now
> **the swells** everywhere in docs and conversation (Frank couldn't retain the
> old name, which means it was wrong). Code keeps `music.js` / the `'music'`
> recipe key.

### 4. Instrument rosters (how 48 cases get sound without 48 soundtracks)

Each case's sound is a **roster** drawn from a shared voice pool:

- **Diegetic first.** Objects in the scene are automatic roster members: a
  scene with a bell has the bell's voice; a scene with a chime has the chime.
  Their sounds are driven by the scene (gusts, taps), as now.
- **Fill from the pool.** If a case has fewer than ~2 pitched voices, it draws
  fill-ins from the non-diegetic pool (drift swells, distant chime, low bell
  tone — the pool grows over time). Fill-ins are quieter and sparser than
  diegetic members: garnish, not backbone.
- The existing `ambience` recipe is the roster's declaration; the emitter-density
  rule (already built) is how diegetic presence thins the non-diegetic fill.

This replaces "drift only where nothing else sounds" with "every case reaches a
minimum of quiet life, diegetic where possible, pooled where not."

### 5. Menu music

The menu (and title) gets the drift layer plus a slow chime at low density —
tonal, simple, a bit more present than in-case since there is no scene to
compete with. Starts after the first user gesture (the existing unlock flow).
This is the drift layer's real home; the current state (music only in case 29)
was scaffolding.

## Explicitly still true

- No chanting, no voice in the music, no singing bowl, no crickets.
- No audio files for music/ambience (narration's baked mp3s are a separate,
  settled channel). Everything synthesized, everything seeded except the drift
  scheduler's note choices (unseeded by design).
- Kit components never touch the audio engine; sound leaves through callbacks.
- The determinism rule and its `src/audio/**` exemption are unchanged.
- The sim clock drives the gust for both ears and eyes (the one-clock fix).

## Order of work

1. **Frank picks the chime** on the audition page (blocking — everything sits
   in the same room at the same register).
2. Reverb bus in the engine + dry/wet sends; chime voice replaces the fūrin
   strike; k29 verified in browser.
3. `tuning.js` mood family; case-level mood declaration.
4. Menu music.
5. Roster fill-ins for the other staged cases (k1, k5, k6, k7, k14, k16, k19,
   k23, k26, k29, k37, k38, k40, k46, k47 — moods assigned editorially with
   Frank).

Each step is its own plan-and-review cycle; this spec is the umbrella.
