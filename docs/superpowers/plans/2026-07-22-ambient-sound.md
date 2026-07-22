# Ambient Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the book two synthesized sound layers — a fūrin (glass wind bell) that rings on the wind that is actually blowing, and a sparse non-diegetic drift of swelled tones that thins automatically as a scene gains sound emitters.

**Architecture:** All pure logic (tuning, gust phase, partial tables, the random walk) lives in testable functions; every Web Audio node builder stays browser-only, matching the existing split in `src/audio/synths.js`. The fūrin is a kit component that owns its own behavior and reports rings through an `onRing` callback, so `src/kit/**` never imports the audio engine. The drift layer's note rate is derived from the case's own `ambience` recipe — the recipe is the declaration, so nothing needs hand-registering.

**Tech Stack:** Vanilla ES modules, Web Audio API, Three.js (vendored in `lib/`), `node --test`. No build step, no new dependencies, no audio assets.

## Global Constraints

- **No `Math.random` outside `src/audio/**`.** The drift layer is unseeded in production (deliberate — see spec), but every pure function takes an injected `rng` so tests are deterministic. `src/kit/furin.js` is NOT audio — it must be fully deterministic over `simTime`.
- **No audio files, no loops, no chanting, no voice, no singing bowl.**
- **Kit components never import the audio engine and never touch an AudioContext.** Behavior travels with the component; sound is emitted through an `onRing`-style callback the case supplies. The one thing `src/kit/**` may take from `src/audio/**` is `gustPhase` — a pure function with no side effects, and the whole point is that the chime and the wind synth share it.
- **Pure functions are tested; node builders are browser-only** and are not called from tests.
- Node 20+. Run tests with `npm test`; a single file with `node --test tests/<file>.test.js`.
- Follow the existing house style: named meshes, `toonMaterial`, colours from `WASH`/`palette.js` only, closed-form motion over `simTime`.
- The full suite must stay green — it is at **277 passing** as of the start of execution (the baked-narration work landed after this plan was written and added two).
- **`src/audio/engine.js` and `src/audio/narration*.js` now carry the baked-narration ducking.** Do not regress `duck()`, `masterTarget()`, `applyMaster()` or the `MASTER`/`DUCKED` constants. Task 5 edits this file — read it before you touch it.

---

### Task 1: The tuning

One scale for all 48 cases, the way there is one ink and one accent.

**Files:**
- Create: `src/audio/tuning.js`
- Test: `tests/audio.test.js` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `SCALE: number[]`, `ROOT_HZ: number`, `DRIFT_OCTAVES: number`, `hz(degree: number) => number`. Task 3 uses `hz` for the chime's `f0`; Tasks 4 and 5 use `SCALE`, `DRIFT_OCTAVES` and `hz`.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('hz maps scale degrees across octaves', () => {
  assert.ok(Math.abs(hz(0) - 146.83) < 0.01);          // the root, D3
  assert.ok(Math.abs(hz(5) - 293.66) < 0.02);          // degree 5 is the root an octave up
  assert.ok(Math.abs(hz(10) - 587.32) < 0.05);         // two octaves — the drift ceiling
  // the half-step at degree 1 is what makes this scale hirajoshi and not pentatonic
  assert.ok(Math.abs(hz(1) / hz(0) - Math.pow(2, 1 / 12)) < 1e-6);
  // negative degrees wrap down into the octave below rather than going nonsense
  assert.ok(hz(-1) < hz(0) && hz(-1) > hz(0) / 2);
  // strictly rising, so a walk never doubles back on pitch
  for (let d = -5; d < 15; d++) assert.ok(hz(d + 1) > hz(d));
});
```

Add `hz` to the existing import block at the top of the file:

```js
import { hz } from '../src/audio/tuning.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — `Cannot find module '.../src/audio/tuning.js'`

- [ ] **Step 3: Write the implementation**

Create `src/audio/tuning.js`:

```js
// The entire tuning. One scale for all 48 cases, the way there is one ink and
// one accent — so a case can never contain two pitched things that disagree.
//
// Hirajoshi, the koto tuning. The half-step at degree 1 is the whole reason to
// pick it: it is the interval that reads as unmistakably Japanese without the
// scale becoming a costume. Semitone offsets from the root.
export const SCALE = [0, 1, 5, 7, 8];
export const ROOT_HZ = 146.83;        // D3
export const DRIFT_OCTAVES = 2;       // how far the drift layer's walk may roam

// `degree` indexes SCALE repeated across octaves: 0..4 is the first octave, 5 is
// the root an octave up, -1 is the top of the octave below.
//
// Deliberately unbounded. DRIFT_OCTAVES constrains the drift layer's WALK, not
// this function — the furin calls it four octaves up and must not be clamped.
export function hz(degree) {
  const n = SCALE.length;
  const oct = Math.floor(degree / n);
  const step = degree - oct * n;      // 0..n-1 even when degree is negative
  return ROOT_HZ * Math.pow(2, oct + SCALE[step] / 12);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/audio.test.js`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/audio/tuning.js tests/audio.test.js
