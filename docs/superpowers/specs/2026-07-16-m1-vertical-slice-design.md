# M1 — Vertical Slice: Design Spec

**Project:** The Gateless Gate (working title)
**Date:** 2026-07-16
**Status:** Approved by Frank (design conversation, this date)
**Parent doc:** [../../gateless-gate-design-doc.md](../../gateless-gate-design-doc.md) (§13, M1)
**Builds on:** M0 (merged to master, tag `m0-lookdev-done`)

## Purpose

The "is it actually good?" milestone: load → title gate → glide through → station → case 29, complete end-to-end — scroll UI with real text, narration, procedural ambience, the stillness mechanic, sit mode — all in the M0 art direction. Desktop-first; mobile tuning is M5.

**Milestone gate:** Frank plays the whole flow and judges it. Objective gates: 60 fps desktop, < 150 draw calls in every scene, `node --test` green, sim/rails/transition determinism preserved under `step(n)`.

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Hub movement | **On-rails glide** along a fixed spline; wheel / drag / arrow keys / tap all advance the dolly | Doc's lean; free-walk shelved (revisitable post-M2) |
| Case 29 text | **Senzaki–Reps (1934)** is the intended M1 text; **Frank pastes it in** (see Text handling below) | Copyright verification stays a pre-M3 gate per doc §14 |
| Narration | `speechSynthesis`, rate 0.85, sentence-chunked | Per doc §9; baked Opus is post-launch |
| Persistence | **None in M1** — no localStorage, no lanterns, no saved settings | All M2 |
| Audio unlock | "sound on?" card at the gate approach, first user gesture starts the context | Wording placeholder-free: "Sound on?" [Yes] [Not now] |
| M0 leftovers | `src/scene_m0.js` and `tests/scene.test.js` are deleted; their modules live on via the kit | k29 tests replace scene test coverage |

### Text handling (Senzaki–Reps)

The koan module treats text as data: `koans/k29.js` imports its three strings from `koans/text/k29.js`. That file ships with a **clearly-marked plain-language retelling** (written fresh for this project, no rights question) and a comment block telling Frank exactly where to paste the Senzaki–Reps case/comment/verse over it. Claude does not transcribe the 1934 translation itself: its rights status is the very thing the doc says to verify, and a from-memory transcription could corrupt the text anyway. Swap is a 30-second paste; nothing downstream cares which text is present.

## Architecture

### Koan module contract (doc §11, adopted verbatim)

```js
// koans/k29.js
export default {
  id: 29,
  slug: 'wind-flag',
  title: 'Not the Wind, Not the Flag',
  accent: '#C73E3A',
  tier: 1,
  text: { case, comment, verse },      // plain strings from koans/text/k29.js
  ambience: ['wind:flag', 'crickets:0.2'],
  build(ctx) { /* returns { update(dt, simTime), onEnter(), onExit(), dispose() } */ }
}
```

`ctx = { scene, kit, audio, input, accent, quality }`. `kit` is a facade module (`src/kit/index.js`) re-exporting the M0 builders. A tiny registry (`src/koans/registry.js`) maps slug → lazy `import()`; M1 registers only `k29`.

### SceneManager (`src/scene/manager.js`)

One renderer; owns the current root (hub or koan) and the swap:
`swapTo(buildFn)` → dissolve out → dispose old root → build new → dissolve in. Returns a promise.

**Disposal rules (from M0 final review):** traverse the outgoing root; `geometry.dispose()` and `material.dispose()` for every mesh; never dispose the shared toon ramp texture or any texture flagged `userData.shared`. Outline shells share their source geometry — guard against double-dispose (track a `Set` of disposed ids). `addOutlines` switches to **one shared outline material per root** (same width/wobble scene-wide), disposed with the root.

### Input verbs (`src/input.js`)

- Pointer/look stay with the camera rig (unchanged).
- **Stillness clock:** `input.stillness()` → seconds since the last input event (pointermove > 2 px, pointerdown, wheel, key, touch). The clock advances on sim ticks, not wall time, so `step(n)` tests behave; `input.setStillness(s)` overrides it for tests/hooks.
- `input.onTap(cb)` — tap/click with < 6 px drift (hub station selection).

### window.gate hooks v2

```
step(n), state(), enter(slug), exit(), dissolve(dir, dur?),
sit(minutes), endSit(), setStillness(seconds), setSound(on)
```
`state()` → `{ mode: 'hub'|'koan'|'sit', simTime, drawCalls, triangles, fps, dissolveT, camera, hub?: { u }, koan?: <module fragment> }`. Modules supply their own fragment (k29: `{ windIntensity, clothEnergy, stillness }`) — no scene-specific knowledge in `main.js`.

## The hub (`src/hub/`)

**Frontispiece.** A long path island in the M0 language (torn rim, fog-to-paper): path → the freestanding hero gate → short region stub with **one station** (plinth + stone lantern, both new kit props) marking case 29. Composition beats: start in emptiness, gate at spline midpoint, station at the end.

