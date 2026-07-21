import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kit from '../src/kit/index.js';

test('kit facade exports every M2 builder', () => {
  for (const name of [
    'makeDog', 'makeTail', 'makeBuffalo', 'makeBuddha', 'makeFlower',
    'makeBowl', 'makeWater', 'makeHut', 'makeLattice', 'makeAssembly',
    'makeMonk', 'aimMonk', 'composeWorld', 'makePath',
  ]) {
    assert.equal(typeof kit[name], 'function', `${name} is exported`);
  }
});
