# Overnight Staging — the 31 remaining cases

> Frank's directive (2026-07-23, going to sleep): "bang them all out, then we
> can improve them as we go." Volume night. Every case gets a real diorama,
> commit-per-case so any verdict is one revert. Executor: this session,
> switched to Opus after planning (Frank's call). No user gates until morning.

> **DONE 2026-07-23.** All six batches shipped; 48/48 staged, suite 374 green.
> Outcome, exceptions and review debt are recorded in `.superpowers/sdd/progress.md`
> under "THE BOOK IS STAGED", and in design-doc revision note 16.

**State at planning:** 17 of 48 staged (1,2,3,5,6,7,14,16,19,23,26,29,37,38,40,46,47).
Suite 307 green. Remaining: 4,8,9,10,11,12,13,15,17,18,20,21,22,24,25,27,28,
30,31,32,33,34,35,36,39,41,42,43,44,45,48.

**Authority order:** the actual Senzaki–Reps text (src/koans/text/mumonkan.js)
governs staging; the design doc §6 matrix is the interaction hint. Where they
disagree (11, 15, 22, 31, 39), the text wins.

## House pattern (copy from k16/k37/k7 — read one before starting)

- Module: `{ id, slug (slugify(title) — MUST match koans/index.js), title:
  TEXT[ID].title, accent: ACCENT, tier, text, ambience, mood?, camera?, build }`.
- build: scene + PAPER bg + FogExp2(PAPER, ~0.030) + makeLights, staging,
  composeWorld with keepout/grassKeepout, blob shadows, **addOutlines LAST**
  (it traverses once — everything added before it), then the tap moment.
- Return `{ scene, setCamera, update, fragment, dispose }`. fragment() exposes
  interaction counters for tests/headless.
- Determinism: NO Math.random. Seeded hash1/noise, closed forms over simTime.
- Palette: WASH ramp only + ACCENT on the one thing the case turns on
  (ACCENT_DEEP for big masses, ACCENT_LIGHT for emitting/flat things).
- Ambience recipes: types wind/music/water get started by engine; other names
  (bell, furin, odoshi, knock, drum…) are inert emitter names that thin the
  drift. Beds (wind, music) don't count as emitters.
- Audio one-shots available: audio.bell({f0}), audio.chimeStrike({tube,force}),
  audio.knock({force}) (bamboo), audio.drip({loud}), audio.pour().
- Registry: add `N: () => import('./kN.js')` to LOADERS in registry.js.
- Commit per case: `feat: kN — <short poetic title>`. Suite run per batch.
- Ledger append per batch: .superpowers/sdd/progress.md.

## Batch 1 — new kit (tests required, behaviors live IN the kit)

| piece | for | design |
|---|---|---|
| `kit/wheel.js` makeWheel | k8 | cartwheel on a stand: rim, hub, N spokes. update: slow constant turn. `pullSpoke()` shrinks/removes next spoke; `restore()` brings all back; `spokesLeft()`. Hubless wheel keeps turning. |
| `kit/scale.js` makeScale | k18 | steelyard beam on a post: beam + hanging pan + counterweight. `disturb(force)` → damped closed-form tip that settles to the SAME rest angle. `reading()` constant. |
| `kit/drum.js` makeDrum | k13 | barrel drum on a frame beside the bell. `strike()` → skin pulse + body rock (closed-form). `pickTargets()`. |
| `kit/rack.js` makeRack | k44 | two posts + rail; `toggle()` grows/removes one leaning staff; `holding()`. |
| `kit/birds.js` makeBirds | k24, k34 | dark chevrons on seeded closed-form orbits over simTime; `scatter()` adds decaying energy (higher, faster, wider), resettles. Deterministic. |
| `kit/snowfall.js` makeSnow | k41 | paper-white flecks, per-flake seeded phase/speed/sway, y wraps in closed form over simTime. Bounded box. Deterministic. |

Tests: wheel spoke count + turn continuity; scale settles to rest; rack toggle;
birds determinism + scatter decay; snow bounds + determinism. Export all from
kit/index.js. Commit per piece or pairs.

## Batches 2–6 — the cases

Per case: slug is slugify(title). Format: staging / tap moment / ambience+mood.

### Batch 2 — objects & yards
- **k8 Keichu's Wheel** (tier 2): wheel on its stand in a wheelwright's yard,
  monk regarding it. / Tap wheel → pullSpoke; at zero the bare rim keeps
  turning (the koan); tap the bare rim → restore all fifty at once. /
  `['wind:0.2','wheel','music']`, mood yo.
- **k13 Tokusan Holds His Bowl** (2): hall between bell frame (makeBell) and
  drum frame (makeDrum); Tokusan mid-yard holding his bowl (accent bowl).
  / Tap bell → bell; tap drum → drum strike + audio.knock({force:1}). The
  dinner drum not yet beaten. / `['wind:0.14','bell','drum','music']`, in.
- **k18 Tozan's Three Pounds** (2): Tozan at the steelyard, flax bales
  (makeBundle or WASH.dry boxes) beside; accent = the weighed bundle. / Tap
  scale → disturb; it always settles to the same reading; soft knock. /
  `['wind:0.16','scale','music']`, yo.
- **k21 Dried Dung** (3): the bare yard — wide grassKeepout circle of bare
  ground, one dry stake standing alone (kanshiketsu), a monk regarding it
  from a distance. Deadpan, sparse, trees far. / Tap stake → it wobbles
  (damped closed form) + dry knock. / `['wind:0.3','music']`, in.
- **k43 Shuzan's Short Staff** (2): Shuzan (elder) holding the short staff
  OUT (accent staff, horizontal in his raised sleeve), two monks before him.
  / Tap staff → it flexes + knock — neither name nor no-name lands. /
  `['wind:0.18','staff','music']`, in.
- **k44 Basho's Staff** (2): the rack near a hut veranda, Basho beside it.
  / Tap rack → toggle: have one and it's given (a second appears)… hold none
  and it's taken (empties). Alternate. / `['wind:0.18','rack','music']`, in.

### Batch 3 — halls & figures
- **k4 A Beardless Foreigner** (2): a kakemono scroll hung under a veranda /
  frame: paper plane, ink silhouette of Bodhidharma (broad hooded head —
  famously bearded, painted here beardless). Wakuan before it. / Tap portrait
  → an ink beard-stroke fades in and refuses — dissolves away. /
  `['wind:0.16','music']`, in.
- **k9 A Buddha before History** (2): a VAST makeBuddha (height ~6) sunk to
  the waist in the hillside, weathered — strata = terraced ground rings;
  tiny monk at its base for scale. / Tap the figure → the slowest, lowest
  bell (f0 ~ 49). Ten cycles of existence. / `['wind:0.12','music']`, in.
- **k17 Three Calls** (2): teacher seated on a veranda, attendant across the
  courtyard. / Tap teacher → a call (knock force 1); attendant turns a third
  of the way; third call → he bows (lean). Then it resets. /
  `['wind:0.14','call','music']`, in.
- **k20 The Enlightened Man** (2): a colossal monk (×3 height) frozen
  mid-stride on the road — one sleeve forward. / Tap him → HE doesn't move;
  the whole world group nudges and settles (damped spring on scene root
  offset). / `['wind:0.25','music']`, in.
- **k32 A Philosopher Asks Buddha** (3): Buddha seated, philosopher standing
  before him. / Temporal: taps do nothing but count; after ~20s with no taps
  the philosopher bows slowly (the silence answered). Reset on tap. /
  `['wind:0.1','music']`, in.
- **k42 The Girl Comes Out from Meditation** (2): girl (small monk, hat:false,
  sit) in samadhi center; Buddha behind; Manjusri standing near. / Tap the
  GIRL (Manjusri's snap): nothing — a soft chime and no motion. Tap the
  GROUND: Momyo springs up from the earth (grows from y<0) and she stirs —
  head lifts. / `['wind:0.1','music']`, in.

### Batch 4 — huts & interiors
- **k10 Seizei Alone and Poor** (2): Seizei kneeling on a bare mat before
  Sozan's hut; between them three tiny wine cups (accent). / Tap a cup → a
  quiet drip (the wine he already drank); each cup once; then they've all
  been empty the whole time. / `['wind:0.18','music']`, in.
- **k11 Joshu Examines a Monk in Meditation** (2): meditation hut on a rise;
  the monk seated before it, one arm RAISED (pose 'raise' — the fist); Joshu
  on the path below. / Tap the seated monk → alternating verdicts: first tap
  Joshu turns away (shallow water), next tap Joshu bows (well given). Same
  fist both times. / `['wind:0.2','music']`, in.
- **k15 Tozan's Three Blows** (3): Ummon's gate at evening — makeGate, path
  through it, Tozan bowing (lean) before Ummon (elder). Fog slightly denser
  (evening). / Tap the gate → three light knocks, spaced — the blows that
  were forgiven. / `['wind:0.2','music']`, in.
- **k22 Kashapa's Preaching Sign** (2): the preaching-sign pole = makeFlag
  (banner, ACCENT_DEEP) before a gate; Kashapa (elder) and Ananda facing.
  Flag kit carries hover-ruffle + click-still behaviors already. /
  `['wind:0.3','flag','music']`, yo (brothers, spring).
- **k34 Learning Is Not the Path** (2): a study: hut with scroll piles
  (small pale cylinders) spilling out the door onto a mat; Nansen apart,
  facing away. / Tap a scroll pile → birds (makeBirds burst variant or
  scatter from resting) — the words fly off as birds. /
  `['wind:0.14','music']`, in.
- **k35 Two Souls** (2): dusk road between village (hut, far) and home
  (hut, near); TWO copies of the same girl-figure (monk hat:false),
  semi-transparent, walking a slow closed-form cycle apart and back
  together; where they merge they'd be opaque. / Tap either → they drift
  toward each other briefly (phase nudge). / `['wind:0.16','music']`, in.

### Batch 5 — water & dream
- **k30 This Mind Is Buddha** (2): still pond (large makeWater), Buddha on
  the far bank; his mirrored clone (scale.y=-1, translucent, noOutline)
  under the surface as the reflection. / Tap water → ripple + loud drip;
  kit water carries it. / `['wind:0.12','water:0.4','music']`, yo.
- **k33 This Mind Is Not Buddha** (3): the SAME pond staging, seed and
  camera — and the far bank empty, no Buddha, no reflection. The pair is
  the point. / Tap water → ripple + drip. / `['wind:0.12','water:0.4','music']`, in.
- **k39 Ummon's Sidetrack** (2): stepping stones arcing across dark water
  (WASH.deep pond); the far stones already gone under. / Tap a stone → it
  sinks below the surface (eased) + drip; when all are sunk they slowly
  rise back. Mid-sentence, the recitation loses its footing. /
  `['wind:0.14','water:0.6','music']`, in.
- **k25 Preaching from the Third Seat** (3): a dream: veranda hall floating
  in cloud — fog much denser (0.055), ground barely there, monks in rows,
  Kyozan standing at the third seat, gavel block before him. The whole
  diorama group rocks almost imperceptibly (closed-form) — dream physics. /
  Tap the gavel → knock; the wobble deepens for a breath. /
  `['wind:0.1','music']`, in.
- **k27 Not Mind, Not Buddha, Not Things** (1 ★): a full scene: small hall,
  one fine tree, the moon (ACCENT_LIGHT, makeMoon) low in the sky. / Tap
  hall → it sinks into ink (scale/sink anim) and is gone; same for tree;
  same for moon; each subtracts until only paper, fog, ground remain. Tap
  bare ground → everything returns. fragment counts what stands. /
  `['wind:0.16','music']`, in.

### Batch 6 — roads & night
- **k12 Zuigan Calls His Own Master** (2): a figure alone on the cliff
  (makeCliff — k5's), morning. / Tap him → the call: knock(1); ~0.5s later
  the answer: knock(0.4) — he answers himself. Twice more, softer, if
  tapped again (sober up; don't be deceived). / `['wind:0.3','music']`, yo.
- **k24 Without Words, Without Silence** (2): springtime: seated master
  (sit) in a meadow of makeWildflowers, birds (makeBirds) circling high. /
  Tap the master → nothing from him; the birds scatter and sing — chime
  flurry (2–3 soft chimeStrikes). Spring answers. /
  `['wind:0.18','music']`, yo.
- **k28 Blow Out the Candle** (1 ★, tap fallback — no mic tonight): night
  veranda: Ryutan in the doorway, Tokusan on the step, ONE paper lantern
  with an accent flame. / Tap the flame → blown out: bg+fog lerp to deep
  ink-wash, lights dim, tiny paper-colored stars fade in. Tap the lantern
  again → relit, dawn returns. fragment: lit/dark. /
  `['wind:0.12','music']`, in.
- **k31 Joshu Investigates** (2): a road forking at a tea stall (open-front
  hut); the old woman (hat:false, stout, pose 'point') pointing straight
  ahead; a traveling monk mid-road. / Tap her → she points again — the
  same answer for everyone (small sleeve re-raise + knock). /
  `['wind:0.2','music']`, yo.
- **k36 Meeting a Zen Master on the Road** (2): a long road; a second
  figure stands facing the monk at middle distance — translucent. / Tap
  the translucent master → he thins further and drifts a step THROUGH
  the monk's position, re-forms beyond him — you cannot face him. /
  `['wind:0.2','music']`, in.
- **k41 Bodhidharma Pacifies the Mind** (2, SENSITIVE — ink metaphor only,
  no severed arm): snowfall (makeSnow), the cave (makeCave) with
  Bodhidharma seated facing its wall, Eka standing outside in the snow,
  arms folded. ONE vermillion seal — a small accent disc — in the snow
  between them (the only warm thing). / Tap anywhere in the snow → a
  faint ink wisp forms where you grasped and dissolves — the mind that
  cannot be held. The seal stays. / `['wind:0.35','music']`, in.
- **k45 Who Is He?** (2): a road at dusk, a lone monk walking. A second
  figure ALWAYS eases toward the point directly behind the camera
  (azimuth+π, lagged) — turn fast and you glimpse him; you never face
  him. / The glimpse IS the interaction; tap him if you catch him → soft
  far-bell. / `['wind:0.22','music']`, in.
- **k48 One Road of Kembo** (2): the last full case: open field, Kembo
  (elder) with staff raised, having just drawn the figure ONE — an accent
  ink stroke hanging in the air off his staff tip. Ummon's fan on a stone
  nearby. / Tap the stroke → it re-draws itself (scale-x sweep 0→1). Here
  it is. / `['wind:0.25','music']`, yo.

## Verification & wrap-up
- Full `npm test` green after every batch; fix before proceeding.
- `node --check` each new file before commit.
- After all: ledger entry, update this doc's state line, final report for
  Frank listing per-case one-liners + anything that needs his eyes/ears
  (k28's darkness, k45's behind-mechanic, k27's erasing, snow density).
- NOT tonight (queued separately): fūrin sway polish, bonshō-into-room ear
  decision, menu-chime level, suikinkutsu/han voice tables, k40 spill bed.
