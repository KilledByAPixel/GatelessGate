# The Room and the Chime — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the shared reverb ("the room") into the audio engine and replace the fūrin's rejected single-strike voice with the multi-tube wind chime Frank approved on the audition page, paced by its own weather rather than the gust.

**Architecture:** A seeded convolution reverb (deterministic decaying-noise IR, L/R decorrelated) becomes engine infrastructure; every pitched voice gets a dry/wet split while beds stay dry. The fūrin kit component grows real tube geometry and a strike model driven by a slow activity wave (`chimeActivity`) with genuine silences — the wind still *gates* it and still drives its visible sway, but no longer paces the strikes. The engine maps tube index → scale degree → Hz and plays a free-free-bar voice through the room.

**Tech Stack:** Vanilla ES modules, Web Audio, Three.js (vendored `lib/`), `node --test` (Node 20+). No build step, no new dependencies, no assets.

**Provenance:** the voice and pacing code was auditioned live by Frank on `local/audition/chime.html` (gitignored). The code in this plan is the approved version ported verbatim; do not re-derive constants. The shipped numbers are the "Garden" preset: degree 8, 5 tubes, decay 5 s, density 0.85, couple 0, level 0.03, bright 0.35, verbMix 0.7, tail 5 s.

## Global Constraints

- **Determinism rule:** no `Math.random`, `Date.now()`, or wall-clock outside `src/audio/**`. `src/kit/**` and `src/koans/**` are bound in full — every furin pose and strike must be a closed form over the `simTime` handed to `update()`.
- Pure functions are unit-tested; Web Audio node builders (`makeVerb`, `strikeBar`, `makeSwell`, `makeMusic`, `createAudio`) are browser-only and must NEVER be called from tests.
- Kit components never import the audio engine or touch an AudioContext; sound leaves through the `onStrike` callback. The single sanctioned kit→audio import is the pure `gustPhase`.
- Colour only from `src/palette.js` (`PAPER`, `WASH.*`); an authored hex is a defect.
- **`src/audio/engine.js` carries baked-narration ducking** (`ducked`, `MASTER`/`DUCKED`, `masterTarget()`, `applyMaster()`, `duck(on)`); it must survive untouched. The verb's wet return connects to `master` so the room ducks with everything else.
- Comments explain *why*, not *what*.
- Full suite is at **293 passing**; it must end green (tests are added, removed and retargeted below — the final count will differ, the fail count must be 0).
- End every commit message with:
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

---

### Task 1: The room

**Files:**
- Create: `src/audio/verb.js`
- Create: `tests/verb.test.js`
- Modify: `src/audio/engine.js` (create the verb in `ensureCtx`; thread `verbIn` into `makeMusic`)
- Modify: `src/audio/music.js` (`makeMusic` accepts and forwards `verbIn`)
- Modify: `src/audio/synths.js` (`makeSwell` gains a dry/wet split)

**Interfaces:**
- Consumes: nothing new.
- Produces: `reverbIR(sampleRate, seconds, seed) => Float32Array` (pure); `makeVerb(ctx, dest, { seconds }) => { in: AudioNode }` (browser-only); `makeSwell(ctx, dry, verbIn, { freq, gain, attack, hold, release })` — note the new second/third parameters. Task 2 sends the chime into `verb.in`; the engine holds `verb` privately.

- [ ] **Step 1: Write the failing test**

Create `tests/verb.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverbIR } from '../src/audio/verb.js';

test('reverbIR is deterministic and decays to silence', () => {
  const a = reverbIR(48000, 2, 1013);
  const b = reverbIR(48000, 2, 1013);
  assert.equal(a.length, 96000);
  assert.deepEqual(a, b);
  const peak = (arr) => { let m = 0; for (const v of arr) m = Math.max(m, Math.abs(v)); return m; };
  const head = peak(a.subarray(0, 4800));
  const tail = peak(a.subarray(a.length - 4800));
  assert.ok(head > 0.05, `head too quiet: ${head}`);
  assert.ok(tail < head * 0.01, `tail does not decay: ${tail} vs ${head}`);
});

test('reverbIR channels decorrelate and the tail darkens', () => {
  const l = reverbIR(48000, 2, 1013);
  const r = reverbIR(48000, 2, 7331);
  // normalized correlation at lag 0 — different seeds must not track each other,
  // or the stereo image collapses to mono
  let lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < l.length; i++) { lr += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i]; }
  assert.ok(Math.abs(lr / Math.sqrt(ll * rr)) < 0.05, 'channels correlate');
  // highs die first: zero-crossing rate falls along the tail
  const zc = (arr) => { let c = 0; for (let i = 1; i < arr.length; i++) if ((arr[i] >= 0) !== (arr[i - 1] >= 0)) c++; return c; };
  const q = Math.floor(l.length / 4);
  assert.ok(zc(l.subarray(l.length - q)) < zc(l.subarray(0, q)) * 0.8, 'tail does not darken');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/verb.test.js`
