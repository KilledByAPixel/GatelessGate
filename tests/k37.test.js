import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k37 from '../src/koans/k37.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// "A buffalo passes through an enclosure. His head, horns and four legs all
// pass through. Why can't his tail pass too?"
//
// Tug the tail and he swings CLOCKWISE to face away, stops and shakes it, then
// carries on the same way round until he is standing exactly as he was — one
// full circle, always clockwise. Everything passes through, his tail comes
// round after it, and nothing has happened — which is the koan.

function staged() {
  const heard = [];
  const ctx = fakeCtx({ audio: { cloth: (o) => heard.push(o) } });
  const root = k37.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  const buffalo = root.scene.children.find((c) => c.name === 'buffalo');
  assert.ok(buffalo, 'the buffalo is staged');
  let t = 0;
  const step = () => { root.update(1 / 60, t); t += 1 / 60; root.scene.updateMatrixWorld(true); };
  const run = (secs) => { for (let i = 0; i < Math.round(60 * secs); i++) step(); };
  run(1);
  // hit whatever is offered — the only thing the case ever offers is the tail
  const aim = () => {
    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null);
  };
  // where his nose points in world space, which is the only thing a reader sees
  const facing = () => {
    const q = new THREE.Quaternion();
    buffalo.getWorldQuaternion(q);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  };
  return { ctx, root, buffalo, step, run, heard, aim, facing, tug: () => ctx._taps.forEach((cb) => cb()) };
}

test('case 37: a tug turns him all the way round, and back to where he stood', () => {
  const { root, buffalo, run, aim, facing, tug } = staged();
  const base = buffalo.rotation.y;
  const faced = facing();
  assert.equal(root.fragment().turned, 0, 'standing still to begin with');

  aim();
  tug();
  assert.equal(root.fragment().tugs, 1);

  run(2.6);                                    // past the first half
  assert.ok(root.fragment().turned > 0.45 && root.fragment().turned < 0.55,
    `halfway round and stopped (${root.fragment().turned})`);
  assert.ok(facing().angleTo(faced) > Math.PI * 0.9, 'he is facing away');

  run(4.5);                                    // and round the rest of it
  assert.equal(root.fragment().turned, 0, 'the circle is closed');
  // 2*PI is the same heading, so the shape returns 0 rather than holding a
  // wound-up offset for the life of the page
  assert.ok(Math.abs(buffalo.rotation.y - base) < 1e-9, 'exactly the heading he started at');
  assert.ok(facing().angleTo(faced) < 1e-6, 'and exactly the way he was facing');
});

test('case 37: he turns CLOCKWISE, both halves the same way round', () => {
  // clockwise seen from above is DECREASING rotation.y — the right-hand rule
  // about +y turns the other way, and getting it backwards is a bug you can
  // only catch by looking
  const { buffalo, step, run, aim, tug } = staged();
  const base = buffalo.rotation.y;
  aim();
  tug();
  let everIncreased = false;
  let lowest = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const before = buffalo.rotation.y;
    step();
    const d = buffalo.rotation.y - before;
    lowest = Math.min(lowest, buffalo.rotation.y - base);
    // the only rise allowed is the 2*PI wrap on the last frame of the circle
    if (d > 1e-9 && d < 6) everIncreased = true;
  }
  assert.equal(everIncreased, false, 'he never doubles back — the second half is the same way round');
  assert.ok(lowest < -Math.PI * 1.9, `and he goes the whole way (${(lowest / Math.PI).toFixed(2)} pi)`);
  run(1);
});

test('case 37: nothing the reader can see ever jumps', () => {
  // the raw rotation.y wraps by 2*PI when the circle closes; the FACING does
  // not move, and the facing is the only thing on screen
  const { step, aim, facing, tug } = staged();
  aim();
  tug();
  let prev = facing();
  let worst = 0;
  for (let i = 0; i < 60 * 9; i++) {
    step();
    const now = facing();
    worst = Math.max(worst, now.angleTo(prev));
    prev = now;
  }
  // a 180-degree turn over 2.4s peaks near 2 degrees a frame
  assert.ok(worst < 0.06, `worst single-frame turn ${(worst * 180 / Math.PI).toFixed(2)} degrees`);
});

test('case 37: he shakes the tail when he gets there, not when you tug it', () => {
  const { root, run, heard, aim, tug } = staged();
  aim();
  tug();
  assert.equal(heard.length, 1, 'the tug itself is one sound');
  run(2.0);
  assert.equal(heard.length, 1, 'and nothing more while he is turning');
  run(2.0);                                    // through the shake
  assert.ok(heard.length >= 3, `the shake is several swishes, spaced (${heard.length})`);
  assert.ok(root.fragment().tailEnergy > 0, 'and the tail is actually moving');
  const during = heard.length;
  run(3.0);
  assert.equal(heard.length, during, 'and it is over before he is back');
});

test('case 37: a tug is refused until he has finished the circle', () => {
  const { root, run, aim, tug } = staged();
  aim();
  tug();
  run(1);
  tug();
  tug();
  assert.equal(root.fragment().tugs, 1, 'let him finish the circle he is already walking');
  run(7);
  assert.equal(root.fragment().turned, 0);
  tug();
  assert.equal(root.fragment().tugs, 2, 'and he answers again once it is done');
});

test('case 37: nothing goes non-finite over a long run of tugging', () => {
  const { root, buffalo, run, aim, tug } = staged();
  aim();
  for (let i = 0; i < 6; i++) { tug(); run(7); }
  for (const [k, v] of Object.entries(root.fragment())) {
    assert.ok(typeof v === 'boolean' || Number.isFinite(v), `fragment.${k} is ${v}`);
  }
  assert.ok(Number.isFinite(buffalo.rotation.y) && Number.isFinite(buffalo.rotation.z));
});

test('case 37: the whole animal is the target, not just his tail', () => {
  // It WAS the tail alone — the one part of him painted full ACCENT against his
  // deepened body, so the small thing the reader is invited to touch was the
  // small thing the case is named for. A lovely argument, and it meant the page
  // was dead to anybody who did the obvious thing: clicking the buffalo itself
  // produced nothing at all.
  //
  // A target chosen because it is thematically right is still wrong if it is
  // not the thing a hand goes to.
  const { ctx, root, buffalo, run, tug } = staged();
  const inTail = (o) => { for (let p = o; p; p = p.parent) if (p.name === 'tail') return true; return false; };
  const body = [];
  buffalo.traverse((o) => {
    if (o.isMesh && o.material && o.material.visible !== false && !inTail(o)) body.push(o);
  });
  assert.ok(body.length > 6, `he is made of more than his tail (${body.length} meshes)`);

  // aim at his BODY — a mesh with no tail anywhere above it in the graph
  ctx.input.raycastFirst = (cam, objs) => {
    for (const o of objs || []) if (body.includes(o)) return { object: o, point: new THREE.Vector3() };
    return null;
  };
  tug();
  assert.equal(root.fragment().tugs, 1, 'touching the animal reaches the case');
  run(3);
  assert.ok(root.fragment().turned > 0.4, `and he turns (${root.fragment().turned})`);
});