git commit -m "feat(audio): one tuning for the book"
```

---

### Task 2: The readable gust

The chime must ring *on* the gusts, not merely near them. The gust envelope currently lives entirely in the WebAudio graph where JS cannot see it; mirror the maths and make `makeWind` share the constants so the audible gust and the visible chime cannot drift apart.

**Files:**
- Modify: `src/audio/synths.js:56-58` (the two LFO frequency literals)
- Test: `tests/audio.test.js` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: `GUST_A: 0.043`, `GUST_B: 0.071`, `gustPhase(t: number) => number` in `[-1, 1]`. Task 6 uses `gustPhase` to sway and ring the fūrin.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('gustPhase is bounded, irregular, and crests at chime rate', () => {
  for (let t = 0; t < 600; t += 0.37) {
    const v = gustPhase(t);
    assert.ok(v >= -1 && v <= 1, `out of range at ${t}: ${v}`);
  }
  // Two incommensurate rates: never actually periodic inside a scene's lifetime.
  assert.ok(Math.abs(gustPhase(0) - gustPhase(120)) > 0.05);

  // Rising crossings of the chime threshold land 13-31s apart: often enough to
  // feel like weather, never a dead minute, never a double-ring.
  const THR = 0.45;
  const hits = [];
  let prev = gustPhase(0);
  for (let t = 0.05; t < 1800; t += 0.05) {
    const v = gustPhase(t);
    if (prev <= THR && v > THR) hits.push(t);
    prev = v;
  }
  assert.ok(hits.length > 60, `too few crests: ${hits.length}`);
  const gaps = hits.slice(1).map((t, i) => t - hits[i]);
  assert.ok(Math.min(...gaps) > 13, `crests too close: ${Math.min(...gaps)}`);
  assert.ok(Math.max(...gaps) < 31, `dead air: ${Math.max(...gaps)}`);
});
```

Extend the existing `synths.js` import at the top of the file to include `GUST_A, GUST_B, gustPhase`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — `gustPhase is not a function`

- [ ] **Step 3: Write the implementation**

In `src/audio/synths.js`, add above `makeWind`:

```js
// The gust envelope, mirrored out of the WebAudio graph so JS can read it.
//
// Two very slow incommensurate LFOs: the breeze rises and falls without ever
// settling into a period you could predict. makeWind drives its graph from these
// same two constants, so what you HEAR gusting and what you SEE ringing are the
// same weather — that causality is the entire point of the wind chime.
export const GUST_A = 0.043;
export const GUST_B = 0.071;
export const gustPhase = (t) =>
  (Math.sin(2 * Math.PI * GUST_A * t) + Math.sin(2 * Math.PI * GUST_B * t)) / 2;
```

Then replace the two hard-coded LFO rates inside `makeWind` (currently `lfoA.frequency.value = 0.043;` and `lfoB.frequency.value = 0.071;`) with `GUST_A` and `GUST_B`:

```js
  const lfoA = ctx.createOscillator(); lfoA.frequency.value = GUST_A;
  const lfoB = ctx.createOscillator(); lfoB.frequency.value = GUST_B;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/audio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/synths.js tests/audio.test.js
git commit -m "feat(audio): the gust becomes readable from JS"
```

---

### Task 3: The strike primitive and the chime voice

`strikeBell` is already a generic inharmonic struck resonator — partial stack, detuned pairs, filtered noise transient. Generalize it now, while there are only two callers, so the rest of the palette (wood, bamboo, stone) costs a table each later.

**Files:**
- Modify: `src/audio/synths.js:88-116` (`strikeBell`)
- Test: `tests/audio.test.js` (extend)

**Interfaces:**
- Consumes: `hz` (Task 1).
- Produces: `strike(ctx, dest, { partials, gain, transient })`, `chimePartials(f0) => {freq, amp, decay}[]`, `strikeChime(ctx, dest, { f0, gain })`. `strikeBell(ctx, dest, { f0, gain })` keeps its existing signature and behaviour. Task 5 uses `strike`'s sibling `makeSwell`; Task 7 reaches `strikeChime` through `audio.chime()`.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('chimePartials is glass, not bronze', () => {
  const c = chimePartials(2349);
  assert.ok(c.length >= 3);
  for (const x of c) assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
  // inharmonic, like the bell
  const ratios = c.map((x) => x.freq / 2349);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
  // amplitudes fall away from the fundamental
  for (let i = 1; i < c.length; i++) assert.ok(c[i].amp < c[i - 1].amp);
  // glass rings BRIEFLY and HIGH: a bonsho hangs on for ten seconds, this does not
  const bell = bellPartials(62);
  assert.ok(c[0].decay < 2, `chime decay too long: ${c[0].decay}`);
  assert.ok(c[0].decay < bell[0].decay / 4);
  assert.ok(c[0].freq > bell[0].freq * 10);
  assert.ok(c.length < bell.length);
});
```

Extend the `synths.js` import to include `chimePartials`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — `chimePartials is not a function`

- [ ] **Step 3: Write the implementation**

In `src/audio/synths.js`, add the chime table beside `bellPartials`:

```js
// Glass, not bronze: fewer partials, much higher, gone in about a second. A
// furin is one bright ting — a Western multi-tube chime would put far more
// events into the air than this book can absorb.
export function chimePartials(f0 = 2349) {
  return [
    [1.0, 1.0, 1.2], [2.4, 0.5, 0.8], [4.5, 0.28, 0.5], [6.8, 0.15, 0.3],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
}
```

Then replace the whole body of `strikeBell` with the generalized primitive plus two thin callers:

```js
// One struck resonator for the whole palette. Wood, glass, bronze, bamboo and
// stone are this same function with a different partial table, decay and
// transient — which is why generalizing it while there were two callers was
// cheaper than doing it at six.
export function strike(ctx, dest, { partials, gain = 1, transient = {} } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  for (const p of partials) {
    for (const det of [-0.35, 0.35]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq + det;
      const g = ctx.createGain();
      const peak = (p.amp * 0.11) / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.015);
      g.gain.exponentialRampToValueAtTime(peak * 0.001, t + p.decay);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + p.decay + 0.1);
    }
  }
  // the mallet: a short filtered noise burst, the part that says what hit what
  const { dur = 0.08, freq = 620, q = 1.2, amp = 0.25 } = transient;
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const ng = ctx.createGain(); ng.gain.value = amp;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}

