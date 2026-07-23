# Mood Family and Menu Music — Implementation Plan

> Executed inline (small slice, controller context), with an independent review
> at the end. Recorded here for the trail; the spec is
> `docs/superpowers/specs/2026-07-22-case-music-design.md` §3 and §5.

**Goal:** Two moods on one root — hirajōshi (dark, default) and yo (bright), a
per-case editorial pick — and the menu gets its quiet life: the swells at full
drift plus an occasional soft chime.

**Architecture:** `tuning.js` grows a `SCALES` table and a `mood` parameter on
`hz`; the engine holds the current mood and threads a live pitch closure into
the drift scheduler, so a mood change applies from the next note. Menu music is
`playMusic(0, { chimes: true })` called at the two menu seams in `main.js`;
`enter()` stops it so cases without `'music'` in their recipe stay silent. The
scheduler gains the suspended-context guard (previously flagged, now load-
bearing: the menu is reachable via skip-intro without the sound-card gesture).

## Tasks

1. **Tuning mood family.** `SCALES = { in: [0,1,5,7,8], yo: [0,2,5,7,9] }`;
   `hz(degree, mood = 'in')`; `SCALE` stays exported as `SCALES.in` for the
   drift-range maths (both scales are 5 notes, so `DRIFT_HI` is mood-blind).
   Tests: yo's degree 1 is a whole step (2^(2/12)); degree 0 identical across
   moods; default mood unchanged from today's behaviour.

2. **Engine mood + menu voice + the guard.** `createAudio` gains `mood()` /
   `setMood(m)` (default `'in'`; testable in Node — `createAudio` touches no
   AudioContext until `ensureCtx`). `chimeStrike` pitches through the current
   mood. `playMusic(emitters, opts)` forwards `{ pitch: (d) => hz(d, mood),
   ...opts }` to `makeMusic`; the scheduler uses `pitch` for swells, and with
   `chimes: true` occasionally (35% of notes) adds a soft `strikeBar` on a
   random tube degree — the menu's slow chime, no kit object needed. The timer
   callback gains `if (ctx.state !== 'running') { schedule(); return; }` so a
   suspended context can never accumulate a cluster chord.
   Tests: mood getter/setter in Node.

3. **Wiring and the proof case.** `main.js`: `menuMusic()` at the end of the
   `openMenu()` and `exit()` transitions; `enter()` AND `exit()` both call
   `audio.stopMusic()` defensively (playMusic reuses a live scheduler and
   silently drops its options, so a koan that forgot stopAmbience would eat
   the menu's chimes flag — review catch); `enter()` sets
   `audio.setMood(mod.mood)`, whose own guard maps undefined to `'in'`; the
   menu seams reset mood.
   `k7` (washing the bowl — bright, domestic) declares `mood: 'yo'` as the
   first editorial pick. Tests: k7's mood field; suite green.

Browser check (Frank): menu now has quiet swells + occasional chime after the
intro; entering k29 keeps its denser mix; entering a music-less case (k1) goes
to wind only; k7 sounds brighter than k29 once staged voices play there.
