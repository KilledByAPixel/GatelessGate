# M1 — Vertical Slice: Design Spec (v2, the book model)

**Project:** The Gateless Gate (working title)
**Date:** 2026-07-16 (v2 — supersedes the same-day v1 after Frank's direction correction; see parent doc Revision 0.2). **Amended 2026-07-17:** text pipeline from Frank's reference file; ≥1 touch response per case as a content goal.
**Status:** Approved direction; spec pending Frank's read
**Parent doc:** [../../gateless-gate-design-doc.md](../../gateless-gate-design-doc.md) (v0.2 — Revision note governs)
**Builds on:** M0 (merged to master, tag `m0-lookdev-done`)

## Purpose

The "is it actually good?" milestone for the **interactive book**: a short skippable gate intro (the cover) → the menu (the table of contents) → case 29 as a complete book page — ambient two-monk diorama, full text, narration, subtle wind, meditation timer with a bell — with check-off progress that persists. No goals, no puzzles, nothing asked of the reader.

**Milestone gate:** Frank reads case 29 like a book page and it feels right. Objective gates: 60 fps desktop, < 150 draw calls per scene, `node --test` green, sim/intro/transition determinism preserved under `step(n)`.

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Model | Interactive book / guided tour; dioramas are ambient; touch responses are optional bonuses, never goals | Parent doc Revision 0.2 |
| Intro | One short on-rails dolly through the gate (~6–8 s), **any click/key skips it**; ends at the menu | "Let's not waste people's time" |
| Navigation | **Menu-first**: full list of all 48 cases, jump anywhere, check-off; next/prev chevrons inside koans (disabled while only one koan exists) | Garden/stations shelved |
| Progress | localStorage: auto `visited` dot + manual `done` check (vermillion seal toggle in the menu) | First persistence in the project |
| Case 29 scene | **Two monks** facing each other by the gate, arguing about the waving flag; ambient wind (M0's lively tuning); optional bonus: tap the flag → a gust ripples through (2 s decay). No stillness system. No hints | Depicts the actual story |
| Audio | Wind (subtle, experimental) + **temple bell** for timer start/end. **No singing bowl. No crickets.** Sound-on prompt at the intro; toggle in HUD | Parent doc Revision 0.2 |
| Text source | **`local/gateless-gate.txt`** (gitignored), supplied by Frank: Senzaki–Reps 1934, lightly modernized — its provenance header states the 1934 printing is US public domain (copyright not renewed). A rerunnable converter script turns it into a committed data module for all 48 cases + the traditional 49th addendum (Amban, flagged `extra`) | Rights/credits line ships on the About page (M5) |
| Interactivity goal | **Every case ships with at least one small touch response** — a bell to ring, a flag to poke — never required, never hinted as a task. M1 proves the pattern on case 29: **tap the flag → the wind dies; tap again → it returns** (smooth ~2 s ramps). Experiments welcome per case | Frank, 2026-07-17 |
| Reuse rule | Anything visual built for a case must be a kit builder (or a parametrization of one) — the same monks/flags/temples/bells serve all 48 | Doc §7 is the production strategy |
| Narration | `speechSynthesis`, rate 0.85, sentence-chunked, per-section highlight; default voice | Unchanged from v1 |
| M0 leftovers | `src/scene_m0.js` + `tests/scene.test.js` deleted; modules live on via the kit facade | |

## Architecture

### Koan module contract (unchanged from doc §11)

```js
// koans/k29.js
export default {
  id: 29,
  slug: 'wind-flag',
  title: 'Not the Wind, Not the Flag',
  accent: '#C73E3A',
  tier: 2,                       // optional touch response (tap toggles the wind)
  text: { case, comment, verse },   // looked up by id from the generated text module
  ambience: ['wind:0.25'],
  build(ctx) { /* returns { update(dt, simTime), onEnter(), onExit(), dispose() } */ }
}
```

`ctx = { scene, kit, audio, input, accent, quality }`. `src/koans/registry.js` maps slug → lazy `import()`; `src/koans/index.js` is the static table of all 49 `{ id, slug, title, extra? }` (48 cases + Amban's Addition flagged `extra`) used by the menu — only registered slugs are enterable, the rest render greyed as "not yet".

### Text pipeline (`scripts/build-text.js`)

A rerunnable Node script: reads `local/gateless-gate.txt` → writes `src/koans/text/mumonkan.js` (a committed, generated ES module: `export default { 1: { title, case, comment, verse }, …, 49: { …, extra: true } }`).

Parse rules: case headers match `^\d{1,2}\. Title`; the comment starts at the `Mumon's comment:` marker (`Amban's comment:` for 49); the **final paragraph of each case is the unlabeled capping verse**; everything between marker and verse is the comment (may span paragraphs); everything before the marker is the case. Front matter before case 1 is captured as `about` (provenance/credits for the M5 About page).

The script validates and refuses to write on failure: exactly 49 entries; every entry has non-empty title/case/comment/verse; it prints a per-case length table for eyeball review. Parser lives in a pure module (`scripts/lib/parse-mumonkan.js`) tested against an embedded fixture; a second test validates the **committed artifact** (49 complete entries) so a fresh clone without `local/` still tests green.

### SceneManager (`src/scene/manager.js`)

As v1: one renderer; `swapTo(builder)` = dissolve out → dispose outgoing root (traverse; `geometry.dispose()` + `material.dispose()`; never the shared toon ramp or `userData.shared` textures; guard double-dispose via a `Set`) → build → dissolve in. `addOutlines` switches to one shared outline material per root.

### Input (`src/input.js`)

Pointer/orbit stay with the camera rig. `input.onTap(cb)` — click/tap with < 6 px drift, used by the menu, intro skip, and the flag-tap bonus (raycast). **No stillness clock** (v1's is deleted from the design).

### Save (`src/save.js`)

Tiny injectable-storage module: `load()/save()` of `{ visited: {slug:true}, done: {slug:true}, soundOn, lastSlug }` under one key `gateless-gate-v1`. Pure logic tested with a fake storage object.

### window.gate hooks v2

```
step(n), state(), enter(slug), exit(), menu(open?), skipIntro(),
dissolve(dir, dur?), sit(minutes), endSit(), markDone(slug, on), setSound(on)
```
`state()` → `{ mode: 'intro'|'menu'|'koan'|'sit', simTime, drawCalls, triangles, fps, dissolveT, camera, progress: { visited, done }, koan?: <module fragment> }`. k29's fragment: `{ windOn, windLevel, clothEnergy }`.

## The intro (`src/intro.js`)

The book's cover: paper void, path island, the hero gate; a fixed dolly (Catmull-Rom through ~4 points, pure math in `src/intro_rails.js`, tested) carries the camera through the gate over ~6–8 s with title text ("The Gateless Gate", DOM, quiet serif) fading over it. The "Sound on?" card appears near the start ([Yes] / [Not now]; either way the glide continues). **Any click or key skips straight to the menu.** Natural completion also lands in the menu. On later launches the intro still plays (it's short and skippable; a "skip immediately if visited before" refinement can wait for M2 taste).

## The menu (`src/ui/menu.js`)

Full-screen overlay over the idling backdrop scene, opened by the ensō button (top corner, always present outside the intro):

- Scrollable list of all 48: seal-styled case number, title; registered cases are live, others greyed.
- Per-case state: subtle dot = visited (automatic on entry); vermillion seal = done (manual toggle, clickable directly in the list).
- "Continue" row at top (last visited case) when it exists.
- Typography rule: it must read as a book's table of contents, not a level select — serif, ink on paper, generous leading, no thumbnails in M1.

Menu logic (selection, states, continue target) is a pure module (`src/ui/menu_state.js`, tested).

## Case 29 (`src/koans/k29.js`)

Diorama: island + temple gate + flag (M0 kit, accent from module) + **two monks** placed facing each other near the flagpole, slight lean-in, one gesturing up at the flag (arm pose = simple cone/cylinder addition to the monk builder or rotation of the existing rig — builder gains an optional `pose: 'point'` that raises one arm; keep it minimal). Ambient wind uses the M0 lively tuning as-is.

**Optional touch response (tier 2, Frank's pick):** tapping the flag cloth (raycast) **toggles the wind** — off: forces ramp to a gravity-only hang over ~2 s and the wind synth fades with it; on: both return the same way. `{ windOn, windLevel }` in the state fragment. Directly thematic (wind, flag, mind moving) without asking anything of the reader: stumbled upon or never found — both fine. No hint, no cursor change.

## Sit timer (`src/sit.js`)

From a koan: "Sit" control → presets 2/5/10/20 min → UI and scroll fade, camera at slowest drift, ensō SVG breathing guide (6 s cycle), **temple bell strike at start and end** (no bowl), `Esc`/tap ends early, wake-lock in try/catch. Returns to the koan with UI restored. No logging.

## Audio (`src/audio/`)

- **engine.js** — context + `unlock()` on gesture, master gain, `setSound(on)` (persisted via save.js), recipe parser (`'wind:0.25'`).
- **synths.js** — pure param-table functions + thin node builders:
  - *Wind:* filtered noise, lowpass ~400–1400 Hz, slow LFO on cutoff/gain; base level from the recipe; gust multiplier input (flag bonus drives it).
  - *Temple bell:* 4 partials, strike transient, ~8–12 s decay, deeper stack than a bowl; used only for sit start/end in M1.
- **narration.js** — as v1: `speak(text, { rate: 0.85, onEnd })`, `stop()`, sentence-chunked, `.speaking` highlight class.

Audio exempt from determinism; everything else is not.

## Scroll UI (`src/ui/scroll.js`)

Unchanged from v1: kakemono panel (right side ≥ 900 px, bottom sheet below), three progressive sections (THE CASE / MUMON'S COMMENT / THE VERSE), per-section speak buttons + master play, tuck/untuck, case number as vermillion seal. Section state machine pure (`scroll_state.js`, tested). Next/prev chevrons live in this panel's footer (disabled in M1).

## Testing

- Pure Node tests: text parser (embedded fixture) + committed text artifact (49 complete entries), intro rails (continuity, clamp, determinism), menu state machine (visited/done/continue), save module (fake storage round-trip, corrupt-JSON tolerance), koan index (49 entries, unique ids/slugs), registry + k29 contract shape, wind-toggle envelope math, synth param tables (ranges; bell partial/decay tables), scroll section state machine, SceneManager disposal bookkeeping (disposed > 0, ramp untouched, no double-dispose).
- Browser verification (main session): full flow — intro (and skip), sound prompt, menu jump, case 29 text/narration/wind, flag-tap gust via synthetic event, done check-off persists across reload, sit timer bell — via hooks + shot server.
- Suite target: ~60 tests total.

## Out of scope (M2+)

Garden/stations/day-cycle, router/deep links, settings beyond the sound toggle, reading mode, PWA/offline, voice picker, other koans' content, mic/gyro verbs, mobile tuning, "skip intro when returning" refinement, export/import of progress.

## Risks

- **Tone of the menu** — it must feel like a table of contents; typography does the work. This is the new "does it sing" surface.
- **speechSynthesis** quality varies by platform (default voice in M1; baked Opus post-launch).
- **Parser edge cases** — the "final paragraph = verse" rule needs the validation table eyeballed once across all 49; any oddball case gets a manual override map in the script, not a cleverer parser.
- **Two-monk staging** — the monk rig has no faces or arms yet; a minimal `pose: 'point'` arm must read clearly at ink-silhouette level or the argument won't stage. Fallback: leaning postures only, which already read as conversation.