export function strikeBell(ctx, dest, { f0 = 62, gain = 1 } = {}) {
  strike(ctx, dest, { partials: bellPartials(f0), gain });
}

export function strikeChime(ctx, dest, { f0 = hz(20), gain = 1 } = {}) {
  strike(ctx, dest, {
    partials: chimePartials(f0), gain,
    transient: { dur: 0.03, freq: 4200, q: 2.0, amp: 0.18 },
  });
}
```

Add the tuning import at the top of `src/audio/synths.js`:

```js
import { hz } from './tuning.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — including the pre-existing `bellPartials are inharmonic and decaying` test, whose output is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/audio/synths.js tests/audio.test.js
git commit -m "feat(audio): one strike primitive, and a glass voice for it"
```

---

### Task 4: The drift layer's structure

Random, but never shuffled. Four rules, all pure, all tested with an injected rng.

**Files:**
- Create: `src/audio/music.js`
- Test: `tests/music.test.js`

**Interfaces:**
- Consumes: `SCALE`, `DRIFT_OCTAVES` (Task 1).
- Produces: `nextDegree(prev, rng, lo?, hi?) => number`, `nextInterval(emitters, rng) => number` (seconds), `shouldRest(rng) => boolean`, and the constants `BASE_MIN = 6`, `BASE_MAX = 20`, `REST_CHANCE = 0.2`, `DRIFT_LO = 0`, `DRIFT_HI = 10`. Task 5 wraps all of these in the scheduler.

- [ ] **Step 1: Write the failing test**

Create `tests/music.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextDegree, nextInterval, shouldRest,
  BASE_MIN, BASE_MAX, REST_CHANCE, DRIFT_LO, DRIFT_HI,
} from '../src/audio/music.js';

// a deterministic stand-in for Math.random: cycles a fixed list
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('nextDegree never repeats the previous note', () => {
  // sweep the whole rng range against every degree in range: a repeat anywhere
  // would be audible as a stutter, which is the one thing this must never do
  for (let prev = DRIFT_LO; prev <= DRIFT_HI; prev++) {
    for (let r = 0; r < 1; r += 0.001) {
      const next = nextDegree(prev, () => r);
      assert.notEqual(next, prev, `repeat at prev=${prev} r=${r}`);
      assert.ok(next >= DRIFT_LO && next <= DRIFT_HI, `out of range: ${next}`);
      assert.ok(Number.isInteger(next));
    }
  }
});

