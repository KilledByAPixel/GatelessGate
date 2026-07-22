# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An interactive sumi-e reading of the Mumonkan (The Gateless Gate) in the browser: all 48 koan cases staged as small low-poly ink-painting dioramas, with text, narration, ambience, and a meditation timer. It is an **interactive book, not a game** — dioramas are ambient scenes; touch responses are optional delights, never gates.

The design doc at `docs/gateless-gate-design-doc.md` is authoritative; its dated revision notes **override** anything they contradict elsewhere in the doc. Milestone plans/specs live in `docs/superpowers/`.

## Commands

- Run: `npx -y http-server -p 8105 -c-1 .` then visit http://localhost:8105 — **no build step**; ES modules are served directly and Three.js is vendored in `lib/` (version in `lib/THREE_VERSION.txt`).
- Test all: `npm test` (runs `node --test` over `tests/`, Node 20+)
- Test one file: `node --test tests/k29.test.js`
- Regenerate koan text after editing `local/gateless-gate.txt`: `node scripts/build-text.js` (writes `src/koans/text/`)
- Screenshots while the preview panel is hidden: `node scripts/dev/shot-server.js` (port 8106; workspace launch config `gate-shots`), then POST a `canvas.toDataURL(...)` string to `http://localhost:8106/<name>` — files land in `shots/` (gitignored)

`local/` is gitignored — it holds the source text and Frank's local notes; don't assume its contents exist in a fresh clone.

## Headless driving

`window.gate` exposes hooks for driving the app without a visible page: `step(n)`, `state()`, `enter(slug)`, `exit()`, `menu(open?)`, `skipIntro()`, `dissolve('in'|'out', s?)`, `sit(min)`, `endSit()`, `markRead(slug)`, `markSat(slug)`, `setSound(on)`.

Caveat: the hidden preview panel pauses `requestAnimationFrame`, so `await gate.enter(...)` hangs — dissolves only advance inside `step()`. Fire the call, then `step(60)` once per await stage (`loadKoan` → dissolveOut → dissolveIn), yielding between batches so microtasks flush.

## Architecture

- **Determinism rule:** seeded noise everywhere (`src/util/noise.js`), **no `Math.random` outside `src/audio/**`** — same steps, same state. Audio is exempt because noise buffers don't affect sim state.
- **Koan modules** (`src/koans/kN.js`): each default-exports `{ id, slug, title, accent, tier, text, ambience, build(ctx) }`. `build` returns `{ update(dt), onEnter(), onExit(), dispose() }`. `registry.js` lazy-loads staged cases; unstaged cases fall back to `default-case.js`. Text comes from the generated `src/koans/text/mumonkan.js` — never hand-edit it.
- **The kit** (`src/kit/`): procedural builders (monk, gate, flag, quadruped, lantern…) shared by all cases. The reuse rule is absolute — behaviors (hover ruffle, bell strike) live **in the kit components**, not in individual cases, so they travel wherever the component appears. Scene assembly goes through `composeWorld` (ground + mountains + forest + seeded scatter with keepouts).
- **Render** (`src/render/`): toon ramp + inverted-hull outlines, fog-to-paper, post spine (`post.js`) with depth ink / tone quantisation / paper grain, ink dissolve for every transition (`dissolve.js`), `freeze.js` holds the outgoing frame during cuts. No shadow maps — blob washes only.
- **Audio** (`src/audio/`): fully procedural Web Audio, no samples. Pattern: pure **param tables** (e.g. `windParams`, `bellPartials`) are unit-tested; node builders are browser-only. Narration is `speechSynthesis` behind an interface.
- **Testable-state pattern:** logic that tests need is split from DOM/WebGL glue — `menu_state.js` vs `menu.js`, `scroll_state.js` vs `scroll.js`, param tables vs node builders. Tests run in plain Node with no browser; keep new logic on the testable side of that line.
- **Look-dev harnesses:** `dev/lookdev.html` and `dev/kit-preview.html` for iterating on the art and kit pieces in isolation.

## Style guardrails (from the design doc)

- One accent hue per koan against monochrome ink + paper; fog dissolves everything before any horizon.
- Audio is minimal and chill: no singing bowl, no crickets. Bells, wind, quiet knocks are the palette. Nothing loud by default.
- Sensitive cases (3, 5, 14, 41) are handled through ink metaphor, never literal harm.
- Budgets: < 150 draw calls per scene, whole app ~1.5 MB gzipped, no downloaded assets.
