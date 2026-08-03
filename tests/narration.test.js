import { test } from 'node:test';
import assert from 'node:assert/strict';

// createNarration() calls `new Audio()` at construction (unlike engine.js's
// createAudio(), which defers everything to ensureCtx() specifically so it
// stays Node-safe) — so it has never had direct test coverage; only
// narration_state.js's pure helpers are tested elsewhere. That is not the
// same as "untestable": the hush-pair structural test in audio.test.js
// already proves the pattern — a fake with recorded calls, asserting WHICH
// methods ran in what order, not what the fake itself does. This file does
// the same for `new Audio()`.
//
// Code review on task 8 caught a real bug this style of test would have
// caught: `pauseForHide()` used to only set `heldForHide` (and therefore only
// matter) when something was actively mid-playback. main.js's gap between
// sections is a plain `setTimeout`, not `onended` — so a hide landing during
// that gap set no flag at all, and the gap timer's next speak() sailed
// through and read to an empty room. The fix tracks `hidden` unconditionally
// and has speak() itself defer when hidden; these tests pin that down.

function installFakeAudio() {
  let instance = null;
  global.Audio = function FakeAudio() {
    const el = {
      paused: true, preload: '', src: '', onended: null, onerror: null, calls: [],
      play() { this.paused = false; this.calls.push('play:' + this.src); return Promise.resolve(); },
      pause() { this.paused = true; this.calls.push('pause'); },
    };
    instance = el;
    return el;
  };
  return () => instance;
}

// A manifest with two baked sections, so narrationSrc() resolves both.
const MANIFEST = {
  files: {
    '1:case': { file: 'k01-case.mp3' },
    '1:comment': { file: 'k01-comment.mp3' },
  },
};

function installFakeFetch() {
  global.fetch = async () => ({ ok: true, json: async () => MANIFEST });
}

async function withFakes(run) {
  const priorAudio = global.Audio, hadAudio = Object.prototype.hasOwnProperty.call(global, 'Audio');
  const priorFetch = global.fetch, hadFetch = Object.prototype.hasOwnProperty.call(global, 'fetch');
  const getEl = installFakeAudio();
  installFakeFetch();
  try {
    const { createNarration } = await import('../src/audio/narration.js');
    const narration = createNarration({ base: 'x/' });
    await run(narration, getEl());
  } finally {
    if (hadAudio) global.Audio = priorAudio; else delete global.Audio;
    if (hadFetch) global.fetch = priorFetch; else delete global.fetch;
  }
}

const playCount = (el) => el.calls.filter((c) => c.startsWith('play:')).length;

test('pauseForHide/resumeFromHide are no-ops on the element when nothing is speaking', async () => {
  await withFakes(async (narration, el) => {
    narration.pauseForHide();
    assert.deepEqual(el.calls, [], 'pauseForHide touched the element with nothing playing');
    narration.resumeFromHide();
    assert.deepEqual(el.calls, [], 'resumeFromHide played with nothing held for hide');
  });
});

test('a section requested in the gap while hidden does not play, and resumeFromHide starts it where it left off', async () => {
  await withFakes(async (narration, el) => {
    const ends = [];
    await narration.speak(1, 'case', { onEnd: () => ends.push('case') });
    assert.equal(playCount(el), 1, 'the first section must actually play while visible');
    assert.equal(narration.isSpeaking(), true);

    // The section finishes on its own (mirrors the real element's `onended`).
    el.onended();
    assert.equal(narration.isSpeaking(), false);
    assert.deepEqual(ends, ['case']);

    // Hidden now, with nothing playing — the exact gap the bug lived in.
    narration.pauseForHide();

    // main.js's SECTION_GAP_MS timer fires regardless of visibility and asks
    // for the next section. It must not actually sound, and must not fire
    // onEnd for a section that never played.
    const before = playCount(el);
    await narration.speak(1, 'comment', { onEnd: () => ends.push('comment') });
    assert.equal(playCount(el), before, 'a section requested while hidden must not play');
    assert.deepEqual(ends, ['case'], 'onEnd for the deferred section must not fire before it actually plays');

    // The reader comes back: the deferred section starts now.
    narration.resumeFromHide();
    assert.equal(playCount(el), before + 1, 'resumeFromHide must start the section that was waiting');
    assert.equal(el.src, 'x/k01-comment.mp3', 'resumeFromHide must play the SECTION that was deferred, not stale state');
    el.onended();
    assert.deepEqual(ends, ['case', 'comment'], "the deferred section's onEnd must fire once it actually plays");
  });
});

test('stop() while hidden clears the deferred section, so a cancelled read does not resume itself on return', async () => {
  await withFakes(async (narration, el) => {
    await narration.speak(1, 'case', { onEnd: () => {} });
    el.onended();
    narration.pauseForHide();
    await narration.speak(1, 'comment', { onEnd: () => {} });   // queued while hidden
    narration.stop();                                            // the reading is cancelled outright
    const before = playCount(el);
    narration.resumeFromHide();
    assert.equal(playCount(el), before, 'a read stopped while hidden must not resume on return');
  });
});

// Carried bug: resumeFromHide() takes the `pendingHide` branch and returns
// before ever reaching the `heldForHide` check further down. So a hide
// mid-section (which sets heldForHide) followed — while STILL hidden — by a
// fresh speak() (e.g. via gate.readAloud()) overriding that hide leaves
// heldForHide stuck true after the override plays and finishes on its own.
// A LATER, wholly unrelated hide/show cycle then finds heldForHide still
// true, with nothing actually held, and spuriously calls el.play() again —
// "replays stale audio" on whatever the element happens to have loaded.
test('a fresh speak() that overrides a pending hide does not leave heldForHide stale for a later hide/show', async () => {
  await withFakes(async (narration, el) => {
    const ends = [];
    // A section is mid-playback when the page hides.
    await narration.speak(1, 'case', { onEnd: () => ends.push('case') });
    narration.pauseForHide();
    assert.deepEqual(el.calls.slice(-1), ['pause'], 'the mid-playback section must be paused, not left running');

    // While STILL hidden, a fresh read arrives (gate.readAloud()) and
    // overrides the pending hide rather than joining it.
    await narration.speak(1, 'comment', { onEnd: () => ends.push('comment') });
    narration.resumeFromHide();   // takes the pendingHide branch
    assert.equal(playCount(el), 2, 'resumeFromHide must start the section that overrode the hide');
    assert.equal(el.src, 'x/k01-comment.mp3');

    // That section finishes on its own, same as any ordinary read.
    el.onended();
    assert.equal(narration.isSpeaking(), false);
    assert.deepEqual(ends, ['comment'], "the overridden section's own onEnd must fire; the paused one's must not");

    // A later, unrelated hide/show cycle: nothing is speaking and nothing is
    // pending, so this must be a complete no-op on the element.
    const before = playCount(el);
    narration.pauseForHide();
    narration.resumeFromHide();
    assert.equal(playCount(el), before,
      'a stale heldForHide from the overridden hide made an unrelated hide/show replay the last section');
  });
});
