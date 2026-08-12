import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFlag } from '../src/kit/flag.js';

const DT = 1 / 60;

function runSteps(flag, n) {
  for (let i = 1; i <= n; i++) flag.update(DT, i * DT);
}

test('flag structure: pole, finial, cloth with matching vertex grid', () => {
  const f = makeFlag({ cols: 24, rows: 16 });
  assert.equal(f.group.name, 'flag');
  const cloth = f.group.children.find((c) => c.name === 'cloth');
  assert.ok(cloth, 'cloth mesh missing');
  assert.equal(cloth.geometry.attributes.position.count, 24 * 16);
  assert.ok(f.group.children.find((c) => c.name === 'pole'));
});

test('wind moves the cloth deterministically', () => {
  const a = makeFlag({ seed: 11 });
  const b = makeFlag({ seed: 11 });
  const start = Array.from(a.group.children.find((c) => c.name === 'cloth').geometry.attributes.position.array);
  runSteps(a, 90);
  runSteps(b, 90);
  const pa = Array.from(a.group.children.find((c) => c.name === 'cloth').geometry.attributes.position.array);
  const pb = Array.from(b.group.children.find((c) => c.name === 'cloth').geometry.attributes.position.array);
  assert.notDeepEqual(pa, start, 'cloth did not move');
  assert.deepEqual(pa, pb, 'same seed + same steps must match exactly');
});

test('different seeds diverge', () => {
  const a = makeFlag({ seed: 11 });
  const c = makeFlag({ seed: 12 });
  runSteps(a, 90);
  runSteps(c, 90);
  const pa = Array.from(a.group.children.find((x) => x.name === 'cloth').geometry.attributes.position.array);
  const pc = Array.from(c.group.children.find((x) => x.name === 'cloth').geometry.attributes.position.array);
  assert.notDeepEqual(pa, pc);
});
