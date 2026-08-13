import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k25 from '../src/koans/k25.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const fakeCtx = () => sharedCtx({ audio: { knock() {}, startAmbience() {}, stopAmbience() {}, duck() {} } });

test('module shape matches the koan contract', () => {
  assert.equal(k25.id, 25);
  assert.equal(k25.slug, 'preaching-from-the-third-seat');
  assert.equal(typeof k25.build, 'function');
});

// THE FLOATING-HALL / SUNKEN-MONK BUG.
//
// Three things were adrift at once: the veranda hovered 0.32 up with daylight
// under it and no structure reaching the ground; the crowd sat 0.34 above the
// terrain (which is FLAT at y = 0 inside groundHeight's flatRadius here); and
// the seats + monks were placed for a much thinner deck than the veranda
// actually builds, so every figure stood 0.14 INSIDE the boards — a seated
// robe with its base swallowed reads as a squat, fat blob. The dream may
// float; it must float on a frame.
test('the hall stands on legs, the crowd on the ground, the monks on the boards', () => {
  const built = k25.build(fakeCtx());
  const scene = built.scene;

  // the veranda's under-frame reaches from under the deck to below the ground
  const veranda = scene.getObjectByName('veranda');
  assert.ok(veranda, 'veranda present');
  const leg = veranda.children.find((c) => c.name === 'leg');
  assert.ok(leg, 'the lifted veranda grew its under-frame');
  scene.updateMatrixWorld(true);
  const legBox = new THREE.Box3().setFromObject(leg);
  assert.ok(legBox.min.y < -0.05, `the frame sinks past the terrain: ${legBox.min.y}`);
  assert.ok(legBox.max.y < veranda.position.y + 0.34, 'and stays under the boards');

  // the crowd sits AT ground level (flat y = 0 here), not floated above it
  const assembly = scene.getObjectByName('assembly');
  assert.ok(assembly, 'assembly present');
  assert.equal(assembly.position.y, 0, 'the audience is on the ground');

  // every monk stands ON the deck surface, not inside it
  const deckTop = veranda.position.y + 0.34;
  const monks = [];
  scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 3, 'Kyozan and the two sitters');
  for (const m of monks) {
    assert.ok(m.position.y >= deckTop - 1e-6,
      `monk at y=${m.position.y} is on or above the deck top ${deckTop}`);
  }

  // and the seats rest on the boards rather than being buried in them
  const seats = [];
  scene.traverse((o) => { if (o.name === 'seat') seats.push(o); });
  assert.equal(seats.length, 3);
  for (const s of seats) {
    assert.ok(Math.abs((s.position.y - 0.10) - deckTop) < 1e-6,
      `seat base sits on the deck: ${s.position.y - 0.10} vs ${deckTop}`);
  }
});

// THE DREAM-ROCK / GRASS-SHIMMER BUG.
//
// The tuft field derives each tuft's atlas variant, mirror, stiffness and
// resting lean from its LIVE world XZ through a chaotic hash — correct only
// while a tuft's world position never moves. k25 rocks the whole `hall`, and
// composeWorld had attached the ground+grass to `hall`, so every tuft's world
// position changed every frame and its hashed attributes re-rolled: the meadow
// visibly re-randomised per frame, as though the meadow were regenerated on
// every one. The dream furniture may rock; the surrounding world may NOT, because
// the world carries the grass.
test('the meadow does not move when the dream rocks', () => {
  const built = k25.build(fakeCtx());
  const scene = built.scene;

  const grass = scene.getObjectByName('grassfield');
  assert.ok(grass, 'grass field present');
  const dream = scene.getObjectByName('dream');
  assert.ok(dream, 'dream group present');

  const grassAt = (t) => {
    built.update(1 / 60, t);
    scene.updateMatrixWorld(true);
    return grass.matrixWorld.elements.slice();
  };
  const dreamAt = (t) => {
    built.update(1 / 60, t);
    scene.updateMatrixWorld(true);
    return dream.matrixWorld.elements.slice();
  };

  const g0 = grassAt(0);
  const g1 = grassAt(2.0);
  const maxGrassDrift = g0.reduce((m, v, i) => Math.max(m, Math.abs(v - g1[i])), 0);
  assert.ok(maxGrassDrift < 1e-9,
    `grass world transform must be static across time, drifted ${maxGrassDrift}`);

  // and the rock must still be alive — otherwise this passes by killing the dream
  const d0 = dreamAt(0);
  const d1 = dreamAt(2.0);
  const maxDreamDrift = d0.reduce((m, v, i) => Math.max(m, Math.abs(v - d1[i])), 0);
  assert.ok(maxDreamDrift > 1e-5,
    'the dream hall must still rock');
});

test("the back screen fills the hall's own bay, in the plane of its posts", () => {
  // Three numbers were guessed at and all three were wrong: the screen stood
  // 1.3 units BEHIND the post line — out past the back of the deck, over open
  // ground — at 3.0 wide in a 5.4 bay and 2.3 tall in a 2.86 one, visibly
  // mismatched with the back wall and set too far behind it.
  // It reads veranda.opening now, so it cannot drift from the frame it
  // is set into whatever size that frame becomes.
  const root = k25.build(fakeCtx({ accent: k25.accent }));
  root.scene.updateMatrixWorld(true);
  const solid = (o) => {
    const b = new THREE.Box3(), t = new THREE.Box3();
    o.traverse((m) => {
      if (!m.isMesh || m.name === 'screen-hit') return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      t.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); b.union(t);
    });
    return b;
  };
  const screen = solid(root.scene.getObjectByName('screen'));
  const post = solid(root.scene.getObjectByName('post'));
  const beam = solid(root.scene.getObjectByName('beam'));
  const floor = solid(root.scene.getObjectByName('floor'));

  // IN the post plane, not behind it — and never past the back of the deck
  assert.ok(screen.min.z > post.min.z - 0.05 && screen.max.z < post.max.z + 0.05,
    `the screen sits in the post line: ${screen.min.z.toFixed(2)}..${screen.max.z.toFixed(2)} vs ${post.min.z.toFixed(2)}..${post.max.z.toFixed(2)}`);
  assert.ok(screen.min.z > floor.min.z - 0.2, 'and not out behind the deck it stands on');

  // filling the opening: deck boards to the underside of the beam
  assert.ok(Math.abs(screen.min.y - floor.max.y) < 0.05,
    `it lands on the boards: ${screen.min.y.toFixed(2)} vs deck ${floor.max.y.toFixed(2)}`);
  assert.ok(Math.abs(screen.max.y - beam.min.y) < 0.05,
    `it reaches the beam: ${screen.max.y.toFixed(2)} vs beam underside ${beam.min.y.toFixed(2)}`);

  // and corner post to corner post, with no daylight down either side
  assert.ok(screen.min.x < post.min.x + 0.2 && screen.max.x > post.max.x - 0.2,
    `it spans the bay: ${screen.min.x.toFixed(2)}..${screen.max.x.toFixed(2)} vs posts ${post.min.x.toFixed(2)}..${post.max.x.toFixed(2)}`);
});
