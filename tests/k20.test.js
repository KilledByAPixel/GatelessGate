import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k20 from '../src/koans/k20.js';

// Case 20 on the coast. The case's two facts, pinned:
//
//   1. The man is immovable and everything else is not — he hangs off the
//      scene ROOT while the entire world, ocean included, sits in the
//      `moving` group. "If the feet of enlightenment moved, the great ocean
//      would overflow" — so when you push him, the ocean itself sways.
//   2. The coast layout: sea to the front (-z), ground diving below sea level
//      seaward, sand between, and no mountain standing in the water.

function fakeCtx() {
  const taps = [];
  return {
    audio: null,
    input: { onTap: (cb) => taps.push(cb), onHover: () => {}, raycastFirst: () => null },
    _taps: taps,
  };
}

function staged() {
  const ctx = fakeCtx();
  const root = k20.build(ctx);
  // a real camera, not `{}` — the kept-verbatim push handler reads
  // camera.position to compute the shove direction (see k12/k16/k19/k46/k47
  // and staging.test.js's own rigCamera() for the same convention)
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return { ctx, root };
}

test('case 20: the ambience finally names water — the bed the ocean was kept for', () => {
  const layers = k20.ambience.map((t) => String(t).split(':')[0]);
  assert.ok(layers.includes('water'), `no water in [${k20.ambience}]`);
  assert.ok(layers.includes('wind'));
});

test('case 20: the man is out of the moving world, and the ocean is in it', () => {
  const { root } = staged();
  const man = root.scene.getObjectByName('immovable-man');
  const moving = root.scene.getObjectByName('moving-world');
  assert.ok(man && moving);
  assert.equal(man.parent, root.scene, 'the man hangs off the root, immovable');
  assert.ok(moving.getObjectByName('water'), 'the ocean is in the moving world');
  assert.ok(moving.getObjectByName('sand'), 'so is the beach');
  let inMoving = false;
  man.traverseAncestors((a) => { if (a === moving) inMoving = true; });
  assert.ok(!inMoving);
});

test('case 20: the sea is seaward, at sea level, below the meadow', () => {
  const { root } = staged();
  const water = root.scene.getObjectByName('water');
  assert.ok(water.position.y < 0, `the sheet floats at ${water.position.y}`);
  assert.ok(water.position.z < -20, 'the ocean lies off the -z shore');
});

test('case 20: the ground dives below sea level toward the sea', () => {
  const { root } = staged();
  const ground = root.scene.getObjectByName('ground');
  const pos = ground.geometry.attributes.position;
  let sank = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < -14 && pos.getY(i) < -0.4) sank++;
  }
  assert.ok(sank > 50, `the seabed did not sink (${sank})`);
});

test('case 20: a shove still moves the world — ocean and all — and never the man', () => {
  const { ctx, root } = staged();
  const hit = root.scene.getObjectByName('colossus-hit');
  ctx.input.raycastFirst = () => ({ object: hit, point: new THREE.Vector3(), distance: 1 });
  ctx._taps.forEach((cb) => cb());
  root.update(1 / 60, 0.3);                    // a quarter-ish period into the sway
  const f = root.fragment();
  assert.equal(f.shoves, 1);
  assert.ok(Math.hypot(f.worldX, f.worldZ) > 0.01, 'the world did not give');
  assert.equal(f.manX, 0.4, 'the man moved — he must never');
});

test('case 20: the ocean is actually swelling, not a still sheet', () => {
  const { root } = staged();
  const surface = root.scene.getObjectByName('surface');
  const at = (t) => { root.update(1 / 60, t); return Array.from(surface.geometry.attributes.position.array); };
  assert.notDeepEqual(at(1.0), at(4.0), 'no drift: the ocean is a floor');
});

test('case 20: the foam rides the beach, inside the moving world', () => {
  const { root } = staged();
  const moving = root.scene.getObjectByName('moving-world');
  const foam = moving.getObjectByName('foam');
  assert.ok(foam, 'the wave-ends are in the moving world — the shove sways them too');
  root.update(1 / 60, 2.0);
  const a = Array.from(foam.geometry.attributes.position.array);
  root.update(1 / 60, 5.0);
  const b = Array.from(foam.geometry.attributes.position.array);
  assert.notDeepEqual(a, b, 'the foam is alive');
});

test('case 20: the surf breathes — update feeds the swell to the audio', () => {
  const calls = [];
  const ctx = fakeCtx();
  ctx.audio = { knock() {}, setWaterSwell: (v) => calls.push(v) };
  const root = k20.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  for (let t = 0; t < 8; t += 0.5) root.update(1 / 60, t);
  assert.ok(calls.length >= 16, 'the swell is driven every update');
  assert.ok(calls.every((v) => v >= 0 && v <= 1), 'the drive stays in 0..1');
  const spread = Math.max(...calls) - Math.min(...calls);
  assert.ok(spread > 0.3, `the surf actually breathes (spread ${spread})`);
});
