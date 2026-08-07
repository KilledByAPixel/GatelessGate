import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spatialFor, SPATIAL } from '../src/audio/spatial.js';
import { createAudio } from '../src/audio/engine.js';
import { graphAudioContext } from './helpers/audio-graph-context.js';
import { CASES } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { DEFAULT_HOME_DISTANCE } from '../src/camera.js';

// A listener standing at the origin, looking down -Z (Three.js's camera
// convention), so +X is to their right.
const AT_ORIGIN = {
  pos: { x: 0, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
};

test('pan follows which side of you the sound is on', () => {
  const right = spatialFor({ x: 3, y: 0, z: -3 }, AT_ORIGIN);
  const left = spatialFor({ x: -3, y: 0, z: -3 }, AT_ORIGIN);
  const ahead = spatialFor({ x: 0, y: 0, z: -3 }, AT_ORIGIN);
  assert.ok(right.pan > 0.3, `right should pan right: ${right.pan}`);
  assert.ok(left.pan < -0.3, `left should pan left: ${left.pan}`);
  assert.ok(Math.abs(ahead.pan) < 1e-9, `dead ahead should be centred: ${ahead.pan}`);
  // and it stays in range even for a source directly beside you
  const beside = spatialFor({ x: 50, y: 0, z: 0 }, AT_ORIGIN);
  assert.ok(beside.pan >= -1 && beside.pan <= 1);
});

test('pan collapses toward centre with distance, with no distance term', () => {
  // The SAME lateral offset, near and far. A source 2 units to your left at
  // arm's length is hard left; 2 units to your left from across the field is
  // nearly in front of you. This falls out of using the unit direction and is
  // the reason there is no explicit distance term in the pan.
  const near = spatialFor({ x: 2, y: 0, z: -1 }, AT_ORIGIN);
  const far = spatialFor({ x: 2, y: 0, z: -30 }, AT_ORIGIN);
  assert.ok(Math.abs(far.pan) < Math.abs(near.pan) * 0.3,
    `pan did not collapse: near ${near.pan} vs far ${far.pan}`);
});

test('gain falls and tone darkens with distance; wet rises', () => {
  let prev = spatialFor({ x: 0, y: 0, z: -0.5 }, AT_ORIGIN);
  for (let d = 1; d <= 40; d += 1) {
    const s = spatialFor({ x: 0, y: 0, z: -d }, AT_ORIGIN);
    assert.ok(s.gain <= prev.gain, `gain rose at d=${d}`);
    assert.ok(s.tone <= prev.tone, `tone brightened at d=${d}`);
    assert.ok(s.wet >= prev.wet, `wet fell at d=${d}`);
    assert.ok(s.gain > 0 && s.tone > 0, `degenerate at d=${d}`);
    prev = s;
  }
  // and the ends land where the tuning says they should
  const close = spatialFor({ x: 0, y: 0, z: -0.1 }, AT_ORIGIN);
  assert.ok(close.wet < 0.2, `a sound at your feet is nearly dry: ${close.wet}`);
  const away = spatialFor({ x: 0, y: 0, z: -60 }, AT_ORIGIN);
  assert.ok(away.wet > 0.45, `a sound across the scene is mostly room: ${away.wet}`);
});

test('sources behind you are quieter and duller than the same distance ahead', () => {
  const ahead = spatialFor({ x: 0, y: 0, z: -6 }, AT_ORIGIN);
  const behind = spatialFor({ x: 0, y: 0, z: 6 }, AT_ORIGIN);
  assert.equal(behind.d, ahead.d, 'same distance, or the comparison means nothing');
  assert.ok(behind.gain < ahead.gain, 'behind should be quieter');
  assert.ok(behind.tone < ahead.tone, 'behind should be duller');
});

test('a source standing exactly on the listener is finite, not NaN', () => {
  // The zero-length direction is the one input that can produce NaN out of a
  // normalize, and a NaN reaching an AudioParam throws and kills the graph.
  const s = spatialFor({ x: 0, y: 0, z: 0 }, AT_ORIGIN);
  for (const k of ['d', 'pan', 'gain', 'tone', 'wet']) {
    assert.ok(Number.isFinite(s[k]), `${k} is not finite: ${s[k]}`);
  }
  assert.equal(s.pan, 0, 'a sound inside your head is centred');
  assert.equal(s.d, 0);
});

test('every output stays in range across a full sweep', () => {
  for (let x = -40; x <= 40; x += 3.5) {
    for (let z = -40; z <= 40; z += 3.5) {
      const s = spatialFor({ x, y: 1.4, z }, AT_ORIGIN);
      assert.ok(s.pan >= -1 && s.pan <= 1, `pan out of range at ${x},${z}: ${s.pan}`);
      // Gain is no longer bounded by 1 — being NEARER than the reference
      // distance is now louder than the reference, which is the whole point
      // of SPATIAL.nearClamp (Frank: "the minimum and the maximum sound
      // about the same to me," because the old max(ref,d) pinned every
      // distance inside `ref` to exactly 1). What must still hold is that it
      // is BOUNDED: the clamp is the only thing standing between a sound
      // approaching the camera and a divide-by-zero into the master bus.
      // Derived from the live constants, so moving nearClamp moves the
      // ceiling with it, but removing the clamp fails here.
      const ceiling = Math.pow(SPATIAL.ref / SPATIAL.nearClamp, SPATIAL.rolloff);
      assert.ok(s.gain >= 0 && s.gain <= ceiling, `gain out of range at ${x},${z}: ${s.gain} (ceiling ${ceiling})`);
      assert.ok(s.wet >= 0 && s.wet <= 1, `wet out of range at ${x},${z}: ${s.wet}`);
      assert.ok(s.tone >= SPATIAL.toneFar * 0.5 && s.tone <= SPATIAL.toneNear,
        `tone out of range at ${x},${z}: ${s.tone}`);
    }
  }
});

test('nearer is louder, across the whole range the book is viewed from', () => {
  // THE BUG Frank heard in dev/spatial-audition.html: "there's not that much
  // of a difference at all between the distance between four and twenty two.
  // The minimum and the maximum sound about the same to me." `gain` was
  // `(ref / max(ref, d))^rolloff`, so every distance nearer than the
  // reference produced EXACTLY 1 — the near half of the range was one flat
  // level, and the far half only moved 5dB.
  //
  // MUTATION-VERIFIED: restore `Math.max(tune.ref, d)` and the strict
  // monotonicity below fails immediately at the first pair inside `ref`
  // (4 and 6 both return 1).
  const gainAt = (d) => spatialFor({ x: 0, y: 0, z: -d }, AT_ORIGIN).gain;
  const sweep = [SPATIAL.nearClamp, 6, 8, SPATIAL.ref, 14, 17, 22, 30];
  for (let i = 1; i < sweep.length; i++) {
    assert.ok(gainAt(sweep[i]) < gainAt(sweep[i - 1]),
      `${sweep[i]} units is not quieter than ${sweep[i - 1]}: ${gainAt(sweep[i])} vs ${gainAt(sweep[i - 1])}`);
  }
  // and the span across the harness's own audition range is a real one, not
  // a technicality — this is what "they sound about the same" was about
  const dB = 20 * Math.log10(gainAt(4) / gainAt(22));
  assert.ok(dB > 10, `4 to 22 units is only ${dB.toFixed(1)}dB of level — that reads as no distance cue at all`);
});

const SAVE = { state: () => ({ soundOn: false }), setSound() {} };

test('the engine carries a listener without needing a browser', () => {
  // createAudio touches no AudioContext until ensureCtx, and the listener is
  // plain state — so it is readable in Node exactly like mood is.
  const audio = createAudio(SAVE);
  assert.equal(audio.listener(), null, 'no listener until main.js sets one');
  audio.setListener(AT_ORIGIN);
  assert.deepEqual(audio.listener(), AT_ORIGIN);
});

test('an at with a non-finite coordinate is refused, not passed to an AudioParam', () => {
  // A NaN reaching an AudioParam throws and takes the graph down. The engine
  // is the last place that can catch a bad position cheaply, and a silent
  // strike is a far better failure than a dead audio context.
  //
  // CODE REVIEW CAUGHT: this used to run with no `window`, so ensureCtx()
  // returned false and bell()/drip()/chimeStrike() returned before `at` was
  // ever checked — the branch just added `at` to 51 call sites, so a
  // non-finite position landing here for real is not hypothetical, and this
  // test could not have caught it. graphAudioContext() gives the engine a
  // real (faked) context and a real listener so `placed()`'s guard is
  // actually exercised: a bad `at` must take the SAME unplaced fallback as no
  // listener at all — no spatial bus (no panner) built for it — while a good
  // `at` does build one, which is what makes the negative checks below mean
  // something rather than passing because nothing is ever placed.
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(SAVE);
    audio.setListener(AT_ORIGIN);
    audio.unlock();
    const ctx = audio.ctx;
    let panners = 0;
    const realCreateStereoPanner = ctx.createStereoPanner.bind(ctx);
    ctx.createStereoPanner = (...args) => { panners++; return realCreateStereoPanner(...args); };

    assert.doesNotThrow(() => audio.bell({ at: { x: NaN, y: 0, z: 0 } }));
    assert.equal(panners, 0, 'a NaN position built a spatial bus anyway — finiteAt did not guard it');

    assert.doesNotThrow(() => audio.drip({ at: { x: 0, y: Infinity, z: 0 } }));
    assert.equal(panners, 0, 'an Infinite position built a spatial bus anyway — finiteAt did not guard it');

    assert.doesNotThrow(() => audio.chimeStrike({ tube: 0, at: null }));
    assert.equal(panners, 0, 'a null position built a spatial bus anyway');

    // and a FINITE position does build one — proof the checks above are
    // pinning the guard, not just observing that nothing is ever placed
    audio.bell({ at: { x: 1, y: 0, z: -3 } });
    assert.equal(panners, 1, 'a finite position did not build a spatial bus at all — the harness is not wired right');
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});

// ---- task-12, Piece 1: the calibration principle ----
// "A sound at its own case's camera distance must sound as it did before
// this branch." These two tests are the ones that matter for that bug —
// everything else in this file is unaffected by where `ref` sits.
// CODE REVIEW CAUGHT: a range check (SPATIAL.ref >= 8 && <= 18) used to sit
// here. It passes at ref=8 (+2.5dB dry at the median case) or ref=18
// (about -2dB) just as happily as at 11.5 — a +/-35% drift with nothing to
// notice — and it does not react at all if a case's camera moves and shifts
// the real median. So it measures the real, live median instead: it builds
// all 49 staged cases (the same thing staging.test.js does) and computes the
// actual distribution.
//
// It asks that ref sit NEAR that median, not exactly on it. Equality was too
// sharp a pin for a number derived from forty-nine independently art-tuned
// camera distances: with an odd count the median IS one case's value, so it
// hops between 11, 11.2 and 11.5 whenever any single scene is reframed —
// k48's move to 11.2 tripped it while changing the gain at the median case by
// 0.2dB, which is nothing anyone can hear. A whole unit of slack still catches
// what this test is really for (the book as a whole moving closer or further
// than ref is calibrated for) and no longer fails on one scene's tweak.
// 11.5 is also the modal distance, shared outright by ten cases.
const REF_SLACK = 1.0;
test('ref stays near the median camera distance across the real book', async () => {
  const distances = [];
  for (const c of CASES) {
    if (!isStaged(c.slug)) continue;
    const mod = await loadKoan(c.slug);
    // main.js's buildKoan gives a case with no camera field of its own this
    // same DEFAULT_HOME_DISTANCE — five cases (k1, k7, k13, k16, k29) take
    // it. Importing the constant rather than re-typing 11.5 here is the
    // point: this test, main.js, and staging.test.js's own rigCamera() stub
    // all now read the one number, so none of the three can drift from the
    // others unnoticed.
    distances.push(mod.camera ? mod.camera.distance : DEFAULT_HOME_DISTANCE);
  }
  assert.ok(distances.length >= 40,
    `only ${distances.length} staged cases found — this test needs the real book, not a fragment of it`);
  distances.sort((a, b) => a - b);
  const mid = distances.length / 2;
  const median = distances.length % 2
    ? distances[Math.floor(mid)]
    : (distances[mid - 1] + distances[mid]) / 2;
  assert.ok(Math.abs(SPATIAL.ref - median) <= REF_SLACK,
    `SPATIAL.ref (${SPATIAL.ref}) has drifted from the book's real median camera distance (${median}) by more than ${REF_SLACK}`);
});

test('at the reference distance, a placed one-shot matches the unplaced path (bell and drip)', () => {
  // Drives the REAL engine down both paths for two different voice families
  // (bell: kd/ks 0.7/1.2, drip: 0.85/1.4 — the two are NOT the same
  // coefficients, so this also guards against a fix that only worked for
  // one family) and reads the actual gain-node values each path builds,
  // rather than re-deriving the expected numbers by hand: strikeBell() and
  // strikeDrip()'s own dry/send formulas in synths.js are the independent
  // "as it sounded before" reference this compares against.
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  try {
    const audio = createAudio(SAVE);
    audio.unlock();
    const ctx = audio.ctx;

    // voicesDry/voicesWet are the last two gain nodes ensureCtx makes (see
    // its own comment) — no public getter reaches them, but every dry/wet
    // leg, placed or not, ends up connected to one of the two, which is
    // enough to pick them out structurally rather than by a private name.
    const voicesDry = ctx._gains[ctx._gains.length - 2];
    const voicesWet = ctx._gains[ctx._gains.length - 1];
    // The MOST RECENT edge into a node — a fresh strike adds a new one on
    // top of whatever an earlier strike left behind, so `.find` (first
    // match) would keep reading the very first strike's gain forever.
    const gainInto = (node) => {
      const edges = ctx._edges.filter(([, to]) => to === node);
      assert.ok(edges.length > 0, 'nothing reached this bus at all');
      return edges[edges.length - 1][0].gain.value;
    };
    const dB = (a, b) => 20 * Math.log10(a / b);
    const assertMatch = (label, placedDry, placedWet, unplacedDry, unplacedWet) => {
      assert.ok(Math.abs(dB(placedDry, unplacedDry)) < 0.05,
        `${label} dry drifted ${dB(placedDry, unplacedDry).toFixed(3)} dB at ref: placed ${placedDry} vs unplaced ${unplacedDry}`);
      assert.ok(Math.abs(dB(placedWet, unplacedWet)) < 0.05,
        `${label} wet drifted ${dB(placedWet, unplacedWet).toFixed(3)} dB at ref: placed ${placedWet} vs unplaced ${unplacedWet}`);
    };

    // bell
    audio.bell({ f0: 220 });   // unplaced: no listener set at all yet
    const bellUnplacedDry = gainInto(voicesDry);
    const bellUnplacedWet = gainInto(voicesWet);
    audio.setListener(AT_ORIGIN);
    audio.bell({ f0: 220, at: { x: 0, y: 0, z: -SPATIAL.ref } });
    assertMatch('bell', gainInto(voicesDry), gainInto(voicesWet), bellUnplacedDry, bellUnplacedWet);

    // drip — a different voice family (different kd/ks), placed through the
    // same calibrateMix()/makeSpatialBus() machinery
    audio.setListener(null);
    audio.drip({});
    const dripUnplacedDry = gainInto(voicesDry);
    const dripUnplacedWet = gainInto(voicesWet);
    audio.setListener(AT_ORIGIN);
    audio.drip({ at: { x: 0, y: 0, z: -SPATIAL.ref } });
    assertMatch('drip', gainInto(voicesDry), gainInto(voicesWet), dripUnplacedDry, dripUnplacedWet);
  } finally {
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});
