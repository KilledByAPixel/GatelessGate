import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k13 from '../src/koans/k13.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// WHICH BRANCH A TAP LANDS IN, chosen by what the handler is actually offered
// rather than by counting calls. The tap probes the bowl first (it is small, and
// held out in front of a figure standing between two big forgiving pick
// volumes), then the drum, then the bell — and the old stubs here answered "the
// second distinct object list", so inserting the bowl silently moved every one
// of them onto the wrong branch. Naming the target makes the harness say what it
// means, and survives the next reordering.
function hitOnly(ctx, name) {
  ctx.input.raycastFirst = (cam, objs) => {
    for (const o of objs || []) {
      for (let n = o; n; n = n.parent) if (n.name === name) return { object: o };
    }
    return null;
  };
}

// Case 13 had no dedicated test file before Task 5C. Adding one narrowly, to
// pin the bell's tap cooldown found in review — the bell had none at all, so
// a held pointer could stack audio.bell() calls without limit. The drum has
// its own membrane voice (audio.drum) now, still uncooldowned on purpose.

test('module shape matches the koan contract', () => {
  assert.equal(k13.id, 13);
  assert.equal(k13.slug, 'tokusan-holds-his-bowl');
  assert.equal(k13.accent, ACCENT);
  assert.deepEqual(k13.ambience, ['wind:0.14', 'bell', 'drum', 'music']);
  assert.equal(typeof k13.build, 'function');
});

test('a held pointer on the bell cannot ring it without limit; the drum is untouched', () => {
  const rings = [];
  const beats = [];
  const audio = { bell: (o) => rings.push(o.f0), drum: (o) => beats.push(o) };
  const ctx = fakeCtx();
  ctx.audio = audio;
  const root = k13.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());

  hitOnly(ctx, 'bell');

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
  hitOnly(ctx, 'drum');

  root.update(0, 0);
  ctx._taps.forEach((cb) => cb());
  ctx._taps.forEach((cb) => cb());
  assert.equal(root.fragment().beats, 2, 'the drum still answers every tap');
  assert.equal(beats.length, 2);
});
