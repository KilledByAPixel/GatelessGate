# M0 — Look-Dev Scene: Design Spec

**Project:** The Gateless Gate (working title)
**Date:** 2026-07-16
**Status:** Approved by Frank (design conversation, this date)
**Parent doc:** [../../gateless-gate-design-doc.md](../../gateless-gate-design-doc.md) (§13, M0)

## Purpose

One scene that validates or kills the sumi-e art direction before anything else is built: monk + tree + gate + flag on a torn-paper island, with every signature rendering trick live. The *scene composition* is disposable; the *modules* it exercises (kit builders, Verlet solver, noise, toon/outline/grain/dissolve helpers) are the seed of the real codebase and are written to production standard with tests.

## Success criteria

**Subjective gate (Frank's call):** the ink sings. M0 exists to put a judgeable image in front of his eyes fast. If it doesn't sing after iteration, the art direction is rethought before M1.

**Objective gates:**
- 60 fps on desktop at `devicePixelRatio ≤ 2`
- All scene elements present (list below), each rendering trick demonstrable
- Deterministic fixed-timestep stepping via `window.gate.step(n)` — same inputs, same state
- `node --test` suite green
- Draw calls reported by `window.gate.state()` (budget < 150; M0 expected far under)

## Locked decisions

| Decision | Choice | Notes |
|---|---|---|
| Location | `C:\dev\claude\gateless_gate`, git on `master` | new repo |
| Build | **None.** Native ES modules, `import` maps not needed, dynamic `import()` later for lazy koans | Deviation from parent doc (§11 says Vite). Agreed 2026-07-16: zen_temple's no-build pattern is proven; Vite can be added at M2/M5 if the PWA/size budget wants it, with zero refactoring since it ingests vanilla ESM. |
| Three.js | Vendored `lib/three.module.js`, **r0.185.1** (same revision as zen_temple) | `lib/THREE_VERSION.txt` records it |
| Serve | Static: `npx serve -l 8103 .`; `.claude/launch.json` entry named `gate` | 8103 is next free port in the workspace lineup |
| Tests | `node --test`, files under `tests/` | Node 20+ |
| Palette | Paper `#F3EDDF`, ink `#1E1E24` + two grays; accent `#C73E3A` (vermillion) on the flag only | Per parent doc §3 |

## Scene contents

- **Island** — disc slab, rim displaced by seeded noise into a torn-paper silhouette, floating on bare paper background
- **Monk** — first pass of kit `monk(params)`: capsule body, sphere head, cone hat; static pose; featureless face
- **Tree** — simple one-off builder: cylinder trunk + canopy blobs (not the hero tree)
- **Gate** — freestanding two-post gate, one-off builder
- **Flag** — pole + Verlet cloth (24×16 grid, top edge pinned, seeded-noise wind), toon-shaded double-sided, the only accent-colored object
- **Blob shadows** under monk, tree, gate

## Rendering stack (module per trick)

- `src/render/toon.js` — `MeshToonMaterial` factory sharing one 3-step `DataTexture` gradient ramp (`NearestFilter`); one `DirectionalLight` + low ambient
- `src/render/outlines.js` — `addOutline(mesh, {width, wobble})`: back-face shell sharing the source `BufferGeometry`, `ShaderMaterial` displacing along normals by width + **static** low-frequency positional noise (hand-brushed line, no per-frame shimmer). Sharing geometry means the flag's outline follows cloth deformation for free. Meshes stay unmerged in M0 (draw calls are tiny); the merge-vs-outline strategy is an M1+ concern.
- **Fog** — `FogExp2` in paper color, density tuned so the island edge dissolves into the page before any horizon
- `src/render/grain.js` — washi paper grain: procedural noise baked once at startup to a canvas, applied as a **DOM overlay** with `mix-blend-mode: multiply` + CSS vignette (zero per-frame WebGL cost)
- `src/render/blobshadow.js` — radial-gradient `CanvasTexture` on a transparent plane, `polygonOffset` above ground
- `src/render/dissolve.js` — ink transition: fullscreen quad in front of the camera, fragment shader discards where `noise(uv) < threshold`, dark wet-ink rim near the threshold edge, 600–900 ms, promise API (`dissolveIn()` / `dissolveOut()`). No render targets. **First to cut** if look iteration needs the time.
- `src/camera.js` — hand-rolled gentle orbit: damped spherical coords, clamped azimuth/polar/distance range, cursor parallax. No OrbitControls dependency.

## Simulation & utilities

- `src/sim/verlet.js` — pure cloth solver, **no Three.js imports**: `createCloth(w, h, spacing, pins)`, `stepCloth(cloth, dt, forces)`; position Verlet, distance constraints (structural + shear), pin constraints, gravity + wind force field. Deterministic given seed + step sequence.
- `src/util/noise.js` — seeded value noise (1D/2D/3D), pure, reproducible. Used by: island rim, outline wobble, wind field, dissolve pattern, paper grain.
- `src/kit/` — `monk.js`, `island.js`, `tree.js`, `gate.js`, `flag.js` (flag binds verlet positions to a `BufferGeometry`, recomputes normals per frame — cheap at 24×16)

## Runtime shape

- `index.html` — canvas + grain overlay div, `<script type="module" src="src/main.js">`
- `src/main.js` — renderer setup (`pixelRatio` capped at 2), fixed 60 Hz timestep with accumulator, scene assembly call, `window.gate` hooks
- `src/scene_m0.js` — composes the look-dev island from kit + render modules (the disposable part)

**Headless hooks** (`window.gate`), Frank's standard preview-panel pattern:
- `step(n)` — advance n fixed ticks (works while rAF is paused in a hidden panel)
- `state()` — `{ drawCalls, clothEnergy, dissolveT, camera: {azimuth, polar, distance} }`
- `dissolve(dir)` — trigger the ink transition
- Determinism: wind/noise driven by sim time from a fixed seed, never wall clock

## Test plan (`node --test`)

- `tests/verlet.test.js` — determinism (same seed → bit-identical positions after N steps), distance-constraint convergence (max error < ε after settle), pinned points immobile under force
- `tests/noise.test.js` — same seed → same values; output within expected range; different seeds differ
- `tests/kit.test.js` — builders return groups/meshes with expected child and vertex counts; island rim actually displaced (min rim radius < max); flag geometry vertex count matches cloth grid
- Manual verification in the preview panel: `step()` + screenshot + `state()` draw-call check

## Out of scope (M1+)

Audio, narration, text/scroll UI, hub, routing/deep links, save state, on-twos character animation, mobile performance tuning, PWA/service worker, Sobel edge pass, geometry merging/instancing strategy.

## Risks

- **Outline shell on cloth:** normals change per frame; shell shares geometry so it deforms correctly, but normal displacement uses per-frame normals — verify no cracking at 24×16 resolution.
- **Toon + fog interaction:** `MeshToonMaterial` respects fog, but the stepped ramp can band visibly as objects fade; may need fog density or ramp tuning. This is exactly the kind of thing M0 exists to find.
- **Grain overlay on mobile:** `mix-blend-mode` over a WebGL canvas is fine on desktop Chrome/Firefox/Safari; mobile verification deferred (out of scope) but the fallback is drawing grain into the WebGL frame instead — module boundary keeps that swap local.