test('nextDegree walks mostly by step, occasionally leaps', () => {
  const rng = (() => { let s = 1; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const counts = { 1: 0, 2: 0, far: 0 };
  let prev = 5;
  for (let i = 0; i < 20000; i++) {
    const next = nextDegree(prev, rng);
    const d = Math.abs(next - prev);
    if (d === 1) counts[1]++; else if (d === 2) counts[2]++; else counts.far++;
    prev = next;
  }
  const total = 20000;
  assert.ok(counts[1] / total > 0.45, `not enough stepwise motion: ${counts[1] / total}`);
  assert.ok(counts.far / total > 0.03, `never leaps: ${counts.far / total}`);
  assert.ok(counts.far / total < 0.30, `leaps too often: ${counts.far / total}`);
});

test('nextDegree reflects at the edges instead of piling up', () => {
  // pinned to the largest upward step, the walk must come back down off the top
  const up = seq(0.999);
  let d = DRIFT_HI;
  for (let i = 0; i < 20; i++) {
    d = nextDegree(d, up);
    assert.ok(d >= DRIFT_LO && d <= DRIFT_HI);
  }
  assert.ok(d < DRIFT_HI, 'stuck at the ceiling');
});

test('nextInterval stretches as a scene gains emitters', () => {
  const half = () => 0.5;
  const base = nextInterval(0, half);
  assert.ok(base >= BASE_MIN && base <= BASE_MAX);
  assert.ok(Math.abs(nextInterval(1, half) / base - 1.7) < 1e-9);
  assert.ok(Math.abs(nextInterval(2, half) / base - 2.4) < 1e-9);
  // capped, so a busy scene thins toward silence but the drift never stops
  assert.ok(Math.abs(nextInterval(9, half) / base - 3) < 1e-9);
  assert.ok(Math.abs(nextInterval(99, half) / base - 3) < 1e-9);
  // spans the full base range
  assert.ok(Math.abs(nextInterval(0, () => 0) - BASE_MIN) < 1e-9);
  assert.ok(Math.abs(nextInterval(0, () => 1) - BASE_MAX) < 1e-9);
});

test('shouldRest fires about one note in five', () => {
  assert.equal(shouldRest(() => 0), true);
  assert.equal(shouldRest(() => 0.99), false);
  assert.equal(shouldRest(() => REST_CHANCE), false);   // boundary is exclusive
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/music.test.js`
Expected: FAIL — `Cannot find module '.../src/audio/music.js'`

- [ ] **Step 3: Write the implementation**

Create `src/audio/music.js`:

```js
import { SCALE, DRIFT_OCTAVES } from './tuning.js';

// The drift layer: the sparse, sourceless tones that carry the scenes with
// nothing in them to make a noise. Everything here is pure and takes an injected
// rng — production is unseeded on purpose (music that replayed the same sequence
// every time you opened a case would become recognizable, and recognizable is
// the one thing an ambient bed must never be), but the LOGIC is still testable.

export const BASE_MIN = 6;         // seconds between notes, in an empty scene
export const BASE_MAX = 20;
export const REST_CHANCE = 0.2;
export const DRIFT_LO = 0;
export const DRIFT_HI = SCALE.length * DRIFT_OCTAVES;   // 10 — two octaves

// Weighted walk, not a uniform pick. Mostly neighbours, sometimes a small leap,
// never zero: uniform random over a scale sounds shuffled, and a repeated note
// sounds like a stutter. Weights sum to 1.
const STEPS = [
  [1, 0.30], [-1, 0.30],
  [2, 0.125], [-2, 0.125],
  [3, 0.05], [-3, 0.05],
  [4, 0.025], [-4, 0.025],
];

export function nextDegree(prev, rng, lo = DRIFT_LO, hi = DRIFT_HI) {
  let r = rng();
  let step = STEPS[0][0];
  for (const [s, w] of STEPS) { if (r < w) { step = s; break; } r -= w; }

  let next = prev + step;
  // Reflect rather than clamp, so the register turns around at the ends instead
  // of piling up against them.
  if (next < lo) next = lo + (lo - next);
  if (next > hi) next = hi - (next - hi);
  // A reflection can land back exactly where it started; nudge off it.
  if (next === prev) next = prev + (step > 0 ? -1 : 1);
  return Math.max(lo, Math.min(hi, next));
}

// The density rule: the more a scene already sounds, the less the drift plays.
// A scene with a chime has a pulse and needs no music; a bare hillside gets the
// full drift. Capped, so it thins toward silence without ever stopping.
export function nextInterval(emitters, rng) {
  const density = Math.min(3, 1 + 0.7 * emitters);
  return (BASE_MIN + (BASE_MAX - BASE_MIN) * rng()) * density;
}

// Skipping a scheduled note outright is what breaks the steady-drip quality that
// kills most generative ambient — regular spacing reads as a machine no matter
// how unpredictable the pitches are.
export const shouldRest = (rng) => rng() < REST_CHANCE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/music.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/audio/music.js tests/music.test.js
git commit -m "feat(audio): the drift walks, rests, and thins"
```

---

### Task 5: The drift voice, its scheduler, and the engine

**Files:**
- Modify: `src/audio/synths.js` (add `makeSwell`)
- Modify: `src/audio/music.js` (add `makeMusic`)
- Modify: `src/audio/engine.js` (whole file — `emitterCount`, real `playMusic`/`stopMusic`, `chime`, recipe parsing)
- Test: `tests/audio.test.js` (extend)

**Interfaces:**
- Consumes: `nextDegree`, `nextInterval`, `shouldRest` (Task 4); `hz` (Task 1); `strikeChime` (Task 3).
- Produces: `makeSwell(ctx, dest, { freq, gain, attack, hold, release })`; `makeMusic(ctx, dest, { emitters, rng }) => { stop(), setEmitters(n), played(), degree() }`; `emitterCount(recipe) => number` exported from `engine.js`; and on the audio object, `chime({ gain })`, `playMusic(emitters)`, `stopMusic()`. Task 6 calls `audio.chime`; Task 7 relies on `startAmbience` starting the drift from the recipe.

- [ ] **Step 1: Write the failing test**

Append to `tests/audio.test.js`:

```js
test('emitterCount counts sound sources, not beds', () => {
  // wind is a bed and music is the thing being thinned; neither is an emitter
  assert.equal(emitterCount([]), 0);
  assert.equal(emitterCount(['wind:0.25']), 0);
  assert.equal(emitterCount(['wind:0.25', 'music']), 0);
  assert.equal(emitterCount(['wind:0.25', 'furin:0.4', 'music']), 1);
  assert.equal(emitterCount(['furin:0.4', 'furin:0.2']), 2);
});
```

Extend the `engine.js` import to include `emitterCount`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — `emitterCount is not a function`

- [ ] **Step 3: Write the implementation**

In `src/audio/synths.js`, add the swelled voice:

```js
// The drift layer's voice. Swelled, not struck: objects strike, the air breathes,
// and the two layers must not be mistakable for each other.
//
// Guard the attack in review. Stretch it past half a second and this stops being
// an ink painting and starts being a meditation app.
export function makeSwell(ctx, dest, { freq, gain = 1, attack = 0.22, hold = 0.4, release = 6 } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = freq * 6; lp.Q.value = 0.3;
  lp.connect(out); out.connect(dest);

  const end = attack + hold + release;
  // a detuned pair on the fundamental so it beats gently instead of sitting dead
  for (const [mult, amp, det] of [[1, 1, -0.25], [1, 1, 0.25], [2, 0.18, 0], [3, 0.07, 0]]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult + det;
    const g = ctx.createGain(); g.gain.value = amp;
    osc.connect(g); g.connect(lp);
    osc.start(t); osc.stop(t + end + 0.2);
  }

  const peak = gain * 0.05;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + attack);
  out.gain.setValueAtTime(peak, t + attack + hold);
  out.gain.exponentialRampToValueAtTime(peak * 0.001, t + end);
}
```

In `src/audio/music.js`, add the scheduler at the bottom and extend the imports:

```js
import { hz } from './tuning.js';
import { makeSwell } from './synths.js';
```

```js
// Browser-only. Scheduling runs on setTimeout and envelopes on ctx.currentTime —
// both independent of the sim clock, which pauses whenever the preview panel is
// hidden. The music should not stop just because nothing is being drawn.
export function makeMusic(ctx, dest, { emitters = 0, rng = Math.random } = {}) {
  let degree = 0, timer = null, stopped = false, played = 0;
  let n = emitters;

  function schedule() {
    if (stopped) return;
    const wait = nextInterval(n, rng) * (shouldRest(rng) ? 2 : 1);
    timer = setTimeout(() => {
      if (stopped) return;
      degree = nextDegree(degree, rng);
      makeSwell(ctx, dest, { freq: hz(degree) });
      played++;
      schedule();
    }, wait * 1000);
  }
  schedule();

  return {
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; },
    setEmitters(v) { n = v; },
    played() { return played; },
    degree() { return degree; },
  };
}
```

`src/audio/engine.js` becomes the following. **Note what is being preserved:** the
baked-narration work added `ducked`, `MASTER`/`DUCKED`, `masterTarget()`,
`applyMaster()` and `duck(on)` to this file after this plan was first written. All of
it stays exactly as it is — do not regress it. The additions here are the two
imports, `emitterCount`, `playMusic`/`stopMusic`, the `music` branch in
`startAmbience`, the `stopMusic()` call in `stopAmbience`, and `chime`.

Routing the drift through `musicGain` (which feeds `master`) means narration ducking
covers the music for free — the reading pulls back the whole bed, not just the wind.

```js
import { makeWind, strikeBell, strikeChime } from './synths.js';
import { makeMusic } from './music.js';

export function parseRecipe(str) {
  const [type, arg] = str.split(':');
  return { type, level: arg !== undefined ? parseFloat(arg) : 1 };
}

// Beds are not emitters: wind is atmosphere rather than an event source, and
// music is the thing being thinned. Everything else in a recipe is an object
// that makes noise, and each one buys the drift layer more silence.
const BEDS = new Set(['wind', 'music']);
export function emitterCount(recipe = []) {
  return recipe.filter((s) => !BEDS.has(parseRecipe(s).type)).length;
}

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null;
  let soundOn = save.state().soundOn;
  let windScale = 1;      // debug-panel multiplier over whatever a koan asks for
  let windLevel = 0;      // last level a koan requested, so a scale change applies now
  let ducked = false;     // ambience pulls back while narration is reading

  // Narration plays through an <audio> element, outside this graph, so ducking the
  // master only affects the ambience bed — which is exactly the intent.
  const MASTER = 0.8, DUCKED = 0.32;
  function masterTarget() { return soundOn ? (ducked ? DUCKED : MASTER) : 0; }
  function applyMaster() {
    if (master) master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.05);
  }

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = masterTarget();
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
  }

  function playMusic(emitters = 0) {
    ensureCtx();
    if (music) { music.setEmitters(emitters); return; }
    music = makeMusic(ctx, musicGain, { emitters });
  }

  function stopMusic() {
    if (music) { try { music.stop(); } catch { /* already stopped */ } music = null; }
  }

  return {
    get ctx() { return ctx; },
    get master() { return master; },
    unlock() { ensureCtx(); if (ctx.state !== 'running') ctx.resume(); },
    setSound(on) {
      soundOn = !!on;
      save.setSound(soundOn);
      applyMaster();
    },
    isSoundOn() { return soundOn; },
    duck(on) { ducked = !!on; applyMaster(); },
    startAmbience(recipe = []) {
      ensureCtx();
      const emitters = emitterCount(recipe);
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        if (type === 'wind' && !wind) { wind = makeWind(ctx, master); wind.setLevel(level); }
        if (type === 'music') playMusic(emitters);
      }
    },
    setWindLevel(v) { windLevel = v; if (wind) wind.setLevel(v * windScale); },
    setWindScale(s) { windScale = s; if (wind) wind.setLevel(windLevel * windScale); },
    windScale() { return windScale; },
    stopAmbience() {
      if (wind) { wind.stop(); wind = null; }
      stopMusic();
    },
    bell(opts = {}) { ensureCtx(); strikeBell(ctx, master, opts); },
    chime(opts = {}) { ensureCtx(); strikeChime(ctx, master, opts); },
    playMusic,
    stopMusic,
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, whole suite green.

