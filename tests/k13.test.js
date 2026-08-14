import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k13 from '../src/koans/k13.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';
import { collectDrums, beatDrumAt, setDrumAudio } from '../src/kit/drum.js';

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
// its own membrane voice (audio.drum), still uncooldowned on purpose — and is
// struck from the kit now rather than from this case, so its tests go through
// beatDrumAt.

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

test('the drum has no cooldown and answers every tap', () => {
  // THE DRUM IS NOT THIS CASE'S TAP ANY MORE. It answers wherever it stands,
  // from the kit through main's own handler (kit/drum.js), which is why this
  // goes through beatDrumAt rather than the case's callbacks — and why
  // tests/drum.test.js holds the rule for the whole book. What stays here is
  // this page's own claim: no cooldown, every tap counted, on this scene.
  const beats = [];
  setDrumAudio({ drum: (o) => beats.push(o) });
  const ctx = fakeCtx();
  const root = k13.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(0, 0);

  const drums = collectDrums(root.scene);
  assert.equal(drums.length, 1, 'the sweep finds this page’s drum');
  const hit = { raycastFirst: () => ({}) };
  beatDrumAt(drums, new THREE.PerspectiveCamera(), hit);
  beatDrumAt(drums, new THREE.PerspectiveCamera(), hit);
  assert.equal(root.fragment().beats, 2, 'the drum still answers every tap');
  assert.equal(beats.length, 2);
  setDrumAudio(null);
});

test('the bowl still wins a tap aimed at it, with the drum handled elsewhere', () => {
  // The bowl is small and held in front of a figure standing between two big
  // forgiving pick volumes, and main's drum handler now runs BEFORE this
  // case's. That is only safe because the two do not overlap on screen — this
  // pins it, since a re-staging that slid the drum behind the bowl would take
  // the bowl's tap away with nothing failing.
  const ctx = fakeCtx();
  const root = k13.build(ctx);
  const cam = rigCamera(k13.camera || {}, { far: 200 });
  root.setCamera(cam);
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);

  const find = (n) => { let f = null; root.scene.traverse((o) => { if (!f && o.name === n) f = o; }); return f; };
  const centre = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  const drumMeshes = [];
  find('drum').traverse((o) => { if (o.isMesh) drumMeshes.push(o); });

  const ray = new THREE.Raycaster();
  const at = centre(find('held-bowl')).project(cam);
  ray.setFromCamera(new THREE.Vector2(at.x, at.y), cam);
  assert.equal(ray.intersectObjects(drumMeshes, false).length, 0,
    'a ray aimed at the bowl reaches the drum — main’s handler would take the tap first');
});
