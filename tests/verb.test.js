import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverbIR, mulberry32 } from '../src/audio/verb.js';

test('the noise source never collapses into a cycle', () => {
  // Regression: the previous LCG's multiply overflowed 2^53, and the degraded
  // sequence fell into ONE shared 10,466-sample cycle for every seed — at
  // 48 kHz, a pattern repeating 4.6x/sec. Frank heard it as "wah wah wah" in
  // every noise bed, and the room carried it as flutter-echo.
  const rand = mulberry32(777);
  const seen = new Set();
  for (let i = 0; i < 200000; i++) {
    // raw doubles as keys: a true cycle repeats exactly, so this is the
    // strictest possible repetition check
    seen.add(rand());
  }
  assert.ok(seen.size > 199000, `values repeat far too often: ${seen.size} unique of 200k`);

  // and the IR itself must not echo at the old cycle's lag: normalized
  // autocorrelation at lag 10466 stays low for genuinely aperiodic noise
  const ir = reverbIR(48000, 2, 1013);
  const LAG = 10466, START = 20000, N = 40000;
  let xy = 0, xx = 0, yy = 0;
  for (let i = START; i < START + N; i++) {
    const a = ir[i], b = ir[i + LAG];
    xy += a * b; xx += a * a; yy += b * b;
  }
  const r = xy / Math.sqrt(xx * yy);
  assert.ok(Math.abs(r) < 0.2, `the tail echoes itself at the old cycle lag: r=${r}`);
});

test('reverbIR is deterministic and decays to silence', () => {
  const a = reverbIR(48000, 2, 1013);
  const b = reverbIR(48000, 2, 1013);
  assert.equal(a.length, 96000);
  assert.deepEqual(a, b);
  const peak = (arr) => { let m = 0; for (const v of arr) m = Math.max(m, Math.abs(v)); return m; };
  const head = peak(a.subarray(0, 4800));
  const tail = peak(a.subarray(a.length - 4800));
  assert.ok(head > 0.05, `head too quiet: ${head}`);
  assert.ok(tail < head * 0.01, `tail does not decay: ${tail} vs ${head}`);
});

test('reverbIR channels decorrelate and the tail darkens', () => {
  const l = reverbIR(48000, 2, 1013);
  const r = reverbIR(48000, 2, 7331);
  // normalized correlation at lag 0 — different seeds must not track each other,
  // or the stereo image collapses to mono
  let lr = 0, ll = 0, rr = 0;
  for (let i = 0; i < l.length; i++) { lr += l[i] * r[i]; ll += l[i] * l[i]; rr += r[i] * r[i]; }
  assert.ok(Math.abs(lr / Math.sqrt(ll * rr)) < 0.05, 'channels correlate');
  // highs die first: zero-crossing rate falls along the tail
  const zc = (arr) => { let c = 0; for (let i = 1; i < arr.length; i++) if ((arr[i] >= 0) !== (arr[i - 1] >= 0)) c++; return c; };
  const q = Math.floor(l.length / 4);
  assert.ok(zc(l.subarray(l.length - q)) < zc(l.subarray(0, q)) * 0.8, 'tail does not darken');
});