- [ ] **Step 5: Commit**

```bash
git add src/audio/synths.js src/audio/music.js src/audio/engine.js tests/audio.test.js
git commit -m "feat(audio): the drift plays, and thins against the recipe"
```

---

### Task 6: The fūrin

A small glass wind bell with a clapper and a paper tag. One bright ting, on the gust that is actually blowing. Fully deterministic over `simTime` — this is kit, not audio, so the no-`Math.random` rule applies.

**Files:**
- Create: `src/kit/furin.js`
- Modify: `src/kit/index.js` (add the export)
- Test: `tests/furin.test.js`

**Interfaces:**
- Consumes: `gustPhase` (Task 2).
- Produces: `makeFurin({ size, seed, color, phase, onRing }) => { group, body, update(dt, simTime), setWindLevel(v), windLevel(), ring(gain?), hoverAt(), rings(), lastGain(), gust(), pickTargets() }`. The group's origin is its **hang point**; all geometry hangs below y=0, so a case positions it by where it should hang from. Task 7 mounts it under case 29's gate lintel.

- [ ] **Step 1: Write the failing test**

Create `tests/furin.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFurin, RING_THRESHOLD } from '../src/kit/furin.js';
import { gustPhase } from '../src/audio/synths.js';

// drive a furin across `secs` of sim time at 60fps, collecting ring gains
function run(f, secs, step = 1 / 60) {
  const gains = [];
  const at = [];
  const orig = f.rings();
  for (let i = 0; i * step < secs; i++) {
    const t = i * step;
    const before = f.rings();
    f.update(step, t);
    if (f.rings() > before) { gains.push(f.lastGain()); at.push(t); }
  }
  assert.ok(f.rings() >= orig);
  return { gains, at };
}

test('the furin rings on the gusts, not on a timer', () => {
  const rung = [];
  const f = makeFurin({ seed: 1, phase: 0, onRing: (g) => rung.push(g) });
  const { at } = run(f, 600);
  assert.ok(at.length > 15, `too quiet: ${at.length} rings in 10 minutes`);
  assert.equal(rung.length, at.length, 'onRing fired for every ring');

  // every ring lands on a real crest of the shared gust envelope
  for (const t of at) assert.ok(gustPhase(t) > RING_THRESHOLD, `rang off-crest at ${t}`);

  // and never twice on the same crest
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(Math.min(...gaps) > 10, `double-rang: ${Math.min(...gaps)}s apart`);
});

test('a stilled wind is a silent chime', () => {
  const f = makeFurin({ seed: 1, phase: 0 });
  f.setWindLevel(0);
  assert.equal(run(f, 600).at.length, 0, 'rang with no wind');
  // and it comes back when the wind does
  f.setWindLevel(1);
  assert.ok(run(f, 600).at.length > 15);
});

test('ring gain follows the wind level', () => {
  const loud = makeFurin({ seed: 1, phase: 0 });
  const soft = makeFurin({ seed: 1, phase: 0 });
  soft.setWindLevel(0.3);
  const a = run(loud, 300).gains;
  const b = run(soft, 300).gains;
  assert.ok(a.length > 0 && a.length === b.length);
  for (let i = 0; i < a.length; i++) assert.ok(b[i] < a[i]);
});

test('two furin in one scene do not ring in unison', () => {
  const a = makeFurin({ seed: 1 });
  const b = makeFurin({ seed: 2 });
  const ta = run(a, 600).at;
  const tb = run(b, 600).at;
  assert.ok(ta.length > 0 && tb.length > 0);
  assert.notDeepEqual(ta, tb);
});

test('the furin is deterministic and sways with the gust', () => {
  const a = makeFurin({ seed: 3 });
  const b = makeFurin({ seed: 3 });
  run(a, 120); run(b, 120);
  assert.equal(a.rings(), b.rings());
  assert.ok(Math.abs(a.group.children[0].rotation.z - b.group.children[0].rotation.z) < 1e-12);

  // it hangs BELOW its origin, so a case places it by where it hangs from
  const box = { min: Infinity, max: -Infinity };
  a.group.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    box.min = Math.min(box.min, o.geometry.boundingBox.min.y + o.position.y);
    box.max = Math.max(box.max, o.geometry.boundingBox.max.y + o.position.y);
  });
  assert.ok(box.max <= 0.01, `geometry pokes above the hang point: ${box.max}`);
});

test('a tap rings it regardless of the wind', () => {
  const rung = [];
  const f = makeFurin({ seed: 1, onRing: (g) => rung.push(g) });
  f.setWindLevel(0);
  f.ring();
  assert.equal(f.rings(), 1);
  assert.equal(rung.length, 1);
  assert.ok(rung[0] > 0);
  assert.ok(f.pickTargets().length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/furin.test.js`
