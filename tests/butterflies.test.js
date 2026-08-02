import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeButterflies } from '../src/kit/butterflies.js';
import { ACCENT } from '../src/palette.js';

// Two quads flapping and flying, playing around — and everything about that
// which can drift: the wing count, the hulls, the flap, the wander staying
// inside its box, the flit, and the determinism the whole book runs on.

function butterflies(flock) {
  const out = [];
  flock.group.traverse((o) => { if (o.name === 'butterfly') out.push(o); });
  return out;
}

test('a butterfly is two wing quads and nothing else, red, unhulled, double-sided', () => {
  const flock = makeButterflies({ count: 6, seed: 19 });
  assert.equal(flock.group.name, 'butterflies');
  const each = butterflies(flock);
  assert.equal(each.length, 6);
  assert.equal(flock.count(), 6);

  for (const b of each) {
    const wings = b.children.filter((c) => c.isMesh);
    assert.equal(wings.length, 2, 'two quads basically stuck together');
    assert.equal(b.children.length, 2, 'and NOTHING else — no body, no antennae');
    for (const w of wings) {
      assert.equal(w.name, 'butterfly-wing');
      assert.equal(w.userData.noOutline, true, 'a hull on a paper-thin wing is a blot');
      assert.equal(w.material.side, THREE.DoubleSide, 'wings read from both faces');
      assert.equal('#' + w.material.color.getHexString(), ACCENT.toLowerCase(), 'red by default');
      // a quad: two triangles, six vertices, hinged at the body line x = 0
      assert.equal(w.geometry.getAttribute('position').count, 6);
    }
    // the two wings share ONE material — six butterflies is twelve draws, one program
    assert.equal(wings[0].material, wings[1].material);
  }
});

test('the wings flap — a seeded beat, wings mirrored about the body line', () => {
  const flock = makeButterflies({ count: 3, seed: 7 });
  const [b] = butterflies(flock);
  const angles = new Set();
  for (let i = 0; i < 60; i++) {
    flock.update(1 / 60, i / 60);
    const [l, r] = b.children;
    assert.ok(Math.abs(l.rotation.z + r.rotation.z) < 1e-9, 'the stroke is a mirror pair');
    angles.add(+r.rotation.z.toFixed(3));
  }
  assert.ok(angles.size > 20, `the beat sweeps through real angles, got ${angles.size}`);
  assert.ok(Math.max(...angles) > 0.8, 'the wings close toward a high V');
  assert.ok(Math.min(...angles) < 0.2, 'and spread nearly flat again');
});

test('they fly, they stay in their box, and they COME DOWN to the grass', () => {
  // Frank asked for a round rather than a hover: "changing height as well,
  // like kinda landing on the grass for a little bit and flying away." So the
  // old "never lands" claim is exactly inverted — what has to hold now is
  // that they use the whole band, touch down, and never sink through it.
  const flock = makeButterflies({ count: 5, seed: 19, center: [2, -1], radius: 3, height: [0.6, 2.2] });
  const each = butterflies(flock);
  let minY = Infinity, maxY = -Infinity, worstR = 0;
  const roam = each.map(() => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
  for (let i = 0; i < 60 * 30; i++) {
    flock.update(1 / 60, i / 60);
    each.forEach((b, k) => {
      minY = Math.min(minY, b.position.y);
      maxY = Math.max(maxY, b.position.y);
      worstR = Math.max(worstR, Math.hypot(b.position.x - 2, b.position.z + 1));
      const r = roam[k];
      r.minX = Math.min(r.minX, b.position.x); r.maxX = Math.max(r.maxX, b.position.x);
      r.minZ = Math.min(r.minZ, b.position.z); r.maxZ = Math.max(r.maxZ, b.position.z);
    });
  }
  assert.ok(minY > 0.05, `settles ON the grass, never through it (min y ${minY.toFixed(2)})`);
  assert.ok(minY < 0.35, `and genuinely comes down (min y ${minY.toFixed(2)})`);
  assert.ok(maxY < 2.8, `never up with the birds (max y ${maxY.toFixed(2)})`);
  // somebody is perched, and somebody is flying, at some point in the round
  const lifts = [];
  for (let i = 0; i < 60 * 30; i += 17) { flock.update(1 / 60, i / 60); lifts.push(...flock.lift()); }
  assert.ok(Math.min(...lifts) === 0, 'at least one is fully perched at some point');
  assert.ok(Math.max(...lifts) === 1, 'and at least one fully airborne');
  assert.ok(worstR <= 3 * Math.SQRT2 + 1e-6, `the wander stays near home, worst ${worstR.toFixed(2)}`);
  // and each one genuinely plays around rather than hovering at one bloom
  roam.forEach((r, k) => {
    assert.ok(r.maxX - r.minX > 1.2, `butterfly ${k} roams across x (${(r.maxX - r.minX).toFixed(2)})`);
    assert.ok(r.maxZ - r.minZ > 1.2, `and across z (${(r.maxZ - r.minZ).toFixed(2)})`);
  });
});

test('a butterfly faces the way it is drifting', () => {
  const flock = makeButterflies({ count: 1, seed: 19 });
  const [b] = butterflies(flock);
  const headings = new Set();
  for (let i = 0; i < 60 * 20; i++) {
    flock.update(1 / 60, i / 60);
    headings.add(+b.rotation.y.toFixed(1));
  }
  assert.ok(headings.size > 5, 'the heading turns as the path wanders');
});

test('flit stirs them — they lift and beat quicker, then settle on their own', () => {
  const flock = makeButterflies({ count: 4, seed: 19 });
  const each = butterflies(flock);
  flock.update(1 / 60, 10);
  assert.equal(flock.energy(), 0);
  const avgY = () => each.reduce((s, b) => s + b.position.y, 0) / each.length;
  const before = avgY();
  flock.flit();
  assert.ok(flock.energy() > 0.5, 'the stir registers at once');
  flock.update(1 / 60, 10 + 1 / 60);
  assert.ok(avgY() > before, `they lift when stirred (${before.toFixed(2)} -> ${avgY().toFixed(2)})`);
  for (let t = 10; t < 30; t += 1 / 30) flock.update(1 / 30, t);
  assert.ok(flock.energy() < 0.05, 'and it dies away on its own');
});

test('deterministic — same seed same flight, different seed different flight, no wall clock', () => {
  const run = (seed) => {
    const f = makeButterflies({ count: 4, seed });
    const nodes = butterflies(f);
    const out = [];
    for (let i = 0; i < 240; i++) {
      f.update(1 / 60, i / 60);
      for (const n of nodes) {
        assert.ok([n.position.x, n.position.y, n.position.z, n.rotation.y].every(Number.isFinite));
        out.push(+n.position.x.toFixed(5), +n.position.y.toFixed(5), +n.position.z.toFixed(5));
      }
    }
    return out;
  };
  assert.deepEqual(run(19), run(19));
  assert.notDeepEqual(run(19), run(20));
});
