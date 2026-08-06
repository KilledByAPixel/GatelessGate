import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k13 from '../src/koans/k13.js';
import { ACCENT } from '../src/palette.js';

// Case 13 had no dedicated test file before Task 5C. Adding one narrowly, to
// pin the bell's tap cooldown found in review — the bell had none at all, so
// a held pointer could stack audio.bell() calls without limit. The drum has
// its own membrane voice (audio.drum) now, still uncooldowned on purpose.

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
    },
    _taps: taps, _hovers: hovers,
  };
}

test('module shape matches the koan contract', () => {
  assert.equal(k13.id, 13);
  assert.equal(k13.slug, 'tokusan-holds-his-bowl');
  assert.equal(k13.accent, ACCENT);
  assert.deepEqual(k13.ambience, ['wind:0.14', 'bell', 'drum', 'music']);
  assert.equal(typeof k13.build, 'function');
});

test('a held pointer on the bell cannot ring it without limit; the drum is untouched', () => {
  // The tap handler probes drum.pickTargets() first, then bell.pickTargets()
  // (src/koans/k13.js) — so a raycastFirst that answers the SECOND distinct
  // object list per tap and misses the first reaches the bell branch alone.
  const rings = [];
  const beats = [];
  const audio = { bell: (o) => rings.push(o.f0), drum: (o) => beats.push(o) };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k13.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());

  let call = 0;
  ctx.input.raycastFirst = (cam, objs) => {
    call++;
    if (call % 2 === 1) return null;          // miss the drum's list
    return { object: objs[0] };               // hit the bell's list
  };

  root.update(0, 0);
  ctx._taps.forEach((cb) => cb());   // first strike
  ctx._taps.forEach((cb) => cb());   // immediate repeat, inside the 0.5s cooldown
  ctx._taps.forEach((cb) => cb());   // and again
  assert.equal(root.fragment().rings, 1, 'repeats inside the cooldown must not stack');
  assert.equal(rings.length, 1, 'only one bell actually rang');
  assert.equal(beats.length, 0, 'the drum branch was never reached in this harness');

  root.update(0.6, 0.6);             // past the cooldown
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().rings, 2, 'a tap after the cooldown rings again');
  assert.equal(rings.length, 2);
});

test('the drum has no cooldown and answers every tap — its own voice now', () => {
  const beats = [];
  const audio = { bell() {}, drum: (o) => beats.push(o) };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k13.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = (cam, objs) => ({ object: objs[0] });   // always hits the drum, checked first

  root.update(0, 0);
  ctx._taps.forEach((cb) => cb());
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().beats, 2, 'the drum still answers every tap');
  assert.equal(beats.length, 2);
});