Expected: FAIL — `Cannot find module '.../src/kit/furin.js'`

- [ ] **Step 3: Write the implementation**

Create `src/kit/furin.js`:

```js
import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';

// A furin: the small glass wind bell hung under an eave, with a clapper and a
// paper tag. It rings when the wind ACTUALLY gusts — the threshold is on the
// same envelope that drives the wind synth, so what you hear and what you see
// are the same weather. Decoration would have been a timer; this is causality.
//
// Everything is a closed form over the simTime handed to update(), so the pose
// and the ring history are identical every run: this is kit, not audio, and the
// determinism rule applies in full.
//
// The group's origin is the HANG POINT. All geometry lives below y=0, so a case
// positions it by where it should hang FROM.

export const RING_THRESHOLD = 0.45;   // measured: crests 13-30s apart, no dead air
const REARM = 0.05;                   // hysteresis, so a jittery crest can't double-fire
const MIN_WIND = 0.02;                // below this the chime is silent, not merely quiet
const NUDGE_TAU = 0.5;

export function makeFurin({ size = 0.17, seed = 5, color = WASH.stone, phase = null, onRing = null } = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  const glass = toonMaterial({ color });
  const dark = toonMaterial({ color: WASH.dark, flat: true });

  // the bell: a rounder, wider-mouthed profile than the bonsho's, crown at y=0
  // and mouth at -S, so the whole thing hangs from the origin
  const P = [
    [0.000, 0.10], [0.42, 0.06], [0.50, 0.00], [0.46, 0.16], [0.40, 0.36],
    [0.30, 0.58], [0.16, 0.80], [0.06, 0.94], [0.000, 1.00],
  ].map(([r, y]) => new THREE.Vector2(r * S, (y - 1) * S));
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 12), glass);
  body.name = 'body';
  swing.add(body);

  // the clapper, on its thread, hanging just inside the mouth
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * S, 0.012 * S, 0.62 * S, 4), dark);
  thread.name = 'thread';
  thread.position.y = -0.55 * S;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.10 * S, 8, 6), dark);
  clapper.name = 'clapper';
  clapper.position.y = -0.88 * S;
  swing.add(thread, clapper);

  // the paper tag below it — the part that actually catches the wind
  const tagGeo = new THREE.PlaneGeometry(0.34 * S, 0.9 * S);
  tagGeo.translate(0, -0.45 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.position.y = -0.95 * S;
  swing.add(tag);

  // a forgiving invisible target: a tap wants the chime, not a particular facet
  // Sized to end exactly at the hang point: the drum must cover the bell and the
  // tag without poking up through the eave it hangs from.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9 * S, 0.9 * S, 2.0 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.position.y = -1.0 * S;
  swing.add(hit);

  // A per-instance phase offset, so two chimes in one scene never ring together.
  // The gust is global; only where each chime sits in it differs.
  const off = phase === null ? hash1(3, seed) * 20 : phase;

  let clock = 0;
  let windLevel = 1;
  let rings = 0;
  let lastGain = 0;
  let armed = true;
  let nudgeAt = -Infinity;

  function fire(gain) {
    rings++;
    lastGain = gain;
    if (onRing) onRing(gain);
  }

  return {
    group: g,
    body,
    pickTargets() { return [hit, body, tag]; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const v = gustPhase(clock + off);

      // sway: the tag and bell lean with the breeze, on the same envelope
      // before the first nudge this is exp(-Infinity) === 0, so it costs nothing
      const nudge = Math.exp(-(clock - nudgeAt) / NUDGE_TAU) * 0.035;
      swing.rotation.z = v * 0.16 * windLevel + nudge;
      swing.rotation.x = gustPhase(clock * 0.7 + off + 11) * 0.09 * windLevel;
      tag.rotation.y = v * 0.25;

      if (v > RING_THRESHOLD) {
        if (armed && windLevel > MIN_WIND) {
          armed = false;
          // louder on a stronger crest, and scaled by the wind the case asked for
          const crest = (v - RING_THRESHOLD) / (1 - RING_THRESHOLD);
          fire(Math.min(1, windLevel) * (0.6 + 0.4 * crest));
        }
      } else if (v < RING_THRESHOLD - REARM) {
        armed = true;
      }
    },

    // a tap rings it whatever the weather is doing
    ring(gain = 0.75) { nudgeAt = clock; fire(gain); },
    hoverAt() { nudgeAt = clock; },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    rings() { return rings; },
    lastGain() { return lastGain; },
    gust() { return gustPhase(clock + off); },
  };
}
```

