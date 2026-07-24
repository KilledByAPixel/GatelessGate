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

test('a bird is three meshes — one merged body and two wings — with no outline', () => {
  const b = makeBird({ size: 0.5 });
  assert.equal(birdMeshes(b.group), 3);
  b.group.traverse((o) => {
    if (o.isMesh) assert.equal(o.userData.noOutline, true, 'birds never take an inverted hull');
  });
});

test('the wings actually move between folded and spread', () => {
  const b = makeBird({ size: 0.5 });
  const hinges = b.group.children.filter((c) => !c.isMesh);   // the two wing hinges
  assert.equal(hinges.length, 2);
  b.pose({ spread: 0 });
  const folded = hinges.map((h) => h.rotation.y);
  b.pose({ spread: 1 });
  const spreadY = hinges.map((h) => h.rotation.y);
  assert.notDeepEqual(folded, spreadY, 'folding changes the wing sweep');
});

test('the flock lives a full cycle: it reaches the ground and it reaches the sky', () => {
  const flock = makeBirds({ count: 6, seed: 24, height: 6, ground: [0, 0], groundR: 2 });
  const nodes = birdNodes(flock);
  assert.equal(nodes.length, 6);
  let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < 60 * 30; i++) {          // a 30-second day
    flock.update(1 / 60, i / 60);
    for (const n of nodes) { minY = Math.min(minY, n.position.y); maxY = Math.max(maxY, n.position.y); }
  }
  assert.ok(minY <= 0.02, `something should stand on the ground (min y ${minY})`);
  assert.ok(maxY > 4, `something should fly (max y ${maxY})`);
});

test('a grounded bird pecks — its nose pitch swings over time', () => {
  // one bird, no phase offset, parked at the start of its ground phase
  const flock = makeBirds({ count: 1, seed: 5, ground: [0, 0], groundR: 0 });
  const [node] = birdNodes(flock);
  const pitches = new Set();
  for (let i = 0; i < 240; i++) {
    flock.update(1 / 60, i / 60);
    if (node.position.y < 0.02) pitches.add(+node.rotation.x.toFixed(2));
  }
  assert.ok(pitches.size > 3, 'a standing bird changes pitch as it pecks and looks');
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
  assert.ok(flock.energy() > 0.5, 'the alarm registers at once');
  for (let t = 10; t < 40; t += 1 / 30) flock.update(1 / 30, t);
  assert.ok(flock.energy() < 0.05, 'and dies away on its own');
});

test('scatter lifts the flock: the birds are higher just after a scatter than just before', () => {
  const flock = makeBirds({ count: 6, seed: 24, ground: [0, 0] });
  // settle to a moment when the average is low (some on the ground)
  const nodes = birdNodes(flock);
  const avgY = () => nodes.reduce((s, n) => s + n.position.y, 0) / nodes.length;
  flock.update(1 / 60, 3);
  const before = avgY();
  flock.scatter();
  flock.update(1 / 60, 3 + 1 / 60);
  assert.ok(avgY() > before, `the flock rises when startled (${before} -> ${avgY()})`);
});

test('the flock is deterministic — same seed, same day', () => {
  const run = () => {
    const f = makeBirds({ count: 5, seed: 24, ground: [0.5, -1] });
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
