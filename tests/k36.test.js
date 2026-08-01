import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k36 from '../src/koans/k36.js';
import { walkHeading } from '../src/kit/walk.js';

// Case 36, meeting a Zen master on the road. Frank's note this round: "they're
// facing the wrong way — 90 degrees from where they should be." The bug was
// walkHeading assuming the figure fronts local +x when the body fronts +z
// (proved in shots wip-monk-axis-*), so this pins the thing he actually saw:
// each traveller's rotation.y agrees with the direction he is MEASURED to be
// moving, to within the gait's own sway — walking down the road, facing down
// the road, both directions.

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    accent: k36.accent,
    quality: 'high',
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const SWAY = 0.06;                      // the walk's own heading wander amplitude

test('both travellers face the way they are actually moving', () => {
  const built = k36.build(fakeCtx());
  const master = built.scene.getObjectByName('master');
  const monks = [];
  built.scene.traverse((o) => { if (o.name === 'monk' || o.name === 'master') monks.push(o); });
  const traveller = monks.find((m) => m !== master);
  assert.ok(master && traveller, 'the master and the traveller are both on the road');

  // settle onto the first pass, then measure velocity by finite difference at
  // a few beats well away from either figure's wrap
  let frame = 0;
  const step = () => { frame++; built.update(1 / 60, frame / 60); };
  const stepTo = (sec) => { while (frame < Math.round(sec * 60)) step(); };
  stepTo(1.0);
  for (const beat of [1.5, 2.5, 3.5]) {
    stepTo(beat);
    const before = { master: master.position.clone(), traveller: traveller.position.clone() };
    step();
    for (const [who, fig] of [['master', master], ['traveller', traveller]]) {
      const vx = fig.position.x - before[who].x, vz = fig.position.z - before[who].z;
      assert.ok(Math.hypot(vx, vz) > 1e-5, `${who} is walking, not standing`);
      const err = Math.abs(wrap(fig.rotation.y - walkHeading(vx, vz)));
      assert.ok(err <= SWAY + 0.02,
        `${who} at ${beat}s faces his travel: off by ${err.toFixed(3)} rad (sway is ±${SWAY})`);
    }
  }
});

test('they walk the one road in opposite directions, each on his own side', () => {
  const built = k36.build(fakeCtx());
  const master = built.scene.getObjectByName('master');
  const monks = [];
  built.scene.traverse((o) => { if (o.name === 'monk' || o.name === 'master') monks.push(o); });
  const traveller = monks.find((m) => m !== master);

  built.update(1 / 60, 0);
  const m0 = master.position.clone(), t0 = traveller.position.clone();
  for (let i = 1; i <= 120; i++) built.update(1 / 60, i / 60);
  const mv = master.position.clone().sub(m0), tv = traveller.position.clone().sub(t0);
  mv.y = 0; tv.y = 0;
  assert.ok(mv.length() > 0.1 && tv.length() > 0.1, 'two seconds of road each');
  assert.ok(mv.dot(tv) < 0, 'one comes on as the other goes away');
  // and their quarter-turn error would have had them walking shoulder-first:
  // facing must track travel for BOTH signs of travel, which the first test
  // checks — here we only need the lanes to hold them apart as they pass
  const gap = Math.hypot(
    master.position.x - traveller.position.x,
    master.position.z - traveller.position.z);
  assert.ok(gap > 0.8, `never inside each other, got ${gap.toFixed(2)}`);
});