Add to `src/kit/index.js`, at the end of the second chapter's block:

```js
export { makeFurin } from './furin.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/furin.test.js`
Expected: PASS, 6 tests.

Then `npm test` — the whole suite, including `kit-facade.test.js`, must stay green.

- [ ] **Step 5: Commit**

```bash
git add src/kit/furin.js src/kit/index.js tests/furin.test.js
git commit -m "feat(kit): the furin rings on the wind that is actually blowing"
```

---

### Task 7: Hang one under case 29's gate

Case 29 is the right first home: it already owns the wind, and its flag toggle already drives `audio.setWindLevel`. Stilling the flag now stills the chime too — the interaction that exists picks up a second consequence for free.

**Files:**
- Modify: `src/koans/k29.js` (imports, build body, `onEnter`, `update`, `fragment`)
- Modify: `tests/k5.test.js`, `tests/k16.test.js`, `tests/k23.test.js`, `tests/k40.test.js`, `tests/k46.test.js` (retarget the vestigial `music` assertions)
- Test: `tests/k29.test.js` (extend)

**Interfaces:**
- Consumes: `makeFurin` (Task 6); `audio.chime`, `audio.startAmbience` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Append to `tests/k29.test.js`:

```js
test('the furin hangs under the gate and answers the flag', async () => {
  const rung = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chime: (o) => rung.push(o.gain),
  };
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const k = k29.build({ audio, input });

  assert.ok(k29.ambience.includes('furin:0.4'), 'the recipe declares the chime');
  assert.ok(k29.ambience.includes('music'), 'and asks for the drift');

  for (let i = 0; i < 60 * 300; i++) k.update(1 / 60, i / 60);
  assert.ok(rung.length > 5, `the chime never rang: ${rung.length}`);
  assert.ok(rung.every((g) => g > 0 && g <= 1));
  assert.ok(k.fragment().rings === rung.length);
});
```