Expected: FAIL — `Cannot find module '.../src/audio/verb.js'`

- [ ] **Step 3: Write the implementation**

Create `src/audio/verb.js`:

```js
// The room. Every pitched voice in the book sounds inside this one reverb:
// seeded noise shaped by an exponential decay, convolved — the technique from
// Frank's music_tool and loopsong projects, where it is the difference between
// an instrument and an alarm. Two refinements for this palette: the noise is
// lowpassed before enveloping (a dark tail, not hiss), and the filter closes
// further along the tail, the way real rooms swallow highs first.
// Deterministic: same seeds, same room, every run.

export function reverbIR(sampleRate, seconds, seed) {
  const n = Math.round(seconds * sampleRate);
  const k = Math.log(0.001) / n;                       // -60 dB by the tail's end
  const out = new Float32Array(n);
  let s = seed >>> 0, lp = 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const white = s / 1073741824 - 1;
    const fc = 4200 * Math.pow(0.25, i / n) + 250;     // ~4.4 kHz closing to ~1.3 kHz
    const a = 1 - Math.exp(-2 * Math.PI * fc / sampleRate);
    lp += (white - lp) * a;
    out[i] = lp * Math.exp(k * i) * 3;
  }
  return out;
}

// Browser-only. L and R get different seeds so the image decorrelates — the
// stereo width IS the difference between the ears.
export function makeVerb(ctx, dest, { seconds = 5 } = {}) {
  const conv = ctx.createConvolver();
  const buf = ctx.createBuffer(2, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  buf.copyToChannel(reverbIR(ctx.sampleRate, seconds, 1013), 0);
  buf.copyToChannel(reverbIR(ctx.sampleRate, seconds, 7331), 1);
  conv.buffer = buf;
  conv.connect(dest);
  return { in: conv };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/verb.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire the room into the engine and reroute the swells**

In `src/audio/engine.js`:
- Add import: `import { makeVerb } from './verb.js';`
- Add `let verb = null;` beside the other node state.
- In `ensureCtx()`, after the `musicGain` block, add:

```js
    // the room: one reverb for every pitched voice. Its wet return feeds
    // master, so narration ducking pulls the room back with everything else.
    verb = makeVerb(ctx, master, { seconds: 5 });
```

- In `playMusic`, change the `makeMusic` call to thread the room in:

```js
    music = makeMusic(ctx, musicGain, { emitters, verbIn: verb.in });