**Rails (`src/hub/rails.js`, pure + tested).** Catmull-Rom spline through ~6 control points; dolly state `{ u, v }`; inputs add velocity (wheel ±, drag ±, ArrowUp/Down, tap = nudge forward); damping ~2.5/s; `u` clamped [0,1]. Camera positions at `spline(u) + eye offset`, looks toward `spline(u + lookAhead)`. Deterministic given an input sequence.

**Sound prompt.** First time `u` crosses ~0.35 (approaching the gate): the "Sound on?" card. [Yes] → `audio.unlock()`; [Not now] → dismissed, HUD toggle remains. Either way the glide continues uninterrupted.

**Station → koan.** At `u ≥ 0.97` a subtle "enter" affordance appears on the station; tap/Enter → `SceneManager.swapTo(k29)`. `Esc` inside a koan returns to the hub at the station.

## Case 29 (`src/koans/k29.js`)

Diorama: reuse the M0 composition (island, gate, flag; monk under the tree) built through `ctx.kit` with the accent flowing from the module's `accent` field.

**The mechanic.** One scalar `windIntensity ∈ [0,1]` owned by the module:
- `stillness < 3 s` → target 1; `stillness ≥ 3 s` → target ramps to 0 with smoothstep over the next 4 s.
- `windIntensity` eases toward target (~1.5 s time constant).
- It scales the cloth wind forces (gust variance and flutter; a small constant gravity sag remains) **and** the wind synth's gain/cutoff — sight and sound still together.
- Any input snaps the target back to 1 (the flag wakes).
- **No hint, ever** (doc: discovering stillness is the verb *is* the joke). The doc's 10 s glyph pulse explicitly does not apply to case 29.

`state()` fragment: `{ windIntensity, clothEnergy, stillness }`.

## Audio (`src/audio/`)

**engine.js** — context creation, `unlock()` (resume on gesture), master gain, `setSound(on)`, ambience recipe parser (`'wind:flag'` → wind synth with external intensity control; `'crickets:0.2'` → crickets at level 0.2).

**synths.js** — all-procedural, param tables as **pure exported functions** (Node-testable):
- *Wind:* filtered noise (lowpass ~400–1400 Hz), slow LFO on cutoff + gain; `setIntensity(0..1)` maps to gain/cutoff/LFO-depth curves.
- *Crickets:* sparse seeded chirp scheduler (band-passed ~4.2 kHz pulses in short trains); density parameter.
- *Singing bowl:* 5 detuned inharmonic partials (beating pairs), strike envelope with 20–30 s decay; used on koan entry and sit start/end.

**narration.js** — `speak(sectionText, { rate = 0.85, onEnd })`, `stop()`; sentence-chunking (split on `.!?` boundaries, queue utterances) to dodge Chrome's long-utterance stall; currently-speaking section gets a `.speaking` class for the highlight. Voice picker is M2 — default voice only.

Audio is exempt from determinism guarantees; everything else is not.

## UI (`src/ui/`)

**scroll.js** — the kakemono: fixed right-side panel ≥ 900 px wide viewports, bottom sheet below; three progressive sections (THE CASE / MUMON'S COMMENT / THE VERSE) in a quiet serif, ink on paper, case number as a vermillion seal block; per-section speak buttons + one master play (reads all three in order); tuck/untuck toggle (tucked = just the seal tab). Section reveal state machine is a pure module (`scroll_state.js`, tested).

**hud.js** — three quiet corner controls only: sound toggle, "Sit" , back-to-hub (only inside a koan). No ensō menu in M1.

**sit.js** — Sit flow: presets 2/5/10/20 min → UI fades out, scroll tucks, camera drops to slowest drift, ensō SVG breathing guide pulses on a 6 s cycle, bowl at start and end, `Esc`/tap ends early, `navigator.wakeLock` requested in a try/catch (failure is fine). Ends back in the koan with UI restored. No logging (M2).

## Testing

- Pure Node tests: rails (spline continuity, clamping, determinism), stillness envelope + wind-intensity mapping (exact ramp numbers above), scroll section state machine, synth param tables (ranges, monotonic intensity curves), koan registry + k29 contract shape (`text` strings non-empty, `build` returns the four methods), SceneManager disposal bookkeeping (disposed-count > 0 after swap; shared ramp untouched; no double-dispose).
- Browser verification (main session): full flow via hooks + shot server; `setStillness(10)` stills the flag headlessly; narration/audio smoke-checked by ear and via console.
- Suite target: M0's 36 tests minus the deleted scene test, plus ~25 new.

## Out of scope (M2+)

Menu/ensō overlay, router/deep links, settings, save state/lanterns/log, reading mode, PWA/offline, voice picker, other koans, mic verb, gyro, mobile perf tuning, region lazy-loading.

## Risks

- **Stillness feel** — the 3 s + 4 s envelope is a starting point; expect tuning in the verification pass. The mechanic failing to feel like "getting the joke" is an art-direction risk, not an engineering one.
- **speechSynthesis quality** varies wildly by platform; M1 accepts the default voice (doc's post-launch Opus plan is the real fix).
- **Senzaki–Reps paste pending** — until Frank pastes it, builds carry the marked retelling; the copyright check remains a pre-M3 gate.
- **Hub scope creep** — the region stub is one station. Six regions, 48 stations, day-cycle sky: all later.
