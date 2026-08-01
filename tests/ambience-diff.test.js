import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecipe, emitterCount, AUDIBLE, recipeLayers, diffAmbience,
} from '../src/audio/ambience_diff.js';
import { createAudio } from '../src/audio/engine.js';

// ---- the vocabulary (moved here from engine.js; the engine re-exports) ----

test('parseRecipe still speaks the recipe grammar', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25 });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1 });
  assert.deepEqual(parseRecipe('water:0'), { type: 'water', level: 0 });
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
    recipeLayers(['wind:0.16', 'water:0.26', 'birds', 'music']),   // case 49
    { wind: 0.16, water: 0.26, music: 2 },
  );
});

test('recipeLayers: presence at level 0 is presence (case 7 runs the basin silent)', () => {
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
  // case 29 -> case 30: the water bed arrives; 30 -> 31: it leaves again
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
  const r = ['wind:0.16', 'water:0.26', 'birds', 'music'];   // case 49
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
  // 30 -> 33 keeps water at the same level; a hop into case 7 keeps it at 0
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
