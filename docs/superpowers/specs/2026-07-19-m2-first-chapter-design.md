# The Gateless Gate — M2: The First Chapter (design)

- **Date:** 2026-07-19
- **Status:** design approved; pending spec review
- **Branch:** continues from `m1-vertical-slice` (M1 not yet merged — see Open Questions)
- **Extends:** `docs/gateless-gate-design-doc.md` (v0.2 "book model")

## Goal

M1 delivered one fully-realized case (29) with the split-screen book UI, the 49-case
menu, the intro, the sit timer, narration, and the reusable kit + `composeWorld`
grammar. M1 could only *assert* that the grammar scales; **M2 proves it** by building
four more cases — deliberately unlike case 29 and unlike each other — each a serene
diorama with one optional, unhinted experiential "moment." M2 also folds in Frank's
Suno ambient tracks as a per-scene music bed. The demo becomes a chapter you can sit
and read.

Success = the four cases are enterable from the menu, each diorama meets the case-29
quality bar, each moment works and is verified in-browser, music crossfades per scene
with a mute, the kit has grown with reusable pieces, tests are green, and draw
calls/console stay clean.

## Scope

**In:**
- Four new koan dioramas: **1** (Joshu's Dog / Mu), **6** (Buddha's Flower),
  **7** (Wash Your Bowl), **37** (The Buffalo).
- One "moment" per case (temporal / visual / sonic / tactile).
- ~11 new reusable kit pieces (below).
- An ambient music layer: player, per-scene mapping, mute — playing Frank's four Suno tracks.
- Registry + menu wiring so the four cases load; unit + smoke tests; browser-verification of each.