```

In `src/audio/music.js`, `makeMusic`'s signature and the swell call become:

```js
export function makeMusic(ctx, dest, { emitters = 0, rng = Math.random, verbIn = null } = {}) {
```
```js
      makeSwell(ctx, dest, verbIn, { freq: hz(degree) });
```

In `src/audio/synths.js`, `makeSwell` gains the split. Replace its signature and the two lines that connect `lp`/`out` to the destination:

```js
export function makeSwell(ctx, dry, verbIn, { freq, gain = 1, attack = 0.22, hold = 0.4, release = 6 } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = freq * 6; lp.Q.value = 0.3;
  lp.connect(out);
  // the swells live in the same room as the chime; without a room they sit
  // flat on the page instead of behind it
  const dryG = ctx.createGain(); dryG.gain.value = verbIn ? 0.5 : 1;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = 0.9;
    out.connect(sendG); sendG.connect(verbIn);
  }
```

The oscillator loop and envelope below are unchanged.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, 295 (293 + 2 new). No existing test touches `makeSwell`/`makeMusic` node graphs (browser-only), so nothing else moves.

- [ ] **Step 7: Commit**

```bash
git add src/audio/verb.js tests/verb.test.js src/audio/engine.js src/audio/music.js src/audio/synths.js
git commit -m "feat(audio): the room — one seeded reverb behind every pitched voice"
```

---

### Task 2: The bar voice

**Files:**
- Modify: `src/audio/synths.js` (add `barPartials`, `CHIME`, `strikeBar`; **remove** `chimePartials` and `strikeChime`; drop the now-unused `import { hz } from './tuning.js'` if nothing else in the file uses it)
- Modify: `src/audio/engine.js` (replace `chime()` with `chimeStrike()`)
- Modify: `tests/audio.test.js` (replace the `chimePartials` test; update imports)

**Interfaces:**
- Consumes: `verb` in the engine (Task 1), `hz` from `tuning.js` (engine-side).
- Produces: `barPartials(f0, decay) => {freq, amp, decay}[]` (pure, tested); `CHIME = { degree: 8, tubes: 5, decay: 5, level: 0.03, bright: 0.35, verbMix: 0.7 }`; `strikeBar(ctx, dry, verbIn, { f0, gain, decay, bright, verbMix })` (browser-only); engine method `chimeStrike({ tube, force })`. Task 4 calls `audio.chimeStrike`.

- [ ] **Step 1: Write the failing test**

In `tests/audio.test.js`, DELETE the whole `chimePartials is glass, not bronze` test, remove `chimePartials` from the synths import and add `barPartials`, then append:

```js
test('barPartials is a struck bar, not a bell', () => {
  const c = barPartials(523, 5);
  assert.equal(c.length, 4);
  // the free-free bar mode series — the reason a chime does not sound like a bell
  const ratios = c.map((x) => x.freq / 523);
  assert.ok(Math.abs(ratios[1] - 2.756) < 1e-9);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
  // the fundamental keeps the passed decay; upper modes die away faster
  assert.equal(c[0].decay, 5);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i].decay < c[i - 1].decay);
    assert.ok(c[i].amp < c[i - 1].amp);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — `barPartials is not a function` (and no failure from the deleted test).

- [ ] **Step 3: Write the implementation**

In `src/audio/synths.js`, delete `chimePartials` and `strikeChime` entirely, and add:

```js
// A chime tube is a free-free bar, whose mode series is famously inharmonic:
// 1 : 2.756 : 5.404 : 8.933. That series is WHY a wind chime sounds like a
// wind chime and not a bell — the first voice here used bell-ish ratios at
// 2.3 kHz, bone dry, and Frank rightly called it an alarm. Upper modes die
// much faster than the fundamental.
export function barPartials(f0, decay = 5) {
  return [
    [1.000, 1.00], [2.756, 0.32], [5.404, 0.11], [8.933, 0.04],
  ].map(([r, a]) => ({ freq: f0 * r, amp: a, decay: decay * Math.pow(0.45, Math.log2(r)) }));
}

// The shipped chime — Frank's audition numbers (the "Garden" preset).
export const CHIME = { degree: 8, tubes: 5, decay: 5, level: 0.03, bright: 0.35, verbMix: 0.7 };

export function strikeBar(ctx, dry, verbIn, { f0, gain = 1, decay = CHIME.decay, bright = CHIME.bright, verbMix = CHIME.verbMix } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;

  // The ear peaks around 2-5 kHz; a gentle low-Q roll-off is the whole
  // difference between shimmer and pierce.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700 + 4200 * bright;
  lp.Q.value = 0.2;
  lp.connect(out);

  // the chime lives mostly in the room; the beds stay dry (mud avoidance:
  // lows dry, mids and highs carry the space)
  const dryG = ctx.createGain(); dryG.gain.value = 1 - verbMix * 0.85;
  out.connect(dryG); dryG.connect(dry);
  if (verbIn) {
    const sendG = ctx.createGain(); sendG.gain.value = verbMix * 1.4;
    out.connect(sendG); sendG.connect(verbIn);
  }

  for (const p of barPartials(f0, decay)) {
    for (const det of [-0.22, 0.22]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq + det;
      const g = ctx.createGain();
      const peak = p.amp / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(peak * 0.0008, t + p.decay);
      osc.connect(g); g.connect(lp);
      osc.start(t); osc.stop(t + p.decay + 0.05);
    }
  }

  // the mallet: a soft knock, not a click — seeded, the same knock every time
  const dur = 0.02;
  const nb = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const nd = nb.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < nd.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    nd[i] = (s / 1073741824 - 1) * (1 - i / nd.length);
  }
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = f0 * 1.4; bp.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0.05 * bright;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}
```

If `hz` is now unused in `synths.js`, remove its import.

In `src/audio/engine.js`:
- Update the synths import to `{ makeWind, strikeBell, strikeBar, CHIME }` and add `import { hz } from './tuning.js';`
- Replace the `chime(opts)` method with:

```js
    // tube index -> scale degree -> Hz. The engine owns the mapping so the kit
    // never needs to know what a hertz is.
    chimeStrike({ tube = 0, force = 1 } = {}) {
      ensureCtx();
      strikeBar(ctx, master, verb.in, { f0: hz(CHIME.degree + tube), gain: CHIME.level * force });
    },
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. `tests/k29.test.js` still passes because its stub only *defines* `chime()` without asserting it is called — the furin still uses the old single-ring path until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/audio/synths.js src/audio/engine.js tests/audio.test.js
git commit -m "feat(audio): the bar voice — a struck tube in the room, alarm retired"
```

---

### Task 3: The fūrin becomes a wind chime

**Files:**
- Rewrite: `src/kit/furin.js` (whole file — new geometry, new strike model)
- Rewrite: `tests/furin.test.js` (whole file)

**Interfaces:**
- Consumes: `gustPhase` (sanctioned pure import), `hash1`, `toonMaterial`, `PAPER`/`WASH`.
- Produces: `chimeActivity(t) => 0..1` (pure, exported for tests); `makeFurin({ size, tubes, seed, phase, couple, onStrike }) => { group, pickTargets(), update(dt, simTime), ring(force?), hoverAt(), setWindLevel(v), windLevel(), strikes(), lastForce(), activity() }`. `onStrike(tubeIndex, force)` fires per strike; tube 0 is the longest/deepest tube. Group origin is the hang point; all geometry below y=0. The old `rings()`/`lastGain()`/`gust()`/`body`/`RING_THRESHOLD` API is GONE — Task 4 updates the caller.

- [ ] **Step 1: Write the failing test**

Replace `tests/furin.test.js` entirely:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFurin, chimeActivity } from '../src/kit/furin.js';

