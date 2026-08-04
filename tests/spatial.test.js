import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spatialFor, SPATIAL } from '../src/audio/spatial.js';
import { createAudio } from '../src/audio/engine.js';
import { graphAudioContext } from './helpers/audio-graph-context.js';

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
      assert.ok(s.gain >= 0 && s.gain <= 1, `gain out of range at ${x},${z}: ${s.gain}`);
      assert.ok(s.wet >= 0 && s.wet <= 1, `wet out of range at ${x},${z}: ${s.wet}`);
      assert.ok(s.tone >= SPATIAL.toneFar * 0.5 && s.tone <= SPATIAL.toneNear,
        `tone out of range at ${x},${z}: ${s.tone}`);
    }
  }
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
test('ref sits in the book\'s real camera range, not the old 2.5 anchor', () => {
  // The bug: ref was 2.5, a distance nothing in the book is ever viewed
  // from (camera.distance runs 8.6-17 across all 49 cases plus the matter
  // pages and the hub — see task-12-report.md). This does not re-derive
  // that range; it just refuses to let ref drift back inside it, which the
  // dry/wet test just below would NOT catch on its own — calibrateMix()
  // reads tune.ref dynamically, so it stays self-consistent at whatever ref
  // is, 2.5 included, unless something also checks ref's actual value.
  assert.ok(SPATIAL.ref >= 8 && SPATIAL.ref <= 18,
    `SPATIAL.ref (${SPATIAL.ref}) has drifted outside the book's real camera range`);
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
