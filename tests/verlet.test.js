import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloth, stepCloth, clothEnergy } from '../src/sim/verlet.js';

const DT = 1 / 60;

test('createCloth builds the expected grid', () => {
  const c = createCloth(4, 3, 0.5);
  assert.equal(c.positions.length, 4 * 3 * 3);
  assert.equal(c.pins.length, 12);
  // default pin: top row (r === 0)
  assert.deepEqual(Array.from(c.pins.slice(0, 4)), [1, 1, 1, 1]);
  assert.deepEqual(Array.from(c.pins.slice(4)), Array(8).fill(0));
  // structural: 3*3 horizontal + 4*2 vertical = 17; shear: 3*2*2 = 12
  assert.equal(c.constraints.length, 17 + 12);
});

test('pinned points never move', () => {
  const c = createCloth(6, 5, 0.3);
  const before = Array.from(c.positions.slice(0, 6 * 3));
  for (let i = 0; i < 200; i++) {
    stepCloth(c, DT, { force: (x, y, z, i2) => [3, 0, 1] });
  }
  assert.deepEqual(Array.from(c.positions.slice(0, 6 * 3)), before);
});

test('deterministic: identical cloths stay identical', () => {
  const a = createCloth(8, 6, 0.25);
  const b = createCloth(8, 6, 0.25);
  const force = (x, y) => [2 * Math.sin(y), 0, Math.cos(x)];
  for (let i = 0; i < 120; i++) {
    stepCloth(a, DT, { force });
    stepCloth(b, DT, { force });
  }
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
});

test('constraints converge: hanging cloth settles near rest lengths', () => {
  const c = createCloth(8, 6, 0.25);
  for (let i = 0; i < 900; i++) stepCloth(c, DT, { iterations: 4 });
  let maxErr = 0;
  for (const [a, b, rest] of c.constraints) {
    const dx = c.positions[b * 3] - c.positions[a * 3];
    const dy = c.positions[b * 3 + 1] - c.positions[a * 3 + 1];
    const dz = c.positions[b * 3 + 2] - c.positions[a * 3 + 2];
    maxErr = Math.max(maxErr, Math.abs(Math.hypot(dx, dy, dz) - rest) / rest);
  }
  assert.ok(maxErr < 0.05, `max constraint error ${maxErr}`);
});

test('clothEnergy: settles toward zero without forces', () => {
  const c = createCloth(8, 6, 0.25);
  for (let i = 0; i < 30; i++) stepCloth(c, DT);
  const early = clothEnergy(c);
  for (let i = 0; i < 900; i++) stepCloth(c, DT);
  const late = clothEnergy(c);
  assert.ok(late < early, `energy did not decay: ${early} -> ${late}`);
  assert.ok(late < 1e-4, `did not settle: ${late}`);
});
