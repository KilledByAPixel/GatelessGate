import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitKey, narrationSrc, hasNarration, playableQueue } from '../src/audio/narration_state.js';

const manifest = {
  voice: 'onyx',
  preset: 'japanese',
  files: {
    '1:case': { file: 'k01-case.mp3', bytes: 203520, hash: 'abc123' },
    '1:comment': { file: 'k01-comment.mp3', bytes: 1779712, hash: 'def456' },
    '1:verse': { file: 'k01-verse.mp3', bytes: 152576, hash: 'ghi789' },
    '7:case': { file: 'k07-case.mp3', bytes: 100000, hash: 'jkl012' },
  },
};

test('unitKey', () => {
  assert.equal(unitKey(1, 'case'), '1:case');
  assert.equal(unitKey(49, 'verse'), '49:verse');
});

test('narrationSrc resolves a baked section to a path', () => {
  assert.equal(narrationSrc(manifest, 1, 'comment'), 'audio/narration/k01-comment.mp3');
  assert.equal(narrationSrc(manifest, 1, 'comment', 'x/'), 'x/k01-comment.mp3');
});

test('narrationSrc is null for anything not baked', () => {
  assert.equal(narrationSrc(manifest, 7, 'verse'), null);   // case present, section is not
  assert.equal(narrationSrc(manifest, 29, 'case'), null);   // case absent entirely
  assert.equal(narrationSrc(null, 1, 'case'), null);        // manifest never loaded
  assert.equal(narrationSrc({}, 1, 'case'), null);          // manifest without files
});

test('hasNarration mirrors narrationSrc', () => {
  assert.equal(hasNarration(manifest, 1, 'case'), true);
  assert.equal(hasNarration(manifest, 7, 'verse'), false);
});

test('playableQueue keeps order and drops unbaked sections', () => {
  const order = ['case', 'comment', 'verse'];
  assert.deepEqual(playableQueue(manifest, 1, order), order);
  assert.deepEqual(playableQueue(manifest, 7, order), ['case']);
  assert.deepEqual(playableQueue(manifest, 29, order), []);
  assert.deepEqual(playableQueue(null, 1, order), []);
  assert.deepEqual(playableQueue(manifest, 1, undefined), []);
});
