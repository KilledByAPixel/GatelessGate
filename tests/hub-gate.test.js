import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { buildHub } from '../src/intro.js';

// THE CONTENTS' GATE RECURSION: tap the gate and it shrinks away to nothing
// while an identical gate, spawned far too big to be on camera, comes down to
// land exactly where it stood — a loop that can run for ever.
// What is worth pinning is the loop's bookkeeping, not its look: mid-flight
// there are two gates (one going, one coming), at rest there is exactly one,
// at scale 1, on the original spot — however many times it has turned over.

const hitAll = {
  raycastFirst: (cam, objs) => (objs && objs.length
    ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null),
};
const missAll = { raycastFirst: () => null };

function gatesOf(hub) {
  const out = [];
  hub.scene.traverse((o) => { if (o.name === 'gate' || o.name === 'gate-echo') out.push(o); });
  return out;
}

test('at rest: one visible gate at scale 1, and its echo parked hidden', () => {
  const hub = buildHub();
  const gates = gatesOf(hub);
  assert.equal(gates.length, 2, 'the gate and its echo');
  const visible = gates.filter((g) => g.visible);
  assert.equal(visible.length, 1, 'only one of them stands in the composition');
  assert.equal(visible[0].scale.x, 1);
});

test('the loop: out shrinks, in arrives from far too big, and they swap', () => {
  const hub = buildHub();
  const gates = gatesOf(hub);
  const home = gates.find((g) => g.visible);
  const homePos = home.position.clone();

  hub.update(1 / 60, 0);
  assert.equal(hub.tapGate(null, missAll), null, 'a miss must not start the loop');
  const hit = hub.tapGate(null, hitAll);
  assert.ok(hit, 'a hit on the gate starts it');

  // mid-flight: both gates drawn — the tapped one closing toward nothing, the
  // arriving one still larger than life (log-space from LOOP.big)
  hub.update(1 / 60, 1.3);
  assert.equal(gates.filter((g) => g.visible).length, 2, 'both gates are in flight');
  const scales = gates.map((g) => g.scale.x).sort((a, b) => a - b);
  assert.ok(scales[0] < 0.7, `the outgoing gate is closing, at ${scales[0]}`);
  assert.ok(scales[1] > 1.5, `the incoming gate is still arriving, at ${scales[1]}`);
  assert.equal(hub.tapGate(null, hitAll), null, 'refused mid-loop — no restart from half-way');

  // settled: one gate again, exactly scale 1, exactly where the first stood
  hub.update(1 / 60, 3.0);
  const standing = gates.filter((g) => g.visible);
  assert.equal(standing.length, 1, 'the arrival replaced the original');
  assert.equal(standing[0].scale.x, 1, 'at exactly the original size');
  assert.ok(standing[0].position.distanceTo(homePos) < 1e-9, 'on exactly the original spot');
  assert.ok(standing[0] !== home, 'and it IS the other object — the roles swapped');

  // ...and for ever: the swapped-in gate is tappable and the loop runs again
  assert.ok(hub.tapGate(null, hitAll), 'the loop comes round');
  hub.update(1 / 60, 6.0);
  const again = gates.filter((g) => g.visible);
  assert.equal(again.length, 1);
  assert.equal(again[0].scale.x, 1);
  assert.equal(again[0], home, 'two loops later the original object is back on duty');
  assert.equal(hub.loops(), 2);
});

test('a hub without a gate declines the tap instead of throwing', () => {
  const bare = buildHub({ gate: false });
  bare.update(1 / 60, 0);
  assert.equal(bare.tapGate(null, hitAll), null);
});
