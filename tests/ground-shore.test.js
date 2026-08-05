import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight, makeGround } from '../src/kit/ground.js';

// The shore taper (case 20's coast): past the waterline the land eases down
// below sea level and stays there. Everything that samples groundHeight with
// the same shore object agrees where the beach is — that is the whole point.

const SHORE = { dx: 0, dz: -1, dist: 8, width: 4, sea: -0.35, depth: 1.4 };

test('no shore option: byte-identical to the plain terrain', () => {
  for (const [x, z] of [[0, 0], [3, -7], [-12, 9], [20, -20]]) {
    assert.equal(
      groundHeight(x, z, { seed: 21 }),
      groundHeight(x, z, { seed: 21, shore: null }));
  }
});

test('inland of the beach the terrain is untouched', () => {
  // beach top edge sits at z = -(dist - width) = -4; z = -3.9 is landward of it
  for (const [x, z] of [[0, 5], [6, 0], [-9, 12], [2, -3.9]]) {
    assert.equal(
      groundHeight(x, z, { seed: 21, shore: SHORE }),
      groundHeight(x, z, { seed: 21 }),
      `land at (${x}, ${z}) moved`);
  }
});

test('the ground meets the sea exactly at the waterline', () => {
  // waterline: z = -dist. Within flatRadius the base terrain is 0, so the
  // blend has clean numbers to land on.
  assert.ok(Math.abs(groundHeight(0, -8, { seed: 21, shore: SHORE }) - SHORE.sea) < 1e-12);
  assert.ok(Math.abs(groundHeight(2, -8, { seed: 21, shore: SHORE }) - SHORE.sea) < 1e-12);
});

test('the beach descends monotonically from grass line to waterline', () => {
  let prev = Infinity;
  for (let z = -4; z >= -8; z -= 0.25) {
    const h = groundHeight(0, z, { seed: 21, shore: SHORE });
    assert.ok(h <= prev + 1e-12, `the beach rises again at z=${z}`);
    prev = h;
  }
});

test('past the waterline the seabed settles at sea - depth and stays there', () => {
  const far = groundHeight(0, -30, { seed: 21, shore: SHORE });
  assert.ok(Math.abs(far - (SHORE.sea - SHORE.depth)) < 1e-12,
    `seabed at ${far}, wanted ${SHORE.sea - SHORE.depth}`);
  // and it is flat out there — no hills poking up through the ocean
  assert.equal(far, groundHeight(11, -40, { seed: 21, shore: SHORE }));
});

test('makeGround drapes the mesh over the shore', () => {
  const dry = makeGround({ seed: 21 });
  const wet = makeGround({ seed: 21, shore: SHORE });
  const dpos = dry.geometry.attributes.position;
  const wpos = wet.geometry.attributes.position;
  let sank = 0, held = 0;
  for (let i = 0; i < wpos.count; i++) {
    const z = wpos.getZ(i);
    if (z < -14) { if (wpos.getY(i) < SHORE.sea - 1e-6) sank++; }
    if (z > -3) { if (wpos.getY(i) === dpos.getY(i)) held++; }
  }
  assert.ok(sank > 50, `only ${sank} seaward vertices sank`);
  assert.ok(held > 50, `only ${held} landward vertices held still`);
});

test('composeWorld passes shore through to the ground it builds', async () => {
  const { composeWorld } = await import('../src/kit/scenery.js');
  const THREE = await import('../lib/three.module.js');

  // Build two scenes with identical options except for shore
  const shoreScene = new THREE.Group();
  composeWorld(shoreScene, { seed: 20, groundSeed: 21, shore: SHORE, trees: 0, rocks: 0, bushes: 0, grass: 0 });
  const shoreGround = shoreScene.children.find((c) => c.name === 'ground');
  assert.ok(shoreGround, 'composeWorld built a shored ground');

  const noShoreScene = new THREE.Group();
  composeWorld(noShoreScene, { seed: 20, groundSeed: 21, trees: 0, rocks: 0, bushes: 0, grass: 0 });
  const noShoreGround = noShoreScene.children.find((c) => c.name === 'ground');
  assert.ok(noShoreGround, 'composeWorld built an unshored ground');

  // Compare seaward vertices: shore makes them sink below the unshored baseline
  const shorePos = shoreGround.geometry.attributes.position;
  const noShorePos = noShoreGround.geometry.attributes.position;
  let sunken = 0; // count where shored sank more than unshored
  for (let i = 0; i < shorePos.count; i++) {
    const z = shorePos.getZ(i);
    if (z < -14) { // seaward region
      if (shorePos.getY(i) < noShorePos.getY(i) - 0.5) {
        sunken++; // shored ground is significantly lower than unshored
      }
    }
  }
  assert.ok(sunken > 50, `shore did not sink seaward vertices (${sunken} sunken); wiring may be broken`);
});
