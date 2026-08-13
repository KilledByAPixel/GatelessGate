import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBird } from '../src/kit/bird.js';
import { makeBirds } from '../src/kit/birds.js';

function birdMeshes(group) {
  let n = 0;
  group.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

function birdNodes(flock) {
  const out = [];
  flock.group.traverse((o) => { if (o.name === 'bird') out.push(o); });
  return out;
}

test('a bird is three meshes — one merged body and two wings', () => {
  const b = makeBird({ size: 0.5 });
  assert.equal(birdMeshes(b.group), 3);
});

test('the wings beat — a flap moves the wing hinges', () => {
  const b = makeBird({ size: 0.5 });
  const hinges = b.group.children.filter((c) => !c.isMesh);   // the two wing hinges
  assert.equal(hinges.length, 2);
  b.pose({ flap: -0.6 });
  const down = hinges.map((h) => h.rotation.z);
  b.pose({ flap: 0.6 });
  const up = hinges.map((h) => h.rotation.z);
  assert.notDeepEqual(down, up, 'the beat changes the wing angle');
});

test('the birds stay aloft — they never come down to the ground', () => {
  const flock = makeBirds({ count: 8, seed: 24, height: 6 });
  const nodes = birdNodes(flock);
  let minY = Infinity;
  for (let i = 0; i < 60 * 30; i++) {
    flock.update(1 / 60, i / 60);
    for (const n of nodes) minY = Math.min(minY, n.position.y);
  }
  assert.ok(minY > 2, `birds should stay well off the ground (min y ${minY})`);
});

test('the birds actually travel — they do not hover in one spot', () => {
  // follow one bird and measure how far it roams across the sky. A hovering
  // bird barely moves; a flying one covers real ground.
  const flock = makeBirds({ count: 1, seed: 24, center: [0, 0], height: 6, spread: 5 });
  const [node] = birdNodes(flock);
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < 60 * 20; i++) {           // 20 seconds
    flock.update(1 / 60, i / 60);
    minX = Math.min(minX, node.position.x); maxX = Math.max(maxX, node.position.x);
    minZ = Math.min(minZ, node.position.z); maxZ = Math.max(maxZ, node.position.z);
  }
  assert.ok(maxX - minX > 4, `a flying bird ranges across x (spanned ${(maxX - minX).toFixed(1)})`);
  assert.ok(maxZ - minZ > 4, `and across z (spanned ${(maxZ - minZ).toFixed(1)})`);
});

test('a bird faces the way it is going', () => {
  // heading should keep changing as it flies the circuit, not sit fixed
  const flock = makeBirds({ count: 1, seed: 24 });
  const [node] = birdNodes(flock);
  const headings = new Set();
  for (let i = 0; i < 300; i++) {
    flock.update(1 / 60, i / 60);
    headings.add(+node.rotation.y.toFixed(1));
  }
  assert.ok(headings.size > 5, 'heading turns through the circuit');
});

test('nothing goes non-finite over a long, repeatedly scattered run', () => {
  const flock = makeBirds({ count: 8, seed: 34 });
  const nodes = birdNodes(flock);
  for (let i = 0; i < 60 * 60; i++) {
    if (i % 200 === 0) flock.scatter();
    flock.update(1 / 60, i / 60);
    for (const n of nodes) {
      assert.ok(Number.isFinite(n.position.x) && Number.isFinite(n.position.y) && Number.isFinite(n.position.z));
    }
  }
});

test('scatter raises the flock energy, which decays back to nothing', () => {
  const flock = makeBirds({ count: 4, seed: 24 });
  flock.update(1 / 60, 10);
  assert.equal(flock.energy(), 0);
  flock.scatter();
  // THE ALARM HAS AN ATTACK. It was a bare decaying exponential and exp(-0) is
  // 1, so energy stepped 0 -> 1 on the frame the burst landed — and the climb
  // is `E * 2.2`, which teleported the whole flock 2.2 units into the air
  // between two frames. It comes up over ~0.3s now.
  assert.ok(flock.energy() < 0.2, 'nothing snaps on the frame of the scatter');
  for (let t = 10; t < 10.5; t += 1 / 60) flock.update(1 / 60, t);
  assert.ok(flock.energy() > 0.5, 'but the alarm is plainly up within half a second');
  for (let t = 10.5; t < 42; t += 1 / 30) flock.update(1 / 30, t);
  assert.ok(flock.energy() < 0.05, 'and dies away on its own');
});

test('scatter lifts the flock higher', () => {
  const flock = makeBirds({ count: 6, seed: 24, height: 6 });
  const nodes = birdNodes(flock);
  const avgY = () => nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length;
  flock.update(1 / 60, 3);
  const before = avgY();
  flock.scatter();
  flock.update(1 / 60, 3 + 1 / 60);
  assert.ok(avgY() > before, `the flock climbs when startled (${before} -> ${avgY()})`);
});

test('the flock is deterministic — same seed, same flight', () => {
  const run = () => {
    const f = makeBirds({ count: 5, seed: 24 });
    const nodes = birdNodes(f);
    const out = [];
    for (let i = 0; i < 300; i++) {
      f.update(1 / 60, i / 60);
      for (const n of nodes) out.push(+n.position.x.toFixed(5), +n.position.y.toFixed(5), +n.position.z.toFixed(5));
    }
    return out;
  };
  assert.deepEqual(run(), run());
});
