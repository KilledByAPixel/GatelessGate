import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wav, parseWav, concatWavs } from '../scripts/lib/gemini-tts.js';

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

test('concatWavs joins chunks and inserts the seam gap', () => {
  const a = wav(Buffer.alloc(48000));   // 1.0s
  const b = wav(Buffer.alloc(24000));   // 0.5s
  const joined = parseWav(concatWavs([a, b], { gapMs: 300 }));
  assert.equal(joined.ok, true);
  // 1.0 + 0.3 gap + 0.5 = 1.8s
  assert.ok(Math.abs(joined.seconds - 1.8) < 1e-6, `got ${joined.seconds}s`);
});

test('concatWavs on a single chunk is a passthrough of duration', () => {
  const a = wav(Buffer.alloc(48000));
  assert.ok(Math.abs(parseWav(concatWavs([a], { gapMs: 300 })).seconds - 1) < 1e-9);
});

test('concatWavs rejects a bad chunk rather than emitting garbage', () => {
  assert.throws(() => concatWavs([wav(Buffer.alloc(1000)), Buffer.from('nope')], {}));
});

test('parseWav finds data past extra header chunks (ffmpeg-style)', () => {
  // ffmpeg's loudnorm output carries a `fact`/`LIST` chunk before `data`, so the audio
  // is not at the fixed offset our own writer uses. This is the exact shape that made a
  // stitched section come out near-silent until parseWav learned to walk the chunks.
  const pcm = Buffer.alloc(48000);          // 1.0s
  const base = wav(pcm);                     // minimal header, data at 44
  const fmt = base.subarray(12, 36);         // the `fmt ` chunk
  const fact = Buffer.alloc(12);
  fact.write('fact', 0); fact.writeUInt32LE(4, 4); fact.writeUInt32LE(24000, 8);
  const dataHdr = Buffer.alloc(8);
  dataHdr.write('data', 0); dataHdr.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([fmt, fact, dataHdr, pcm]);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0); riff.writeUInt32LE(4 + body.length, 4); riff.write('WAVE', 8);
  const info = parseWav(Buffer.concat([riff, body]));
  assert.equal(info.ok, true);
  assert.ok(Math.abs(info.seconds - 1) < 1e-9, `seconds ${info.seconds}`);
  assert.equal(info.channels, 1);
});