// drive the component across sim time; returns the end time so runs can chain
function run(f, secs, t0 = 0, step = 1 / 60) {
  for (let i = 0; i * step < secs; i++) f.update(step, t0 + i * step);
  return t0 + secs;
}

test('chimeActivity is paced weather: bounded, mostly off, real flurries', () => {
  let on = 0, n = 0, peak = 0;
  for (let t = 0; t < 3600; t += 0.25) {
    const v = chimeActivity(t);
    assert.ok(v >= 0 && v <= 1, `out of range at ${t}: ${v}`);
    n++; if (v > 0) on++; peak = Math.max(peak, v);
  }
  assert.ok(on / n > 0.15 && on / n < 0.4, `active fraction ${on / n}`);
  assert.ok(peak > 0.8, `flurries never build: peak ${peak}`);
});

test('strikes arrive deterministically, in range, and are counted', () => {
  const hits = [];
  const f = makeFurin({ seed: 1, phase: 0, onStrike: (i, force) => hits.push({ i, force }) });
  const again = [];
  const g = makeFurin({ seed: 1, phase: 0, onStrike: (i, force) => again.push({ i, force }) });
  run(f, 600); run(g, 600);
  assert.ok(hits.length > 20, `too quiet: ${hits.length} strikes in 10 min`);
  assert.deepEqual(hits, again, 'not deterministic');
  for (const h of hits) {
    assert.ok(Number.isInteger(h.i) && h.i >= 0 && h.i < 5);
    assert.ok(h.force > 0 && h.force <= 1);
  }
  assert.equal(f.strikes(), hits.length);
});

test('flurries cluster and silences really happen', () => {
  const at = [];
  const f = makeFurin({ seed: 1, phase: 0, onStrike: () => {} });
  let prev = 0;
  for (let i = 0; i * (1 / 60) < 900; i++) {
    const t = i / 60;
    f.update(1 / 60, t);
    if (f.strikes() > prev) { at.push(t); prev = f.strikes(); }
  }
  assert.ok(at.length > 10);
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(Math.max(...gaps) > 25, `never falls silent: max gap ${Math.max(...gaps)}`);
  assert.ok(gaps.some((g) => g < 2), 'strikes never cluster into a flurry');
});