**Out (YAGNI / later milestones):**
- Procedural/generative music (Frank authors tracks in Suno; we only play them).
- Navigation, typography, or menu redesign (the M1 container is untouched beyond registering cases).
- The remaining 44 cases.
- Real-time water reflection (the water is stylized — see case 7).
- Narration changes (M1's `speechSynthesis` stands).

## The four cases

Each koan is `src/koans/kNN.js` following the existing contract: default export
`{id, slug, title, accent, tier, text, ambience, music?, build(ctx)}`; `build` returns
`{scene, setCamera, onEnter, onExit, update(dt, simTime), fragment(), dispose()}`.
Each assembles its diorama with `composeWorld` + keepout circles, adds blob shadows
and `addOutlines`, and exposes its moment's state through `fragment()` for headless
verification. All moment animation is driven by `simTime` and seeded noise — never
`Math.random`/`Date.now` (determinism rule; `src/audio/**` is the only exemption).

### 1 — Joshu's Dog (Mu) — the flagship opener
- **Scene:** a temple approach (a `composeWorld` world + a path). Old Joshu (elder seated
  master) and a standing monk near the path; a small dog at the roadside. Accent: Mu red.
- **Moment (temporal — "the world exhales into nothing"):** lingering near / tapping the
  dog ramps the scene's `FogExp2` density up until the world is swallowed into the
  paper-white fog, leaving only the dog (nearest the camera), holds a beat, then eases
  back. Reuses `FogExp2` — no new machinery, and no conflict with the scene-transition
  ink overlay (a different layer). `fragment()` → `{ mu: 0..1 }` (fog-swell progress).
- **New kit:** `makeDog`, seated/elder monk pose.
- **Music:** Temple Ruin (austere).

### 6 — Buddha's Flower — "a smile is an event"
- **Scene:** Vulture Peak — a low stone seat; the Buddha seated holding a single flower
  before a small seated assembly; among them Mahakasyapa. Outdoor, misted (fits
  `composeWorld`: a gathering on a peak).
- **Moment (visual):** a petal detaches from the flower and drifts down along a
  seeded-noise path; as it falls, the faintest smile-arc appears on Mahakasyapa — **the
  only face rendered anywhere in the book.** Ambient (cycles slowly on its own; a tap on
  the flower can also trigger it). `fragment()` → `{ petals: n, smile: 0..1 }`.
- **New kit:** `makeBuddha`, `makeFlower` (with `dropPetal()`), seated assembly
  (instanced), reuse the seated monk pose for the Kasyapa hero.
- **Music:** Stone Mistress.

### 7 — Wash Your Bowl — the ordinary made luminous
- **Scene:** a dawn monastery threshold — a small hut/gate, a young monk, a rice bowl set
  beside a stone water basin.
- **Moment (sonic + tactile):** touching the bowl (or the basin) sends a ripple expanding
  across the water with a soft wash of sound. `fragment()` → `{ ripples: n }`.
- **New kit:** `makeBowl`, `makeWater` (stylized — a paper-tinted translucent plane with a
  faint idle shimmer and a `ripple(x, z)` expanding ring; no real reflection),
  `makeHut`/threshold.
- **Music:** Stone Mistress (shared with Buddha's Flower — both gentle/reverent).

### 37 — The Buffalo — the tail that cannot pass
- **Scene:** a water-buffalo halfway through a lattice window/fence — horns, head, hooves
  on the far side; body and the tail on the near side.
- **Moment (tactile):** the tail is a verlet strand (reuses `src/sim/verlet.js` as a 1×N
  chain); tapping/tugging it sends a swish, but it never passes through. Soft rustle.
  `fragment()` → `{ tailEnergy }`.
- **New kit:** `makeBuffalo` (with the verlet `makeTail`), `makeLattice`.
- **Music:** Slow Stone Breath Flute (drone loop region, before the drums).

## New kit pieces

All follow existing conventions: toon material (flat where apt), named children,
`userData.noOutline` on ground-like/large pieces, deterministic by seed (seeded noise),
sit on `y=0`, one `InstancedMesh` where many. Each ships with a unit test.

- `makeDog({ height, color, seed })` — small ink quadruped (body, four legs, head, ears,
  tail). Params flex to fox/cat later.
- `makeMonk({ pose: 'sit' })` — seated variant (lowered, pooled robe, wider base); an
  `elder` flag for Joshu (slight stoop, optional staff).
- `makeBuddha({ height })` — larger seated serene figure, hands in lap, ushnisha (topknot)
  in place of the hat. Reusable for any Buddha-statue case.
- `makeFlower({ color })` — stem, center, petals; `dropPetal()` detaches a petal mesh for drift.
- **seated assembly** — an `InstancedMesh` of a simplified seated silhouette (draw-call
  cheap); the hero figures (Buddha, Kasyapa) are full builders.
- `makeBowl({ r })` — lathed bowl.
- `makeWater({ size, color })` — translucent plane, idle shimmer via `simTime`,
  `ripple(x, z)` expanding ring that fades. Broadly reusable (ponds, basins).
- `makeHut({ w, h, d })` — simple post-and-beam roofed structure (reuses the gate idiom + a
  roof). Reusable architecture.
- `makeBuffalo({})` — bulky quadruped, horns, heavy head; the tail is `makeTail`.
- `makeTail({ segments })` — verlet strand on the `src/sim/verlet.js` integrator;
  `impulse()` on tap; never detaches.
- `makeLattice({ w, h, bars })` — framed grid of thin bars; reusable window/fence/screen.

The kit facade (`src/kit/index.js`) re-exports all of them. `composeWorld` / `groundHeight`
/ `path.sample` / keepouts are unchanged.

## Music layer

- **Files:** `assets/audio/{glass-rain-garden, temple-ruin, stone-mistress,
  slow-stone-breath-flute}.mp3`, committed. Frank provides them; the player degrades to
  silence if a file is missing (no crash).
- **Module:** `src/audio/music.js` — `createMusic()` over WebAudio. `play(trackId)`
  crossfades (GainNodes) to that track, lazy-decoding its buffer on first use;
  `source.loop` with per-track `loopStart`/`loopEnd` (the flute loops its pre-drums
  region); `stop()`; `setMuted(bool)`; follows the app's sound-enabled state. Lives in
  `src/audio/**` (determinism-exempt).
- **Track metadata (pure, tested):** `TRACKS = { id: { file, loopStart, loopEnd, gain } }`.
- **Mapping (pure, tested):** a scene declares `music` (a trackId); otherwise it defaults
  by tier via `TIER_MUSIC`. On enter → `music.play(koan.music || tierMusic(koan.tier))`;
  on menu/exit → `glass-rain-garden`. **Glass Rain Garden is the menu bed only** — it is
  never a scene or tier bed; `TIER_MUSIC` maps solely to the three case tracks
  (Temple Ruin, Stone Mistress, Slow Stone Breath Flute).
- **UI:** a `♪` mute toggle beside the existing stage-corner sound control; persisted in
  `localStorage` (like the voice pin). Music is additionally gated by the overall *Sound?*
  choice.

## Architecture / wiring

- `registry.js` `LOADERS` gains `1, 6, 7, 37` (lazy `import()`).
- The menu already lists all 49 from the text; these four flip from "not yet" to enterable
  (`isRegistered`).
- Koan module contract unchanged; add the optional `music` field.
- `main.js`: instantiate `createMusic`; wire `play` on enter/menu/exit; add the `♪` toggle
  + persistence; expose gate hooks `gate.music()` / `setMusic(id)` / `muteMusic(bool)` for
  headless verification; extend `state()` with the current track.
- Determinism unchanged: moment animation via `simTime`/seeded noise; audio exempt.

## Testing

- **Unit (`node --test`):** one test per new kit piece (named parts, on-ground,
  deterministic, instanced where claimed); `makeTail` settles; `makeWater` exposes
  `ripple`; `makeFlower.dropPetal` returns a mesh.
- **Pure audio:** `TRACKS` metadata valid; `tierMusic(tier)` mapping; every registered
  koan resolves to a known track.
- **Koan smoke:** each `kNN` builds a valid root; `fragment()` shape; camera set.
- **Browser-verify (gate hooks + shot-server 8106, step pattern):** enter each case,
  capture a shot, assert draw calls/tris within budget and console clean; trigger each
  moment and assert its fragment field moves (tap dog → `mu` rises; tap bowl → `ripples`++;
  tug tail → `tailEnergy` > 0; flower → `petals` cycle and `smile` > 0).

## Sequencing (for the plan)

1. Kit pieces + unit tests (dog, seated/elder pose, buddha, flower, assembly, bowl, water,
   hut, buffalo, tail, lattice).
2. Music layer: `music.js` + `TRACKS`/`TIER_MUSIC` + mute UI + main wiring + tests (works
   with placeholder/missing files).
3. The four dioramas + register + smoke tests, one at a time, browser-verified and tuned to
   the case-29 bar.
4. Whole-chapter browser pass: screenshots, draw-call/console check, music crossfade + mute check.
5. Update `docs/gateless-gate-design-doc.md` (chapter note) and `progress.md`.

## Success criteria / gate

- All four cases enter from the menu; each diorama at the case-29 bar (browser-verified screenshots).
- Each moment works and is headlessly verifiable via `fragment()`.
- Music crossfades per scene, menu = Glass Rain Garden, `♪` mute works, degrades gracefully without files.
- Kit grown with the listed reusable pieces; all re-exported; `composeWorld` untouched.
- Tests green; draw calls within budget (~<150/scene); console clean.

## Open questions / risks

- **Merge M1 first — decided (2026-07-19):** merge `m1-vertical-slice` to master, then
  branch `m2-first-chapter` for the M2 work.
- Draw-call budget with the seated assembly → mitigated by instancing.
- The buffalo is the biggest art risk (a bulky quadruped at the quality bar); budget extra tuning.
- Asset size/decode: four MP3s (~8–12 MB total), lazy-decoded; acceptable.
- The water is stylized (no reflection) by design; if it reads flat, revisit with a cheap
  fake-reflection later.
