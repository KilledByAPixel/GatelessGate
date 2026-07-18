import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFlag } from '../src/kit/flag.js';
import { clothEnergy } from '../src/sim/verlet.js';

const DT = 1 / 60;
const run = (f, n, t0 = 0) => { for (let i = 1; i <= n; i++) f.update(DT, t0 + i * DT); };

test('wind off settles the cloth; wind on revives it', () => {
  const f = makeFlag({ seed: 11 });
  assert.equal(f.isWindOn(), true);
  f.setWindTarget(0);
  run(f, 240);
  assert.ok(f.windLevel() < 0.05, `windLevel ${f.windLevel()}`);
  const still = clothEnergy(f.cloth);
  assert.ok(still < 0.01, `settled energy ${still}`);
  f.setWindTarget(1);
  run(f, 240, 4);
  assert.ok(f.windLevel() > 0.9, `windLevel ${f.windLevel()}`);
  assert.ok(clothEnergy(f.cloth) > still * 2, 'wind should re-energize the cloth');
});

test('toggleWind flips the target and reports it', () => {
  const f = makeFlag({ seed: 11 });
  assert.equal(f.toggleWind(), false); // was on → now off
  assert.equal(f.isWindOn(), false);
  assert.equal(f.toggleWind(), true);
  assert.equal(f.isWindOn(), true);
});

test('hoverAt injects energy into a still flag', () => {
  const f = makeFlag({ seed: 11 });
  f.setWindTarget(0);
  run(f, 300);
  const before = clothEnergy(f.cloth);
  f.hoverAt(0.75, -0.6); // middle-ish of the cloth (local coords)
  run(f, 8, 5);
  assert.ok(clothEnergy(f.cloth) > before, `hover should stir the cloth: ${before} -> ${clothEnergy(f.cloth)}`);
});

test('cloth mesh is exposed for raycasting', () => {
  const f = makeFlag({});
  assert.ok(f.mesh && f.mesh.name === 'cloth');
});
