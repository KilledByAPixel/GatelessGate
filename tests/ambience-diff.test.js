import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecipe, emitterCount, AUDIBLE, recipeLayers, diffAmbience, windFlavorOf, roomFor,
} from '../src/audio/ambience_diff.js';
import { createAudio } from '../src/audio/engine.js';
import { graphAudioContext } from './helpers/audio-graph-context.js';

// ---- the vocabulary (moved here from engine.js; the engine re-exports) ----

test('parseRecipe still speaks the recipe grammar', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25, flavor: null });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1, flavor: null });
  assert.deepEqual(parseRecipe('water:0'), { type: 'water', level: 0, flavor: null });
});

test('parseRecipe carries an optional wind flavor and old tokens are unchanged', () => {
  assert.deepEqual(parseRecipe('wind:0.18:pine'), { type: 'wind', level: 0.18, flavor: 'pine' });
  assert.deepEqual(parseRecipe('wind:0.18'), { type: 'wind', level: 0.18, flavor: null });
  assert.deepEqual(parseRecipe('music'), { type: 'music', level: 1, flavor: null });
});

test('windFlavorOf reads the first wind token and defaults to open', () => {
  assert.equal(windFlavorOf(['wind:0.2:broadleaf', 'music']), 'broadleaf');
  assert.equal(windFlavorOf(['wind:0.2', 'music']), 'open');
  assert.equal(windFlavorOf(['music']), 'open');
  assert.equal(windFlavorOf([]), 'open');
});

test('the engine re-exports the vocabulary, so old imports keep working', async () => {
  const engine = await import('../src/audio/engine.js');
  assert.equal(engine.parseRecipe, parseRecipe);
  assert.equal(engine.emitterCount, emitterCount);
});

// ---- recipeLayers: a recipe reduced to its sustained voices ----

test('recipeLayers keeps only the engine-sustained layers', () => {
  assert.deepEqual(
    recipeLayers(['wind:0.14', 'bell', 'drum', 'music']),
    { wind: 0.14, music: 2 },   // bell + drum are emitters, not layers
  );
  assert.deepEqual(recipeLayers([]), {});
  assert.deepEqual(recipeLayers(['gavel', 'furin']), {});
});

test('recipeLayers: music carries the recipe emitter count as its level', () => {
  // density is the music layer's one audible parameter — the diff hands the
  // engine the number it actually ramps between pages
  assert.deepEqual(recipeLayers(['wind:0.12', 'music']), { wind: 0.12, music: 0 });
  assert.deepEqual(
    recipeLayers(['wind:0.16', 'water:0.26', 'birds', 'music']),   // case 49's old shape
    { wind: 0.16, water: 0.26, music: 2 },
  );
});

// case 7's own recipe no longer carries a water token (the bed and its
// ambient drip schedule are switched off — see makeWaterBed's comment in
// synths.js), but this is the shape it used to be: a level of 0 has to keep
// reading as PRESENT, not absent, for a level-0 water layer to work at all
// if the grammar is ever asked for one again.
test('recipeLayers: presence at level 0 is presence', () => {
  const layers = recipeLayers(['wind:0.14', 'water:0', 'odoshi', 'music']);
  assert.ok('water' in layers, 'water:0 must read as PRESENT — its drips still play');
  assert.equal(layers.water, 0);
});

test('recipeLayers: first occurrence wins, like startAmbience’s creation guards', () => {
  assert.deepEqual(recipeLayers(['wind:0.3', 'wind:0.1']), { wind: 0.3 });
});

test('recipeLayers is pure — same recipe in, same layers out, input untouched', () => {
  const recipe = ['wind:0.2', 'music', 'bell'];
  const a = recipeLayers(recipe);
  const b = recipeLayers(recipe);
  assert.deepEqual(a, b);
  assert.deepEqual(recipe, ['wind:0.2', 'music', 'bell']);
});

// ---- diffAmbience: the page turn as data ----

test('a level change is a keep, never a stop/start — the wind must not restart', () => {
  // preface (wind:0.30) -> case 1 (wind:0.18), the book's very first page turn
  const d = diffAmbience(['wind:0.30', 'music'], ['wind:0.18', 'music']);
  assert.deepEqual(d.keep, [
    { layer: 'wind', from: 0.3, to: 0.18 },
    { layer: 'music', from: 0, to: 0 },
  ]);
  assert.deepEqual(d.start, []);
  assert.deepEqual(d.stop, []);
});

test('identical recipes: all keep, from === to', () => {
  const r = ['wind:0.16', 'bell', 'music'];   // case 9 and case 16 share this shape
  const d = diffAmbience(r, ['wind:0.16', 'bell', 'music']);
  assert.deepEqual(d, {
    keep: [{ layer: 'wind', from: 0.16, to: 0.16 }, { layer: 'music', from: 1, to: 1 }],
    start: [],
    stop: [],
  });
});

