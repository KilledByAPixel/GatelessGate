import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k41 from '../src/koans/k41.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Bodhidharma: bring me your mind and I will pacify it. Something gathers
// where you reach, climbs, shrinks, and is gone off the top of the frame —
// every time, as many at once as you like.
test('a grasp is not the same note twice running', () => {
  // A choice between a few near notes rather than one repeated tube. With
  // several wisps in the air at once the
  // single repeated tube read as a UI click; three near-neighbours off the top
  // of the chime read as the same small thing happening again. Seeded from the
  // count, like everything else in this book that varies — there is no
  // Math.random outside src/audio.
  const struck = [];
  const ctx = fakeCtx({ audio: { chimeStrike: (o) => struck.push(o) } });
  const root = k41.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  const ground = root.scene.getObjectByName('snow-hit');
  ctx.input.raycastFirst = (cam, objs) => (objs.includes(ground)
    ? { object: ground, point: new THREE.Vector3(1, 0, -2) } : null);

  let t = 0;
  const step = () => { root.update(1 / 60, t); t += 1 / 60; };
  step();
  for (let i = 0; i < 14; i++) { ctx._taps.forEach((cb) => cb()); for (let k = 0; k < 12; k++) step(); }

  assert.equal(struck.length, 14, 'every grasp sounds — there is no cooldown left');
  const tubes = new Set(struck.map((s) => s.tube));
  assert.ok(tubes.size >= 3, `more than one note (${[...tubes].join(' ')})`);
  for (const s of struck) {
    // the staging net's own bound on a chime index
    assert.ok(Number.isInteger(s.tube) && s.tube >= 0 && s.tube < 5, `tube ${s.tube} is a real tube`);
    assert.ok(s.force > 0 && s.force < 0.4, 'and barely a sound, whichever it is');
  }

  // seeded, not random: the same page grasped the same way sounds the same
  const again = [];
  const ctx2 = fakeCtx({ audio: { chimeStrike: (o) => again.push(o.tube) } });
  const root2 = k41.build(ctx2);
  root2.setCamera(new THREE.PerspectiveCamera());
  const g2 = root2.scene.getObjectByName('snow-hit');
  ctx2.input.raycastFirst = (cam, objs) => (objs.includes(g2)
    ? { object: g2, point: new THREE.Vector3(1, 0, -2) } : null);
  let t2 = 0;
  const step2 = () => { root2.update(1 / 60, t2); t2 += 1 / 60; };
  step2();
  for (let i = 0; i < 14; i++) { ctx2._taps.forEach((cb) => cb()); for (let k = 0; k < 12; k++) step2(); }
  assert.deepEqual(again, struck.map((s) => s.tube));
});
