import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitOutcome } from '../src/sit.js';

test('sitOutcome: complete only when elapsed reaches duration', () => {
  assert.equal(sitOutcome(120, 120), 'complete');
  assert.equal(sitOutcome(121, 120), 'complete');
  assert.equal(sitOutcome(119.9, 120), 'early');
  assert.equal(sitOutcome(0, 120), 'early');
});
