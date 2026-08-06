import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRain } from '../src/kit/rainfall.js';

test('rain is seeded and a closed form over simTime', () => {
  const a = makeRain({ count: 60, seed: 34 });
  const b = makeRain({ count: 60, seed: 34 });
  a.update(0.016, 7.3);
  b.update(0.5, 7.3);      // different dt, same simTime -> same weather
  const pa = a.points.geometry.attributes.position.array;
  const pb = b.points.geometry.attributes.position.array;
  assert.deepEqual(Array.from(pa), Array.from(pb));
  for (const v of pa) assert.ok(Number.isFinite(v));
  const { width, depth, height } = a.extent();
  for (let i = 0; i < pa.length; i += 3) {
    assert.ok(Math.abs(pa[i]) <= width, 'x out of extent');
    assert.ok(pa[i + 1] >= -1 && pa[i + 1] <= height + 1, 'y out of extent');
    assert.ok(Math.abs(pa[i + 2]) <= depth, 'z out of extent');
  }
  a.dispose(); b.dispose();
});

test('a surge lengthens the streaks and decays away', () => {
  const r = makeRain({ count: 40, seed: 34 });
  r.update(0.016, 2.0);
  const calmLen = segLen(r);
  r.surge(1);
  assert.ok(r.surgeLevel() > 0.9);
  r.update(0.016, 2.016);
  assert.ok(segLen(r) > calmLen * 1.2, 'surge must visibly lengthen streaks');
  for (let i = 0; i < 600; i++) r.update(0.05, 2.016 + i * 0.05);
  assert.ok(r.surgeLevel() < 0.05, 'surge must decay');
  r.dispose();

  function segLen(rain) {
    const p = rain.points.geometry.attributes.position.array;
    const dx = p[3] - p[0], dy = p[4] - p[1], dz = p[5] - p[2];
    return Math.hypot(dx, dy, dz);
  }
});
