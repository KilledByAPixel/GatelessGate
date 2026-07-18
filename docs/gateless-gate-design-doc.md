# The Gateless Gate — Design Document
*Working title. An interactive sumi-e reading of the Mumonkan, in the browser.*

**Format:** Web (desktop + mobile), PWA, Three.js
**Version:** 0.2 — revised after M0 (see revision note)
**Scope:** All 48 cases of the Mumonkan, each with text, narration, and a 3D diorama; some with optional touch responses.

---

## Revision 0.2 (2026-07-16, Frank's direction after M0)

This is an **interactive book — a guided tour of the Mumonkan** — not a game. The changes below override anything they contradict elsewhere in this document:

1. **Dioramas are ambient scenes to chill with.** Nothing is ever asked of the reader — no goals, no puzzles, no "figure out the gesture." Where a diorama has a touch response (tap something, get a little feedback), it is an optional stumbled-upon delight, never a gate. The v0.1 "hero mechanic" concept (e.g. case 29's stillness-stills-the-flag) is dead; the §6 matrix's interaction column now describes *optional bonus ideas*, many of which may ship as pure tableaux.
2. **Navigation is menu-first.** An easy menu lists all cases; read in any order; check off the ones you've done; next/prev for linear reading. The garden hub shrinks to a short, click-to-skippable gate intro (the book's cover) — don't waste people's time. A walkable garden remains a possible later ambience, not core navigation.
3. **Progress is "read", not "done"** *(refined 2026-07-17)*: a case is never *completed* — it's *read* (subtle dot, automatic when you open it). Separately, finishing a meditation timer at a case earns its **vermillion stamp** — the seal gets pressed onto the page. Two quiet marks, no percentages, no toggles.
4. **Audio is minimal and chill: no singing bowl (too on-the-nose), no crickets.** Bells are welcome — e.g. a temple bell when the meditation timer starts and ends. Wind is worth experimenting with, kept subtle.
5. *(2026-07-17)* **Every case ships with at least one touch/hover response — and the responses live in the kit components, not the cases.** A flag ruffles when the cursor brushes it and toggles its wind when clicked; grass (when it exists) sways around the cursor; a bell rings when struck — wherever those components appear, in any case, they carry their behaviors with them. Hover reactivity *is* the hint; no UI prompts. A couple of cases may use a *temporal* response instead (wait quietly and something special happens — case 6 is the natural fit); pure nonresponse is not a thing we do. Atmosphere stays consistent and component-reused across cases — one style, not 48 bespoke moods. The reuse rule is absolute: monks, flags, temples, bells are kit builders shared by all 48 cases.
6. *(2026-07-17)* **Text source resolved:** Frank supplied the Senzaki–Reps 1934 rendering (US public domain per its provenance header, lightly modernised) as `local/gateless-gate.txt`; a converter script generates the app's text data, including the traditional 49th addendum (Amban). §8's verify-or-retell contingency is closed.
7. *(2026-07-17)* **Narration: `speechSynthesis` is the plan, full stop.** Chrome's voices are decent; Firefox's aren't, and that's acceptable — browsers may improve. Pre-generated audio files are **not** planned (Frank passed on the idea; §9's baked-audio note is shelved indefinitely). Runtime in-browser neural TTS remains rejected (20–300 MB models against a ~1.5 MB app).
8. *(2026-07-17)* **Maybe: an extremely ambient generated-music channel.** Frank may add/generate quiet music tracks; the audio engine keeps a simple music slot (play/stop/volume). Optional, never default-loud.
9. *(2026-07-17)* **Onboarding:** one small dismissible first-run card (and a "?" in the menu) — read, listen, touch things, sit. After that, readers are on their own; it isn't complicated.

10. *(2026-07-18)* **Staging revised: little worlds, not floating islands.** The v0.1 "torn-paper island against bare paper" staging read as plain and boring in practice. Each case is now a small grounded world: the diorama on gently rolling ground, with **distant mountains and forest** (and whatever else fits the case) dissolving into the paper fog — still simple, still orbitable, but a *place*. Reusable world kit: `makeGround` / `makeMountains` / `makeForest` dress every case; `makeIsland` is retired from default staging.
11. *(2026-07-18)* **Flag feel:** hover gives the *tiniest* ruffle, and **only while the flag is flying**; click toggles flying ↔ stilled; a stilled flag ignores the mouse entirely. This restraint is the model for all touch responses.

**The pitch, in one line:** a slightly interactive, modernized, web-first Gateless Gate — an illustrated book you can wander.

---

## 1. Overview

The Gateless Gate is a real-time 3D experience presenting all 48 koans of the Mumonkan (無門関, c. 1228). Each case is staged as a small low-poly diorama rendered in a sumi-e ink-painting style. The reader can wander a garden hub where the koans live as stations along a path, or jump directly to any case from a menu. Every koan includes the full text (case, Mumon's commentary, and verse), spoken narration, ambient sound, and a light interaction. A meditation mode lets the reader sit with any koan on a timer, and quiet progression (lanterns lighting along the path) records which koans have been visited and sat with.

The goal is a piece beautiful enough to pull in people who have never heard of a koan, and faithful enough that it rewards people who have.

## 2. Design Pillars

**The diorama is the illustration; interaction is garnish.** *(Rewritten in v0.2.)* Every case is an ambient scene that illustrates the story — read, listen, look, chill. Optional touch responses are discovered delights, never requirements. The text carries the koan; the scene sets the room it happens in.

**Ink and paper.** One coherent visual language across all 48 scenes: ink values on warm paper, fog instead of horizons, torn-paper island edges, a single accent color per koan. Low-poly primitives, flat shading, no textures beyond paper grain and brush alphas.

**Calm by default.** No score, no streaks, no completion percentage. Slow cameras, generous silence, nothing that rushes the reader. Progression is lanterns, not checkmarks — koans are sat with, not completed.

**Everything procedural, everything small.** Geometry from primitives, audio synthesized in Web Audio, no downloaded assets in v1. Target: the entire experience under ~1.5 MB gzipped. Loads instantly, runs offline as a PWA.

**Read it your way.** Linear path, free-roam garden, or direct menu jump — all three are first-class. The full text is always accessible without touching the 3D at all.

## 3. Art Direction — Sumi-e Low Poly

The unifying conceit: every scene is an ink painting that happens to be three-dimensional. Concretely:

**Palette.** The base world is monochrome: 3–4 ink values (near-black `#1E1E24`, two grays) on warm washi paper (`#F3EDDF`). Each koan then gets exactly one accent hue — the equivalent of the vermillion seal stamp on an ink painting. Case 29's flag is the only red thing in its scene; case 28's candle flame is the only gold. This answers the palette question: we're not enforcing 3–4 arbitrary colors per koan, we're enforcing ink + paper + one seal color, which gives variety across cases and coherence within each. Accents are a per-koan module parameter, so tuning is trivial.

**Fog as ink wash.** `FogExp2` colored to the paper background, tuned so ground planes dissolve into the page before any horizon appears. Distant objects read as diluted ink. This is the single cheapest, highest-impact trick in the whole art direction — nothing in any scene ever meets a skyline.

**Shading.** `MeshToonMaterial` with a 2–3 step ramp, `flatShading` where facets should show. One directional light. Shadows are *painted wash blobs* (soft dark ellipses on the ground plane) rather than shadow maps — cheaper, and more in-style than crisp projected shadows.

**Outlines.** Inverted-hull outlines per mesh (scaled back-face shell in ink color) as the default — cheap, mobile-safe, controllable per object. A slight low-frequency vertex wobble in the outline shader gives strokes a hand-brushed irregularity. A post-process Sobel edge pass is an optional upgrade for hero scenes on desktop.

**Paper grain.** A static fullscreen multiply overlay of subtle washi texture (procedural noise baked once at startup — not per-frame, to avoid shimmer). Slight vignette.

**Diorama staging.** Each koan is a floating island — a disc or slab of ground whose edge is a torn-paper silhouette — against bare paper. Camera is a gentle orbital with limited range plus cursor/gyro parallax. Scenes are composed like paintings: strong negative space, off-center subjects, one or two brush-alpha planes (grass tufts, branch strokes) for texture.

**Motion.** Character animation optionally sampled "on twos" (~12 fps hold) for a hand-made feel; environmental motion (cloth, water, fog drift) stays smooth at full framerate. The contrast between held character poses and living environment is itself very sumi-e.

**Transitions.** All scene changes use one shader: a noise-threshold dissolve tinted like wet ink spreading through paper, 600–900 ms. Used for hub↔koan, koan↔koan, and meditation entry.

## 4. Structure & Navigation

### 4.1 The hub — the garden path

The title is the frontispiece: the reader arrives on a quiet path before a freestanding gate with no door. Walking through it is the only "start button." Beyond, a winding path passes 48 stations grouped into six regions of eight — bamboo grove, rock garden, pond, hillside, forest, summit — mapped across a day cycle (dawn at case 1, night by case 48). Each station is a small shrine/plinth showing a miniature of its diorama; approaching and tapping it enters the koan. Regions lazy-load; the hub itself stays lightweight.

### 4.2 The menu — jump anywhere

A persistent button in the top corner (an ensō mark) opens a full-screen overlay:

- Scrollable list of all 48 cases — number, title, first line, and lantern state (unvisited / visited / sat-with).
- Tap any case to jump straight to it (ink dissolve, no hub round-trip).
- Settings live here too: sound on/off, narration voice + rate, text size, reduced motion, mic permission.
- Also from here: "Continue" (last position), "Meditate," and "About."

### 4.3 Linear reading

Inside any koan, previous/next chevrons (and keyboard arrows) step through cases in order — the Mumonkan read cover to cover without ever returning to the hub. `Esc` or a back gesture returns to the garden at the corresponding station.

### 4.4 Deep links

Every case has a URL hash (`#k29`), so individual koans are shareable and bookmarkable. The PWA restores last position on launch.

### 4.5 Reading mode

A plain, beautifully typeset text-only view of the whole book (one long scrollable page) is always available from the menu — the accessibility fallback, the low-power fallback, and honestly a nice way to read in bed.

## 5. The Koan Experience

Entering a case plays its ink dissolve and reveals the diorama with ambient audio. The text presents as a hanging scroll (kakemono): a DOM overlay that unrolls down the right side on desktop or rises as a bottom sheet on mobile. It has three progressive sections — **The Case**, **Mumon's Comment**, **The Verse** — each with a speak button; a master play button reads all three in sequence. The scroll can be tucked away entirely to leave just the scene.

Interaction hinting is minimal by design: at most a single soft glyph pulse on the interactive object after ~10 seconds of idle. Discovering that stillness *is* the verb in case 29 should feel like getting the joke, so we never tutorialize it.

### 5.1 Tier system

Every case ships with text + narration + ambience + diorama. What varies is interactivity:

- **Tier 1 — Hero.** A bespoke mechanic that embodies the koan. Launch target: 12 (see matrix; §6).
- **Tier 2 — Reactive.** Kit-built diorama with one light touch behavior — something responds to tap, drag, or gaze.
- **Tier 3 — Tableau.** Staged scene with ambient motion only (fog, cloth, water, flame).

Tiers are an upgrade path, not a ceiling: post-launch, Tier 2/3 cases get promoted as bespoke ideas prove out.

### 5.2 Interaction verbs

The whole experience uses five verbs, and each koan uses at most two:

| Verb | Input | Notes |
|---|---|---|
| Look | orbit / parallax (drag, gyro) | always available |
| Touch | tap, drag | primary interaction |
| Stillness | measured input idle | a first-class verb; the signature move |
| Breath | microphone (optional) | case 28 only at launch; always has a tap fallback |
| Walk | move along hub path | hub only |

### 5.3 Sensitive cases

Several koans involve violence in the source text (3: severed finger, 5: fatal fall, 14: the cat, 41: Eka's arm). The style guide handles all of them through ink metaphor, never literal harm: in case 14 it is the *paper scene* that tears in two, and placing the sandal on your head mends it; case 5's fall is an ink splash that re-pools into the monk; case 41 leaves a single vermillion seal in white snow. This keeps the experience gentle enough for anyone while staying honest about the stories.

## 6. Content Matrix — All 48 Cases

Concepts below are first-pass; titles follow common English renderings. Tier assignments are provisional — the launch commitment is 10 heroes, stretch 12 (marked ★).

| # | Case | Diorama | Interaction concept | Tier |
|---|---|---|---|---|
| 1 | Joshu's Dog | Dog at a temple gate, monk before Joshu | Every dialog choice offered is the same: **Mu**. ★ | 1 |
| 2 | Hyakujo's Fox | Cave behind the mountain hall | Circle the diorama: from one side an old man, from the other a fox — same silhouette | 2 |
| 3 | Gutei's Finger | Gutei seated, one finger raised | Point at anything; whatever the cursor touches reduces to a single ink stroke | 2 |
| 4 | The Barbarian Has No Beard | Portrait scroll of Bodhidharma | Try to brush a beard on; the ink refuses, strokes dissolve | 2 |
| 5 | Kyogen's Man in a Tree | Monk hanging by his teeth over a cliff; questioner below | Wait, or answer — answering means the fall (ink splash, re-pools). ★ | 1 |
| 6 | Buddha Twirls a Flower | The assembly on Vulture Peak, one flower held up | Do nothing. After ~20 s of stillness, one figure smiles. ★ | 1 |
| 7 | Wash Your Bowl | Joshu, a novice, a bowl, a basin | Drag to wash the bowl. Ripples. That's it. ★ | 1 |
| 8 | Keichu's Wheel | A cartwright's wheel on a stand | Pull spokes out one by one; hubless, the wheel keeps turning as a pure circle. ★ | 1 |
| 9 | A Buddha Before History | Vast seated figure across geological strata | Scrub time across eons (day cycle, erosion); the sitting figure never changes | 2 |
| 10 | Seizei Alone and Poor | A beggar-monk with an empty mat | Offer him things; each gift turns to ink smoke | 2 |
| 11 | Joshu Examines the Hermits | Two identical huts on a hill | Raise a fist at each door; identical gesture, opposite verdicts | 2 |
| 12 | Zuigan Calls His Master | A figure alone on a cliff | Tap to call "Master!" — the echo answers "Yes?" | 2 |
| 13 | Tokusan Holds His Bowls | Hall between bell tower and drum tower | Strike bell or drum; the timing is never right | 2 |
| 14 | Nansen Cuts the Cat | Two rows of arguing monks, a cat, Nansen | Asked for a word of Zen, any answer tears the paper scene in two; drag the sandal onto your head to mend it. ★ | 1 |
| 15 | Tozan's Sixty Blows | Ummon's gate at evening | Tableau; drum-strike ambience | 3 |
| 16 | The Sound of the Bell | Bell tower, monks, ceremonial robes | Pull the bell rope; robes flow (cloth) as monks turn to the hall | 2 |
| 17 | The Teacher's Three Calls | Teacher and attendant across a courtyard | Call three times; he answers three times | 3 |
| 18 | Three Pounds of Flax | Tozan at a scale, weighing flax | Grab handfuls on or off; the scale always reads the same | 2 |
| 19 | Ordinary Mind Is the Way | A yard: broom, kettle, path | Sweep, pour tea, walk; seasons quietly change as you do chores. ★ | 1 |
| 20 | The Man of Great Strength | A colossal figure frozen mid-stride | Try to move him — the world moves instead | 2 |
| 21 | Ummon's Dried Dung-Stick | A bare yard, the blunt answer stamped like a seal | Tableau; deadpan by design | 3 |
| 22 | Kashyapa's Flagpole | Ananda and Kashyapa before the gate's flagpole | Push the flagpole over; it falls into an ink splash | 2 |
| 23 | Think Neither Good Nor Evil | Mountain pass, a robe laid on a rock | Try to lift the robe; it will not move; then the question comes | 2 |
| 24 | Without Words, Without Silence | A seated master, birds, wind | Toggle him speaking / mute — both ring false; the wind answers | 3 |
| 25 | The Sermon of the Third Seat | A hall floating in clouds — a dream | Everything wobbles slightly, dream-physics; look around | 3 |
| 26 | Two Monks Roll Up the Blinds | A hall with two bamboo blinds | Roll both up, identically; "one gains, one loses" stamps appear | 2 |
| 27 | Not Mind, Not Buddha, Not Things | A full scene: hall, tree, moon | Tap each named thing to erase it, until only paper remains. ★ | 1 |
| 28 | Blow Out the Candle | Tokusan and Ryutan at night, one paper lantern | Blow into the mic (tap fallback); darkness — then stars. ★ | 1 |
| 29 | Not the Wind, Not the Flag | Temple gate, flag on a pole (cloth sim) | The flag flaps only while your input moves; hold perfectly still and it stills. ★ | 1 |
| 30 | This Mind Is Buddha | A still pond before a Buddha figure | The statue's reflection is your camera | 2 |
| 31 | Joshu Investigates the Old Woman | A fork in the road, a tea stall | Whichever way you go, she points "straight ahead"; the road loops | 2 |
| 32 | The Philosopher Questions Buddha | Buddha seated before a visitor | Any input produces nothing; after enough stillness, the visitor bows | 3 |
| 33 | This Mind Is Not Buddha | The same pond as case 30 | The reflection is now empty (deliberate paired scene) | 3 |
| 34 | Learning Is Not the Path | A study piled with scrolls | Open a scroll; the words scatter as birds | 2 |
| 35 | Seijo's Two Souls | Two translucent figures of the same girl | Scrub a slider: they walk apart and merge; which is real? | 2 |
| 36 | Meeting a Master on the Road | A road, a figure approaching | Your verbs (speak / stay silent) are both grayed out; you pass through each other like smoke | 2 |
| 37 | The Oak Tree in the Garden | One magnificent tree, full orbit | Ask the questions; only wind through branches answers | 2 |
| 38 | The Buffalo Through the Window | An ox and a lattice window | Drag the ox through: head, horns, hooves pass — the tail never does. ★ | 1 |
| 39 | Caught in Words | Stepping stones of words across dark water | Recite the quoted poem: the word-stones sink mid-sentence | 2 |
| 40 | Kick Over the Water Vase | The vase on a stand, the assembly watching | Kick it over (physics); the spill becomes the ink wash that floods to the next scene. ★ | 1 |
| 41 | Bodhidharma Pacifies the Mind | Snowfall, a cave, Eka outside | "Bring me your mind": search the scene — the cursor grasps nothing; a single vermillion seal in the snow | 2 |
| 42 | The Girl Comes Out of Samadhi | The girl in samadhi beside the Buddha; Manjusri | Snap as Manjusri: nothing. One tap as the novice Momyo: she wakes | 2 |
| 43 | Shuzan's Short Staff | Shuzan holding out the staff | Affirm it or deny it — either answer breaks it; grab it and walk instead | 2 |
| 44 | Basho's Staff | An empty rack | If you hold one, you're given one; if you hold none, it's taken | 3 |
| 45 | Who Is That One? | A road at dusk | A figure is always just behind your camera; turn — a glimpse, never face-on | 2 |
| 46 | Step Forward From the Pole | First-person, atop a hundred-foot pole | The only control is Step. ★ | 1 |
| 47 | Tosotsu's Three Barriers | Three gates standing in mist | Pass each by answering — or by walking on | 2 |
| 48 | Kembo's One Road | An open field, Kembo with his staff | He draws a line: "It begins here." Then you draw yours — your stroke becomes a gate | 2 |

★ = launch hero candidates: 1, 5, 6, 7, 8, 14, 19, 27, 28, 29, 38, 40, 46 — thirteen candidates for 10–12 slots; the weakest two get demoted to Tier 2 during production rather than cut (19 and 5 are the most likely demotions, since 19 is scope-heavy and 5 needs careful tone).

## 7. The Reusable Kit

The Mumonkan repeats itself, which is the entire production strategy.

**Character census.** Joshu appears in cases 1, 7, 11, 14, 19, 31, 37; Nansen in 14, 19, 27, 34; Ummon in 15, 16, 21, 39, 48; Bodhidharma in 4 and 41 (and haunts 37's question); the Buddha in 6, 22, 32, 42. One procedural monk rig covers all of them.

**The monk rig.** Capsule body, sphere head, cone hat, cylinder arms — assembled by a `monk(params)` builder with parameters for build (stout/thin/tall), robe color value, prop (staff / whisk / bowl / broom / none), pose (stand, sit zazen, bow, walk cycle, point, hold-up), and face (none by default — featureless ink figures; a smile is an event, which makes case 6 land). Named masters are just parameter presets: `JOSHU = monk({stout, whisk, ...})`.

**Prop library.** Staff (43, 44, 48), bowl (7, 13), bell + drum (13, 16), lantern/candle (28, hub ×48), blinds (26, cloth), scroll (34, text UI), vase (40), sandal (14), flag (22, 29, cloth), wheel (8), scale (18). One generic quadruped morphs into dog (1), fox (2), cat (14), and ox (38) via proportion parameters.

**Environment tiles.** Temple hall, gate, garden yard, mountain ledge, road, pond, cave, cliff — each a composable island slab. The hero tree (5, 37) and the hub gate are one-off showpieces.

**Scene grammar.** Every diorama is: island slab + 1–2 environment tiles + 1–4 monks + props + accent object + brush-alpha dressing + ambience tag. A new Tier 2/3 koan should cost hours, not days.

## 8. Text, Translation & Typography

**Structure.** Each case carries three texts — the case itself, Mumon's commentary, and his closing verse — stored as plain strings in the koan module. Total corpus is small (roughly 15–20k words for the whole book).

**Translation plan.** The 13th-century original is public domain. For English: the 1934 Senzaki–Reps translation (the one later collected in *Zen Flesh, Zen Bones*) is the classic candidate — its copyright status is worth verifying before shipping it, but it's plausible and worth the check. If it doesn't check out, we write our own plain-language retellings from the original — a real option here, since the corpus is tiny, and it gives us full control of tone and reading level. Either way, an "About the text" page credits sources properly. (Worth a proper look before launch; I can't make the copyright call definitively.)

**Typography.** DOM text, never in-WebGL — crisp, selectable, translatable, screen-reader-friendly. A quiet serif for the koan text, small caps for section labels, generous leading, ink color on paper color to match the scene. Case numbers set like seal stamps in the accent color.

## 9. Audio & Speech

**Ambience — fully procedural (Web Audio).** A small synth kit, all math, no samples. *(v0.2: no singing bowl — too on-the-nose — and no crickets/cicadas. Minimal and chill.)*

- *Temple bell:* partial stack with a strike transient; used for the meditation timer start/end (and cases 13, 16 later).
- *Wind:* filtered noise with slow LFO on cutoff and gain; subtle; worth experimenting with per scene.
- *Water:* filtered noise bed + randomized sine-blip drips (7, 30, 39, 40).
- *Mokugyo (wood block), bamboo knock* round out the palette.

Each koan module declares an ambience recipe (`['wind:0.3','crickets','bell:rare']`). Master audio starts muted until first user gesture (autoplay policy) with a tasteful "sound on?" prompt at the gate.

**Narration.** v1 uses the built-in `speechSynthesis` API: zero cost, zero payload. Rate ~0.85, a settings picker for voice (quality varies wildly across platforms), a highlight following the spoken section, and the iOS caveat handled (speech must start from a user gesture). Post-launch upgrade: pre-generate all 48 readings once with a high-quality TTS voice and ship them as static Opus files (~10–15 MB total), lazy-loaded per case — consistent everywhere, offline-friendly, no runtime AI. Architecture treats narration as an interface (`speak(section)`), so the swap is invisible.

**Mic input (case 28).** `getUserMedia` + `AnalyserNode`, detecting a broadband low-frequency burst (a blow, not a word). Permission requested only on entering case 28, with a one-line explanation and a tap fallback that is never framed as the lesser option.

## 10. Meditation Mode & Progression

**Sitting.** From any koan (or the hub), a "Sit" action: the scroll tucks away, UI fades to nothing, the camera settles into its slowest drift, and an ensō breathing guide pulses on a gentle 6-second cycle. Bowl strike at start and end; optional interval bells. Presets: 2 / 5 / 10 / 20 minutes or custom. Screen wake-lock while sitting.

**The log.** localStorage records per-koan visited state, per-koan sit time, total sit time, and session count. No cloud, no accounts; an export/import button (JSON) for people who care.

**Check-off, kept tasteful.** *(Rewritten in v0.2.)* The menu carries the progress: each case can be checked off once you've done it, rendered as a small vermillion seal beside the title — a reader's checklist, not a score. Visited cases get a subtle dot automatically. If the garden ambience ever returns, lanterns can mirror this state as decoration.

## 11. Technical Architecture

**Stack.** Vanilla JS + Three.js, Vite build, no framework. DOM overlay for all UI. localStorage for state, URL hash for routing, service worker + manifest for PWA/offline.

**Module contract.** Each koan is a lazy-loaded ES module:

```js
export default {
  id: 29,
  slug: 'wind-flag',
  title: 'Not the Wind, Not the Flag',
  accent: '#C73E3A',
  tier: 1,
  text: { case, comment, verse },
  ambience: ['wind:flag', 'crickets:0.2'],
  build(ctx) {
    // ctx: { scene, kit, audio, input, accent, quality }
    // returns { update(dt), onEnter(), onExit(), dispose() }
  }
}
```

`kit` is the procedural builder library (monk, quadruped, props, tiles, island). `input` exposes the five verbs, including a `stillness` value (seconds since last input) so the signature mechanic is one line in any koan.

**Core systems.** SceneManager (one renderer, swap roots), TransitionManager (the ink-dissolve shader), Kit (procedural geometry, all `BufferGeometry` merged per island where possible), AudioEngine (synth kit + narration interface), UIManager (scroll panel, menu, settings), SaveState, Router.

**Cloth.** A single small Verlet solver (pin constraints, distance constraints, noise wind force) shared by the flag (29, ~24×16 grid), the blinds (26), and robe flourishes (16). CPU is fine at these sizes; runs in the koan's `update`.

**Physics.** No physics engine. The two physical moments (vase 40, flagpole 22) are hand-rolled: a pivot fall with easing plus an ink-splash particle burst reads better in this style than rigid-body realism would.

**Rendering & performance.** Pixel ratio capped at 2; toon ramp + inverted hulls double draw calls, so islands merge static geometry aggressively and instance repeated elements (48 lanterns, stones). Budget: < 150 draw calls in any scene, 60 fps desktop / 30+ fps mid-tier mobile. A `quality` flag in `ctx` lets heroes shed extras (Sobel pass, particle counts) on weak devices. No shadow maps anywhere (blob washes only) keeps the frame cheap.

**Size budget.** Everything procedural: code + Three.js ≈ 200–250 KB gzipped, no asset downloads in v1. The whole app should install as a PWA in under a second on decent wifi.

## 12. Accessibility & Comfort

Full reading mode with zero WebGL (also the fallback for failed contexts). All text real DOM — selectable, zoomable, screen-reader-ready, with ARIA labels on scene descriptions ("A monk holds up one finger"). `prefers-reduced-motion` honored: parallax off, transitions become crossfades, cloth settles. Every mic/gyro interaction has a touch equivalent. Keyboard: arrows to step cases, Enter to interact, Esc to hub, M for menu. Color never carries meaning alone (lantern states differ in shape too).

## 13. Milestones

**M0 — Look-dev proof (small).** One throwaway scene: monk + tree + gate on an island, toon ramp, inverted hulls, fog-to-paper, grain, blob shadows, ink-dissolve transition, and the Verlet flag. This single scene validates or kills the entire art direction — nothing else starts until it sings.

**M1 — Vertical slice.** The hub gate + one region stub + case 29 complete end-to-end: scroll UI, narration, ambience, stillness mechanic, sit mode. This is the "is it actually good?" milestone.

**M2 — Systems.** Menu, router/deep links, settings, save state, lantern progression, meditation timer full, PWA/offline, reading mode.

**M3 — The book.** All 48 cases at Tier 3 minimum: kit build-out, every text in, every ambience recipe assigned. The whole Mumonkan is readable, narrated, and staged.

**M4 — Heroes.** The 10–12 Tier 1 interactions, hardest first (38's tail constraint and 28's mic detection carry the most unknowns).

**M5 — Polish & launch.** Audio pass, performance pass on real phones, a11y audit, About/credits, social share cards per koan (a rendered still + the case's first line).

Rough shape: M0 is days; M1–M2 a few weeks each; M3 is the grind (mitigated by the kit); M4 is the fun part.

## 14. Risks & Open Questions

**Risks.** (1) Translation copyright — resolved by verify-or-retell, decided before M3. (2) Outline + toon cost on low-end mobile — M0 tests on a real cheap phone, quality flag as escape hatch. (3) Mic permission friction — case 28 only, graceful fallback, never blocks. (4) `speechSynthesis` voice quality — mitigated by voice picker, solved post-launch by baked Opus. (5) Scope: 48 of anything is a lot — the tier system and scene grammar exist precisely so the long tail is cheap; if M3 drags, Tier 3 is allowed to be *very* minimal. (6) Tone drift — the temptation to make heroes "gamey"; the pillar "the interaction is the koan" is the tiebreaker in every design argument.

**Open questions.** Final title (working: *The Gateless Gate*; alternatives worth a pass: *Gateless*, *Mumonkan*, *48 Gates*). Sound prompt wording at the gate. Whether hub walking is free movement or on-rails glide between stations (leaning on-rails for mobile comfort). What the 48th-lantern moment is. Whether case 21's bluntness gets softened in UI copy or presented straight (leaning straight — it's the text).

---

*Next step after sign-off: M0 look-dev scene. If the ink holds up, everything else follows.*
