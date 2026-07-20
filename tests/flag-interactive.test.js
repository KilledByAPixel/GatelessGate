import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFlag } from '../src/kit/flag.js';
import { clothEnergy } from '../src/sim/verlet.js';

const DT = 1 / 60;
const run = (f, n, t0 = 0) => { for (let i = 1; i <= n; i++) f.update(DT, t0 + i * DT); };

test('cloth is warmed up at build time so it never snaps into shape on spawn', () => {
  const maxAbsZ = (f) => {
    const p = f.cloth.positions;
    let m = 0;
    for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.abs(p[i + 2]));
    return m;
  };
  // the grid is authored planar (z = 0 everywhere); after warm-up wind has shaped it
  const warm = makeFlag({ seed: 11 });
  assert.ok(maxAbsZ(warm) > 0.05, `warm cloth already shaped, got ${maxAbsZ(warm)}`);
  assert.ok(clothEnergy(warm.cloth) > 0, 'warm cloth already carries motion');

  // with the warm-up skipped it spawns flat and frozen — the snap we are avoiding
  const cold = makeFlag({ seed: 11, warmup: 0 });
  assert.ok(maxAbsZ(cold) < 1e-9, 'cold cloth is still the flat authored grid');
  assert.equal(clothEnergy(cold.cloth), 0, 'cold cloth is motionless until first update');
});

test('wind off settles the cloth; wind on revives it', () => {
  const f = makeFlag({ seed: 11 });
  assert.equal(f.isWindOn(), true);
  f.setWindTarget(0);
  run(f, 480);   // 8s — at 4s the cloth is still swinging, so the baseline was not a baseline
  assert.ok(f.windLevel() < 0.05, `windLevel ${f.windLevel()}`);
  const still = clothEnergy(f.cloth);
  assert.ok(still < 5e-3, `settled energy ${still}`);
  f.setWindTarget(1);
  run(f, 240, 8);
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

test('hover is accepted while flying, ignored while stilled', () => {
  const flying = makeFlag({ seed: 11 });
  assert.equal(flying.hoverAt(0.75, -0.6), true, 'flying flag accepts hover');
  const stilled = makeFlag({ seed: 11 });
  stilled.setWindTarget(0);
  assert.equal(stilled.hoverAt(0.75, -0.6), false, 'stilled flag refuses hover');
});

test('hover while stilled changes nothing (bit-identical to no hover)', () => {
  const a = makeFlag({ seed: 11 });
  const b = makeFlag({ seed: 11 });
  a.setWindTarget(0); b.setWindTarget(0);
  run(a, 300); run(b, 300);
  a.hoverAt(0.75, -0.6);   // refused — must leave no trace
  run(a, 30, 5); run(b, 30, 5);
  assert.deepEqual(Array.from(a.cloth.positions), Array.from(b.cloth.positions));
});

test('cloth mesh is exposed for raycasting', () => {
  const f = makeFlag({});
  assert.ok(f.mesh && f.mesh.name === 'cloth');
});
