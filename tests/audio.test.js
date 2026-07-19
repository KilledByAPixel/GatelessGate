import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windParams, bellPartials } from '../src/audio/synths.js';
import { parseRecipe } from '../src/audio/engine.js';
import { chunkSentences, chooseVoice } from '../src/audio/narration.js';

test('chooseVoice prefers a good English voice over robotic defaults', () => {
  const voices = [
    { name: 'Microsoft David Desktop', lang: 'en-US', localService: true, default: true },
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Google Deutsch', lang: 'de-DE', localService: false },
  ];
  assert.equal(chooseVoice(voices).name, 'Google US English');
  // falls back to any English when nothing is "good", but avoids the flagged-bad one
  const meh = [
    { name: 'Microsoft Zira Desktop', lang: 'en-US', localService: true },
    { name: 'Plain English', lang: 'en-GB', localService: true },
  ];
  assert.equal(chooseVoice(meh).name, 'Plain English');
  assert.equal(chooseVoice([]), null);
});

test('chooseVoice honors a pinned preference (exact then fuzzy)', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', localService: false },
    { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', localService: false },
    { name: 'Daniel', lang: 'en-GB', localService: true },
  ];
  // an exact pin wins over the heuristic's favorite
  assert.equal(chooseVoice(voices, 'Daniel').name, 'Daniel');
  // fuzzy substring match too
  assert.equal(chooseVoice(voices, 'aria').name, 'Microsoft Aria Online (Natural)');
  // an unavailable pin falls back to the heuristic instead of returning null
  assert.equal(chooseVoice(voices, 'Siri').name, 'Google US English');
});

test('windParams monotonic and bounded', () => {
  const lo = windParams(0), hi = windParams(1);
  assert.ok(hi.gain > lo.gain && hi.cutoff > lo.cutoff);
  assert.ok(lo.gain >= 0 && hi.gain <= 1);
  const mid = windParams(0.5);
  assert.ok(mid.gain > lo.gain && mid.gain < hi.gain);
  assert.deepEqual(windParams(2), windParams(1)); // clamps
});

test('bellPartials are inharmonic and decaying', () => {
  const p = bellPartials(62);
  assert.ok(p.length >= 4);
  assert.ok(p[0].freq > 0);
  for (const x of p) {
    assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
  }
  // not a pure harmonic stack (some ratio is non-integer)
  const ratios = p.map((x) => x.freq / 62);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
});

test('parseRecipe', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25 });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1 });
});

test('chunkSentences splits on sentence boundaries', () => {
  const out = chunkSentences('A monk asked Joshu. Joshu answered: "Mu." Is that all?');
  assert.equal(out.length, 3);
  assert.match(out[0], /^A monk asked Joshu\.$/);
  assert.match(out[2], /Is that all\?$/);
  assert.deepEqual(chunkSentences('   '), []);
});