test('a layer appearing is a start; one disappearing is a stop', () => {
  // Illustrative, not a live page turn any more: no shipped case's ambience
  // carries a water token today (the bed and its ambient drip schedule are
  // switched off — see makeWaterBed's comment in synths.js), but the grammar
  // still has to diff one correctly if a case ever asks for it again.
  const d1 = diffAmbience(['wind:0.30', 'furin', 'music'], ['wind:0.12', 'water:0.35', 'music']);
  assert.deepEqual(d1.start, [{ layer: 'water', level: 0.35 }]);
  assert.deepEqual(d1.stop, []);
  assert.deepEqual(d1.keep, [
    { layer: 'wind', from: 0.3, to: 0.12 },
    { layer: 'music', from: 1, to: 1 },   // furin leaves, water arrives — the basin is an emitter too
  ]);

  const d2 = diffAmbience(['wind:0.12', 'water:0.35', 'music'], ['wind:0.20', 'stall', 'music']);
  assert.deepEqual(d2.stop, ['water']);
  assert.deepEqual(d2.start, []);
  assert.deepEqual(d2.keep, [
    { layer: 'wind', from: 0.12, to: 0.2 },
    { layer: 'music', from: 1, to: 1 },
  ]);
});

test('music dropping out of a recipe is a stop (case 45 -> 46 loses the drift)', () => {
  const d = diffAmbience(['wind:0.22', 'music'], ['wind:0.26']);
  assert.deepEqual(d.stop, ['music']);
  assert.deepEqual(d.keep, [{ layer: 'wind', from: 0.22, to: 0.26 }]);
});

test('empty to: everything stops; empty from: everything starts', () => {
  // case 49's actual shape once — its water token is gone now (see the water
  // bed's own comment in synths.js), kept here as a plausible three-layer
  // recipe rather than a live one
  const r = ['wind:0.16', 'water:0.26', 'birds', 'music'];
  assert.deepEqual(diffAmbience(r, []), {
    keep: [], start: [], stop: ['wind', 'water', 'music'],
  });
  assert.deepEqual(diffAmbience([], r), {
    keep: [],
    start: [
      { layer: 'wind', level: 0.16 },
      { layer: 'water', level: 0.26 },
      { layer: 'music', level: 2 },
    ],
    stop: [],
  });
  assert.deepEqual(diffAmbience([], []), { keep: [], start: [], stop: [] });
});

test('water kept at a new level, and kept at level 0', () => {
  // Once matched 30 -> 33 (water held level) and a hop into case 7 (down to
  // 0); neither case's ambience carries water any more (see makeWaterBed's
  // comment in synths.js), but the diff still owes a correct answer if a
  // future case's recipe holds the layer across a page turn — 'water:0' is
  // exactly the level case 7 used to declare, so a level of 0 must still
  // read as a KEEP, not a stop, if the grammar is ever asked for it again.
  const d = diffAmbience(['wind:0.12', 'water:0.35', 'music'], ['wind:0.14', 'water:0', 'odoshi', 'music']);
  assert.deepEqual(d.keep.find((k) => k.layer === 'water'), { layer: 'water', from: 0.35, to: 0 });
  assert.deepEqual(d.stop, [], 'level 0 is a keep — stopping would kill the drips');
});

test('the diff never mentions a non-layer token, whatever the pages hold', () => {
  const d = diffAmbience(['wind:0.14', 'bell', 'drum', 'music'], ['wind:0.22', 'flag', 'music']);
  for (const list of [d.keep.map((k) => k.layer), d.start.map((s) => s.layer), d.stop]) {
    for (const layer of list) assert.ok(AUDIBLE.includes(layer), `${layer} is not a sustained layer`);
  }
});

// ---- roomFor: the recipe token that darkens the shared reverb ----

test('roomFor: a snow token asks for the snow room', () => {
  assert.equal(roomFor(['wind:0.34', 'snow', 'music']), 'snow');
  assert.equal(roomFor(['wind:0.2', 'music']), 'open');
  assert.equal(roomFor([]), 'open');
});

test('deterministic: the same pair diffs the same way every time', () => {
  const from = ['wind:0.34', 'snow', 'music'];
  const to = ['wind:0.18', 'rack', 'music'];
  assert.deepEqual(diffAmbience(from, to), diffAmbience(from, to));
});

// Mood is pitch-only: the music scheduler reads it through a live closure and
// drips pitch at strike time, so no layer LEVEL depends on it — which is why
// diffAmbience takes no mood argument at all. This pins that reasoning: the
// engine carries mood as its own state, applied beside the diff, not inside it.
test('mood rides beside the diff, not inside it (it changes pitch, never levels)', () => {
  const save = { state: () => ({ soundOn: false }), setSound() {} };
  const audio = createAudio(save);
  audio.setMood('yo');
  assert.equal(audio.mood(), 'yo', 'mood is engine state, orthogonal to the recipe');
});