test('no wind, no chime — and it comes back with the wind', () => {
  const f = makeFurin({ seed: 1, phase: 0 });
  f.setWindLevel(0);
  let t = run(f, 600);
  assert.equal(f.strikes(), 0, 'struck in dead air');
  f.setWindLevel(1);
  run(f, 600, t);
  assert.ok(f.strikes() > 0, 'never came back');
});

test('two chimes in one scene do not strike in step', () => {
  const ta = [], tb = [];
  const a = makeFurin({ seed: 1, onStrike: () => ta.push(a.strikes()) });
  const b = makeFurin({ seed: 2, onStrike: () => tb.push(b.strikes()) });
  const record = (f, arr) => {
    let prev = 0;
    for (let i = 0; i * (1 / 60) < 600; i++) {
      const t = i / 60;
      f.update(1 / 60, t);
      if (f.strikes() > prev) { arr.push(t); prev = f.strikes(); }
    }
  };
  const xa = [], xb = [];
  record(a, xa); record(b, xb);
  assert.ok(xa.length > 0 && xb.length > 0);
  assert.notDeepEqual(xa, xb);
});

test('hang point: every mesh hangs below the origin', () => {
  const f = makeFurin({ seed: 3 });
  let top = -Infinity;
  f.group.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    top = Math.max(top, o.geometry.boundingBox.max.y + o.position.y);
  });
  assert.ok(top <= 0.001, `geometry pokes above the hang point: ${top}`);
});

