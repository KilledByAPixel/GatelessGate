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
