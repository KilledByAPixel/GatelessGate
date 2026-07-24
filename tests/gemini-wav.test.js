import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wav, parseWav } from '../scripts/lib/gemini-tts.js';

// 24 kHz mono 16-bit: 48000 bytes = 1 second.
const oneSecond = Buffer.alloc(48000);

test('parseWav round-trips a file wav() wrote', () => {
  const info = parseWav(wav(oneSecond));
  assert.equal(info.ok, true);
  assert.equal(info.rate, 24000);
  assert.equal(info.channels, 1);
  assert.ok(Math.abs(info.seconds - 1) < 1e-9);
});

test('parseWav rejects a truncated file', () => {
  // The failure this guards against: a bake killed mid-write leaves the header (which
  // declares the full data length) but not the audio that should follow it.
  const full = wav(oneSecond);
  const cut = full.subarray(0, full.length - 10000);   // header intact, tail missing
  assert.equal(parseWav(cut).ok, false);
});

test('parseWav rejects non-wav and empty input', () => {
  assert.equal(parseWav(Buffer.from('not audio at all, no riff header here')).ok, false);
  assert.equal(parseWav(Buffer.alloc(10)).ok, false);
  assert.equal(parseWav(Buffer.alloc(0)).ok, false);
  assert.equal(parseWav(null).ok, false);
});

test('parseWav rejects a header claiming zero data', () => {
  const empty = wav(Buffer.alloc(0));
  assert.equal(parseWav(empty).ok, false);
});