// ---- the engine's probe surface (Node-safe: no AudioContext until ensureCtx) ----

test('debugState reads clean before any context exists', () => {
  const save = { state: () => ({ soundOn: false }), setSound() {} };
  const audio = createAudio(save);
  assert.equal(typeof audio.transition, 'function');
  const s = audio.debugState();
  assert.deepEqual(s.recipe, []);
  assert.deepEqual(s.layers, { wind: null, water: null, music: null });
  assert.deepEqual(s.log, []);
  assert.equal(s.mood, 'in');
});

// startAmbience/transition/playMusic all open with `if (!ensureCtx()) return;`
// and under `node --test` there is no `window`, so ensureCtx() is false and
// every one of them should be a no-op rather than throw. Nothing exercised
// that guard directly until now — only debugState's shape was checked above.
test('startAmbience, transition and playMusic are no-ops with no AudioContext in scope', () => {
  const save = { state: () => ({ soundOn: false }), setSound() {} };
  const audio = createAudio(save);
  assert.doesNotThrow(() => audio.startAmbience(['wind:0.2']));
  assert.doesNotThrow(() => audio.transition(['water:0.3']));
  assert.doesNotThrow(() => audio.playMusic(2));
  const s = audio.debugState();
  assert.deepEqual(s.recipe, []);
  assert.deepEqual(s.layers, { wind: null, water: null, music: null });
});

// ---- the Contents' own ambience (main.js's menuMusic) ----
//
// The Contents used to start only the chimed music (audio.playMusic(0,
// { chimes: true })) and never a wind bed at all, so it was the one hub-world
// page (alongside the preface and afterword, which both carry 'wind:0.30')
// with no ambience under it. main.js's menuMusic() now also calls
// audio.startAmbience(['wind:0.30']) — but startAmbience OVERWRITES `playing`
// wholesale, so a wrong-but-plausible fix could restart the wind on every
// menuMusic() call, or leave `playing` in a state where the next
// audio.transition() into a case treats the wind as a fresh start (an
// audible restart) rather than a continuing keep. This test drives the real
// engine (fake AudioContext, real ambience_diff.js diff) through exactly the
// sequence main.js runs — menuMusic() then a case's audio.transition() — and
// reads the epoch counters, which is the one signal that survives a
// suspended/clockless context: a KEPT layer's epoch does not move, a
// restarted one's does.
test('entering a case from the Contents keeps the wind (no restart) and swaps chimed music for the case drift', () => {
  const save = { state: () => ({ soundOn: true }), setSound() {} };
  const priorWindow = global.window;
  const hadWindow = Object.prototype.hasOwnProperty.call(global, 'window');
  global.window = { AudioContext: function FakeAudioContext() { return graphAudioContext(); } };
  let audio;
  try {
    audio = createAudio(save);

    // menuMusic()'s own sequence: mood reset, wind bed, chimed music.
    audio.setMood('in');
    audio.startAmbience(['wind:0.30']);
    audio.playMusic(0, { chimes: true });

    const menuState = audio.debugState();
    assert.deepEqual(menuState.recipe, ['wind:0.30'], 'the Contents recipe must not carry the chimed music as a tracked layer — see menuMusic()\'s own comment on why');
    assert.ok(menuState.layers.wind, 'the Contents built no wind bed at all');
    assert.equal(menuState.layers.wind.level, 0.3);
    assert.ok(menuState.layers.music && menuState.layers.music.chimes, 'the Contents music is not the chimed variant');
    const windEpochInMenu = menuState.layers.wind.epoch;
    const musicEpochInMenu = menuState.layers.music.epoch;

    // buildKoan()'s own call, entering a case whose ambience recipe carries a
    // louder wind and the plain drift.
    audio.transition(['wind:0.6', 'music']);

    const caseState = audio.debugState();
    assert.equal(caseState.layers.wind.epoch, windEpochInMenu,
      'the wind restarted on the Contents-to-case hop — it should have been kept and ramped');
    assert.equal(caseState.layers.wind.level, 0.6, 'the wind did not ramp to the case level');
    assert.notEqual(caseState.layers.music.epoch, musicEpochInMenu,
      'the music never restarted — a genuinely kept scheduler could not have dropped its chimes');
    assert.ok(!caseState.layers.music.chimes, 'the chimed menu music rode into the case');
  } finally {
    // makeMusic's scheduler reschedules itself on a real setTimeout chain
    // (see its own comment in music.js) — nothing else in this file has ever
    // called playMusic against a live context before, so nothing else has hit
    // this. Left running, that timer outlives the test and keeps the process
    // alive, which is what was hanging `node --test` on this file.
    if (audio) audio.stopAmbience();
    if (hadWindow) global.window = priorWindow; else delete global.window;
  }
});
