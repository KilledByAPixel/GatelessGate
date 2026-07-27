import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k25 from '../src/koans/k25.js';

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    audio: { knock() {}, startAmbience() {}, stopAmbience() {}, duck() {} },
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
    },
    _taps: taps, _hovers: hovers,
  };
}

test('module shape matches the koan contract', () => {
  assert.equal(k25.id, 25);
  assert.equal(k25.slug, 'preaching-from-the-third-seat');
  assert.equal(typeof k25.build, 'function');
});

// THE DREAM-ROCK / GRASS-SHIMMER BUG.
//
// The tuft field derives each tuft's atlas variant, mirror, stiffness and
// resting lean from its LIVE world XZ through a chaotic hash — correct only
// while a tuft's world position never moves. k25 rocks the whole `hall`, and
// composeWorld had attached the ground+grass to `hall`, so every tuft's world
// position changed every frame and its hashed attributes re-rolled: the meadow
// visibly re-randomised per frame (Frank: "like it's regenerated randomly every
// frame"). The dream furniture may rock; the surrounding world may NOT, because
// the world carries the grass.
test('the meadow does not move when the dream rocks', () => {
  const built = k25.build(fakeCtx());
  const scene = built.scene;

  const grass = scene.getObjectByName('grassfield');
  assert.ok(grass, 'grass field present');
  const dream = scene.getObjectByName('dream');
  assert.ok(dream, 'dream group present');

  const grassAt = (t) => {
    built.update(1 / 60, t);
    scene.updateMatrixWorld(true);
    return grass.matrixWorld.elements.slice();
  };
  const dreamAt = (t) => {
    built.update(1 / 60, t);
    scene.updateMatrixWorld(true);
    return dream.matrixWorld.elements.slice();
  };

  const g0 = grassAt(0);
  const g1 = grassAt(2.0);
  const maxGrassDrift = g0.reduce((m, v, i) => Math.max(m, Math.abs(v - g1[i])), 0);
  assert.ok(maxGrassDrift < 1e-9,
    `grass world transform must be static across time, drifted ${maxGrassDrift}`);

  // and the rock must still be alive — otherwise this passes by killing the dream
  const d0 = dreamAt(0);
  const d1 = dreamAt(2.0);
  const maxDreamDrift = d0.reduce((m, v, i) => Math.max(m, Math.abs(v - d1[i])), 0);
  assert.ok(maxDreamDrift > 1e-5,
    'the dream hall must still rock');
});
