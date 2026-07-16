import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDissolve } from '../src/render/dissolve.js';

const DT = 1 / 60;

test('starts covered, dissolveIn reveals and hides the quad', async () => {
  const d = makeDissolve();
  assert.equal(d.t, 0);
  assert.equal(d.mesh.visible, true);
  const done = d.dissolveIn(0.5);
  let resolved = false;
  done.then(() => { resolved = true; });
  for (let i = 0; i < 40; i++) d.update(DT); // 0.66s > 0.5s
  await Promise.resolve();
  assert.equal(resolved, true, 'promise should resolve after duration');
  assert.equal(d.t, 1);
  assert.equal(d.mesh.visible, false);
});

test('dissolveOut covers again; tween is monotonic', () => {
  const d = makeDissolve();
  d.set(1);
  assert.equal(d.mesh.visible, false);
  d.dissolveOut(0.5);
  let prev = d.t;
  for (let i = 0; i < 40; i++) {
    d.update(DT);
    assert.ok(d.t <= prev + 1e-9, `t rose during dissolveOut: ${prev} -> ${d.t}`);
    prev = d.t;
  }
  assert.equal(d.t, 0);
  assert.equal(d.mesh.visible, true);
});

test('deterministic: same update sequence gives same t', () => {
  const a = makeDissolve();
  const b = makeDissolve();
  a.dissolveIn(0.7);
  b.dissolveIn(0.7);
  for (let i = 0; i < 20; i++) { a.update(DT); b.update(DT); }
  assert.equal(a.t, b.t);
});