Then, in each of `tests/k5.test.js`, `tests/k16.test.js`, `tests/k23.test.js`, `tests/k40.test.js` and `tests/k46.test.js`, replace the vestigial `music` assertion. Those tests currently guard a field that no longer exists as a concept — silence is now the absence of `'music'` from the recipe. The five current lines and their replacements:

```js
// tests/k5.test.js:170
assert.ok(!k5.ambience.includes('music'), 'silence is right here');
// tests/k16.test.js:154
assert.ok(!k16.ambience.includes('music'), 'no drift layer');
// tests/k23.test.js:145
assert.ok(!k23.ambience.includes('music'), 'this case carries no music');
// tests/k40.test.js:182
assert.ok(!k40.ambience.includes('music'), 'no drift layer');
// tests/k46.test.js:124
assert.ok(!k46.ambience.includes('music'), 'no drift layer on this case');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/k29.test.js`
Expected: FAIL — `the recipe declares the chime` (the ambience array is still `['wind:0.25']`).

- [ ] **Step 3: Write the implementation**

In `src/koans/k29.js`, add `makeFurin` to the existing `../kit/index.js` import list, and change the recipe:

```js
  ambience: ['wind:0.25', 'furin:0.4', 'music'],
```

Inside `build`, after the lanterns are added to the scene, hang the chime from the underside of the gate's lintel, off to one side. The gate's default height is 2.6 and its lintel sits at 2.69 with an 0.18 thickness, so 2.60 is the underside; adding it as a child of the gate group means it inherits the gate's position and heading:

```js
    // a furin under the lintel, off to one side. It rings on the gusts of the
    // same wind that moves the flag — so stilling the flag stills the chime.
    const furin = makeFurin({ seed: 29, onRing: (gain) => audio && audio.chime({ gain }) });
    furin.group.position.set(1.2, 2.6, 0);
    gate.add(furin.group);
```

Add it to the update loop, driven by the same wind level the flag reports, and expose its ring count:

```js
      update(dt, simTime) {
        flag.update(dt, simTime);
        world.update(dt, simTime);            // drives the meadow's wind
        const level = flag.windLevel() * baseWind;
        audio && audio.setWindLevel(level);
        furin.setWindLevel(flag.windLevel());
        furin.update(dt, simTime);
      },
      fragment() {
        return {
          windOn: flag.isWindOn(),
          windLevel: +flag.windLevel().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
          rings: furin.rings(),
        };
      },
```

Finally, extend the existing tap handler so the chime is tappable too — the hit target is forgiving, and this is the component's own behaviour arriving with it:

```js
    input.onTap(() => {
      if (!camera) return;
      const chimeHit = input.raycastFirst(camera, furin.pickTargets());
      if (chimeHit) { furin.ring(); return; }
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const on = flag.toggleWind();
        audio && audio.setWindLevel(on ? baseWind : 0);
      }
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — whole suite green, at 275 + the new tests from Tasks 1–7.

- [ ] **Step 5: Verify in the browser**

Run: `npx -y http-server -p 8105 -c-1 .`, open http://localhost:8105, enter case 29, turn sound on.

Confirm, in order:
1. The chime rings roughly every 15–30 seconds, and each ring coincides with a visible swell in the grass and the flag — not on its own schedule.
2. Tapping the flag to still it silences the chime as well as the flag.
3. Tapping the flag again brings both back.
4. Tapping the chime itself rings it even while the wind is stilled.
5. The drift layer is audible but sparse — and noticeably sparser here than it will be in a case with no emitters, because the recipe declares one.

- [ ] **Step 6: Commit**

```bash
git add src/koans/k29.js tests/k29.test.js tests/k5.test.js tests/k16.test.js tests/k23.test.js tests/k40.test.js tests/k46.test.js
git commit -m "feat: a chime under the gate, ringing on the flag's own wind"
```

---

## Notes for the implementer

**The two numbers that decide whether this works:**

`RING_THRESHOLD = 0.45` was measured, not guessed — at 0.55 the crests fall 27s apart on average with a 44-second hole in them, which reads as a broken chime; at 0.25 they bunch to 9s and read as a doorbell. 0.45 gives a 13.5–30s spread with no dead air. If you change it, re-measure.

`attack = 0.22` on `makeSwell` is the line between an ink painting and a meditation app. It is the first thing to defend in review.

**What is deliberately not here:** the shishi-odoshi, the suikinkutsu, the han, bamboo clack, water beds and flame crackle are all in the design's palette and the `strike()` primitive exists precisely so each costs a partial table. They are not in this plan. Don't add them.