test('a tap knocks the clapper through two tubes, whatever the weather', () => {
  const hits = [];
  const f = makeFurin({ seed: 1, onStrike: (i, force) => hits.push([i, force]) });
  f.setWindLevel(0);
  f.ring();
  assert.equal(hits.length, 2);
  assert.notEqual(hits[0][0], hits[1][0], 'both knocks hit the same tube');
  assert.ok(hits[1][1] < hits[0][1], 'the second knock should be the softer one');
  assert.ok(f.pickTargets().length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/furin.test.js`
Expected: FAIL — `chimeActivity` is not exported (and the old API tests are gone).

- [ ] **Step 3: Write the implementation**

Replace `src/kit/furin.js` entirely:

```js
import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { gustPhase } from '../audio/synths.js';
import { PAPER, WASH } from '../palette.js';

// A wind chime: tubes hung in a ring under a wooden cap, a clapper, a paper
// tag. The VISUAL sway follows the real gust — it is the wind that visibly
// moves it — but the strikes are paced by the chime's own much slower weather
// (chimeActivity). Frank auditioned strikes tied to the audible gust and the
// soundscape breathed in lockstep, too quiet then constant; untied, the brain
// fills in the causality on its own. The wind still GATES it: a stilled scene
// is a silent chime.
//
// Deterministic: closed forms over the simTime handed to update(). This is
// kit, not audio — the no-Math.random rule applies in full. The only audio
// import is gustPhase, a pure function (the sanctioned exception).
//
// The group's origin is the HANG POINT: all geometry below y=0, so a case
// positions it by where it hangs FROM.

// The chime's own weather: short spells with regular breaks. Measured over an
// hour: flurries 3-10 s (mean 8), breaks 16-33 s (mean 24), active ~26%. The
// first cut used ~111 s / ~70 s waves and Frank heard a 41 s flurry at load
// followed by an 89 s hole — it read as a bug. Rates chosen NOT to track the
// gust envelope.
const ACT_A = 0.031, ACT_B = 0.047;
export function chimeActivity(t) {
  const a = (Math.sin(2 * Math.PI * ACT_A * t) + Math.sin(2 * Math.PI * ACT_B * t)) / 2;
  return Math.max(0, Math.min(1, (a - 0.35) / 0.4));
}

const DENSITY = 0.85;      // Garden preset
const REFRACTORY = 0.45;   // a tube cannot restrike faster than this
const NUDGE_TAU = 0.5;

export function makeFurin({ size = 0.17, tubes = 5, seed = 5, phase = null, couple = 0, onStrike = null } = {}) {
  const S = size;
  const g = new THREE.Group();
  g.name = 'furin';

  // everything below the hang point swings as one piece
  const swing = new THREE.Group();
  swing.name = 'swing';
  g.add(swing);

  const wood = toonMaterial({ color: WASH.dark, flat: true });
  const metal = toonMaterial({ color: WASH.stone });

  // the cap the tubes hang from
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * S, 0.55 * S, 0.1 * S, 8), wood);
  cap.name = 'cap';
  cap.position.y = -0.05 * S;
  swing.add(cap);

  // tubes in a ring; the longer the tube the deeper the note — index 0 is the
  // longest, matching the engine's degree mapping
  const state = [];
  for (let i = 0; i < tubes; i++) {
    const angle = (i / tubes) * Math.PI * 2;
    const len = S * (1.7 - 0.14 * i);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * S, 0.055 * S, len, 6), metal);
    tube.name = 'tube';
    tube.position.set(Math.cos(angle) * 0.33 * S, -(0.18 * S + len / 2), Math.sin(angle) * 0.33 * S);
    swing.add(tube);
    state.push({
      r1: 0.61 + 0.083 * i, r2: 0.44 + 0.037 * i,       // the tube's excitation
      l1: 0.021 + 0.006 * i, l2: 0.034 + 0.004 * i,     // its slow local eddy
      p1: i * 2.17, p2: i * 3.71,
      last: -Infinity, prev: 0,
    });
  }

  // the clapper among the tubes, and the paper tag that catches the wind
  const clapper = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * S, 0.16 * S, 0.03 * S, 8), wood);
  clapper.name = 'clapper';
  clapper.position.y = -0.9 * S;
  const tagGeo = new THREE.PlaneGeometry(0.3 * S, 0.85 * S);
  tagGeo.translate(0, -0.425 * S, 0);
  const tag = new THREE.Mesh(tagGeo, toonMaterial({ color: PAPER, side: THREE.DoubleSide }));
  tag.name = 'tag';
  tag.userData.noOutline = true;      // an open surface; the inverted hull doesn't suit it
  tag.position.y = -0.95 * S;
  swing.add(clapper, tag);

  // a forgiving invisible target: a tap wants the chime, not a particular
  // tube. Sized to end exactly at the hang point.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8 * S, 0.8 * S, 2.1 * S, 6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'furin-hit';
  hit.userData.noOutline = true;
  hit.position.y = -1.05 * S;
  swing.add(hit);

  // a small per-instance offset so two chimes in one scene never move in step
  const off = phase === null ? hash1(3, seed) * 3 : phase;

  let clock = 0;
  let windLevel = 1;
  let strikes = 0;
  let lastForce = 0;
  let nudgeAt = -Infinity;

  function fire(i, force) {
    strikes++;
    lastForce = force;
    if (onStrike) onStrike(i, force);
  }

  return {
    group: g,
    pickTargets() { return [hit, tag]; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const tt = clock + off;
      const v = gustPhase(tt);

      // sway follows the REAL gust — the visible cause stays honest
      // (before the first nudge this is exp(-Infinity) === 0, so it costs nothing)
      const nudge = Math.exp(-(clock - nudgeAt) / NUDGE_TAU) * 0.035;
      swing.rotation.z = v * 0.16 * windLevel + nudge;
      swing.rotation.x = gustPhase(clock * 0.7 + off + 11) * 0.09 * windLevel;
      tag.rotation.y = v * 0.25;

      // strikes follow the chime's own weather, gated by the wind existing
      const act = chimeActivity(tt);
      const gate = Math.min(1, Math.max(0, windLevel));
      for (let i = 0; i < state.length; i++) {
        const tb = state[i];
        const local = (Math.sin(2 * Math.PI * tb.l1 * (tt + tb.p1 * 7))
                     + Math.sin(2 * Math.PI * tb.l2 * (tt + tb.p2 * 5))) / 2;
        const free = act * (0.45 + 0.55 * (0.5 + 0.5 * local));
        const felt = gate * (couple * Math.max(0, v) + (1 - couple) * free);
        const thr = 1 - 0.92 * felt * DENSITY;
        const e = (Math.sin(2 * Math.PI * tb.r1 * (tt + tb.p1))
                 + Math.sin(2 * Math.PI * tb.r2 * (tt + tb.p2))) / 2;
        if (tb.prev <= thr && e > thr && clock - tb.last > REFRACTORY) {
          tb.last = clock;
          fire(i, Math.min(1, 0.45 + 0.7 * felt));
        }
        tb.prev = e;
      }
    },

    // a tap knocks the clapper through two adjacent tubes, whatever the
    // weather — which tubes depends deterministically on when you tap
    ring(force = 0.75) {
      nudgeAt = clock;
      const k = Math.abs(Math.floor(clock * 3)) % state.length;
      fire(k, force);
      fire((k + 1) % state.length, force * 0.7);
    },
    hoverAt() { nudgeAt = clock; },

    setWindLevel(v) { windLevel = Math.max(0, v); },
    windLevel() { return windLevel; },
    strikes() { return strikes; },
    lastForce() { return lastForce; },
    activity() { return chimeActivity(clock + off); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/furin.test.js`
Expected: PASS, 7 tests.

Note `npm test` will FAIL at this point — `tests/k29.test.js` still calls the old API. That is expected; Task 4 fixes the caller. Do not "fix" it here by keeping the old API around.

- [ ] **Step 5: Commit**

```bash
git add src/kit/furin.js tests/furin.test.js
git commit -m "feat(kit): the furin becomes a wind chime with its own weather"
```

---

### Task 4: Case 29 rewired, suite green, browser verified

**Files:**
- Modify: `src/koans/k29.js` (the furin construction, `fragment()`)
- Modify: `tests/k29.test.js` (retarget the furin test; update the audio stubs)

**Interfaces:**
- Consumes: `makeFurin` (Task 3), `audio.chimeStrike` (Task 2).
- Produces: nothing downstream. `fragment()` now reports `strikes` instead of `rings`.

- [ ] **Step 1: Retarget the tests**

In `tests/k29.test.js`:
- In the shared `fakeCtx()` audio stub, replace `chime() {}` with `chimeStrike() {}`.
- Replace the `the furin hangs under the gate and answers the flag` test with:

```js
test('the chime hangs under the gate and answers the flag', async () => {
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push(o),
  };
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const k = k29.build({ audio, input });

  assert.ok(k29.ambience.includes('furin'), 'the recipe declares the chime');
  assert.ok(k29.ambience.includes('music'), 'and asks for the swells');

  for (let i = 0; i < 60 * 600; i++) k.update(1 / 60, i / 60);
  assert.ok(struck.length > 10, `the chime never struck: ${struck.length}`);
  for (const s of struck) {
    assert.ok(Number.isInteger(s.tube) && s.tube >= 0 && s.tube < 5);
    assert.ok(s.force > 0 && s.force <= 1);
  }
  assert.equal(k.fragment().strikes, struck.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/k29.test.js`
Expected: FAIL — the furin still receives `onRing` and `fragment()` still reports `rings`.

- [ ] **Step 3: Rewire the case**

In `src/koans/k29.js`:
- The furin construction becomes:

```js
    // a wind chime under the lintel. Strikes are paced by the chime's own
    // weather; the wind still gates it, so stilling the flag stills the chime.
    const furin = makeFurin({ seed: 29, onStrike: (tube, force) => audio && audio.chimeStrike({ tube, force }) });
    furin.group.position.set(1.2, 2.6, 0);
    gate.add(furin.group);
```

- In `fragment()`, replace `rings: furin.rings()` with `strikes: furin.strikes()`.
- Everything else (tap probe order, `furin.setWindLevel(flag.windLevel())`, `furin.update(dt, simTime)`, position before `addOutlines`) is already correct — do not disturb it.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, everything green (≈296; fail count 0).

- [ ] **Step 5: Verify in the browser**

Run: `npx -y http-server -p 8105 -c-1 .`, open http://localhost:8105, enter case 29, sound on. Confirm:
1. The chime arrives in flurries — a spell of soft overlapping tings, then up to a minute or more of just wind. Not one loud ping, not a constant chirp.
2. The strikes have air around them (the room) — they bloom and fade rather than stopping dead.
3. Tapping the flag to still the wind silences the chime; tapping again brings it back within a flurry or two.
4. Tapping the chime knocks two soft notes even while the wind is stilled.
5. The chime *object* now reads as a chime — cap, ring of tubes, clapper, tag — hanging under the lintel, sways in the gusts, with ink outlines on the tubes.
6. The swells (drift layer) sit behind everything, now sharing the same room.

- [ ] **Step 6: Commit**

```bash
git add src/koans/k29.js tests/k29.test.js
git commit -m "feat: case 29's chime — flurries in its own weather, inside the room"
```

---

## Not in this pass

The mood family (yo scale), menu music, rosters for the other cases, the inverse-wind masking knob, and every other instrument (water, shishi-odoshi, suikinkutsu, han, bamboo, fūtaku). They are the next plans, in that order, per the spec.
