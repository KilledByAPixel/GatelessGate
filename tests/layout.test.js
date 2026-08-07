import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { composeWorld, plantTree } from '../src/kit/scenery.js';
import { groundHeight } from '../src/kit/ground.js';
import { layoutGuides, makeLayoutOverlay } from '../src/dev/overlay.js';

// A world small enough to build in a test but real enough to record a real
// layout: the guides are only worth anything if they describe what composeWorld
// actually applied, so this goes through composeWorld rather than hand-writing
// a userData blob the code under test would happily agree with.
function world({ grassKeepout = null } = {}) {
  const scene = new THREE.Scene();
  const hut = new THREE.Group();
  hut.name = 'hut';
  hut.position.set(4, 0, -3);
  scene.add(hut);
  const out = composeWorld(scene, {
    seed: 5, trees: 2, rocks: 2, bushes: 2, grass: 200,
    forests: [], mountains: [{ count: 3, distance: 40, arcSpan: 2 }],
    keepout: [{ at: hut, r: 2.5 }, { x: -6, z: 1, r: 1.5 }],
    ...(grassKeepout ? { grassKeepout } : {}),
  });
  return { scene, hut, out };
}

// ---- plantTree --------------------------------------------------------------

test('plantTree stands a tree on the terrain at the spot you name', () => {
  const scene = new THREE.Scene();
  // well outside groundHeight's nine-unit flat middle, which is the only place
  // the old hand-placed `y: 0` was ever right
  const t = plantTree(scene, { x: 14.5, z: -11.25 });
  assert.equal(t.position.x, 14.5);
  assert.equal(t.position.z, -11.25);
  const want = groundHeight(14.5, -11.25, { seed: 21 }) - 0.06;
  assert.ok(Math.abs(t.position.y - want) < 1e-9, `planted at ${t.position.y}, terrain is ${want}`);
  assert.notEqual(want, -0.06, 'this spot must actually be off the flat, or the test proves nothing');
  assert.ok(scene.children.includes(t), 'it joins the scene it was given');
});

test('plantTree picks the species, and refuses one it does not have', () => {
  assert.equal(plantTree(null, { x: 1, z: 1 }).name, 'tree');
  assert.equal(plantTree(null, { x: 1, z: 1, kind: 'pine' }).name, 'pine');
  assert.equal(plantTree(null, { x: 1, z: 1, kind: 'oak' }).name, 'oak');
  // a typo that silently planted a broadleaf would be a scene that looks wrong
  // with nothing anywhere to read
  assert.throws(() => plantTree(null, { x: 1, z: 1, kind: 'birch' }), /unknown kind/);
});

test('plantTree is seeded by where it stands, and the same file builds the same wood', () => {
  const a = plantTree(null, { x: 3, z: 4 });
  const b = plantTree(null, { x: 3, z: 4 });
  const elsewhere = plantTree(null, { x: 3.4, z: 4 });
  assert.equal(a.rotation.y, b.rotation.y, 'same spot, same tree, every build');
  assert.notEqual(a.rotation.y, elsewhere.rotation.y, 'a different spot is a different tree');
  assert.ok(a.rotation.y >= 0 && a.rotation.y < Math.PI * 2);

  // and both halves can be pinned when a particular tree is worth keeping
  assert.equal(plantTree(null, { x: 3, z: 4, rotation: 1.2 }).rotation.y, 1.2);
  const s1 = plantTree(null, { x: 0, z: 0, seed: 77 }).rotation.y;
  const s2 = plantTree(null, { x: 9, z: -9, seed: 77 }).rotation.y;
  assert.equal(s1, s2, 'a named seed outranks the position');
});

test('plantTree honours a case that owns its own ground', () => {
  const groundFn = () => 2.5;
  assert.ok(Math.abs(plantTree(null, { x: 6, z: 6, groundFn }).position.y - (2.5 - 0.06)) < 1e-9);
  // and passes the rest through to the builder
  const short = plantTree(null, { x: 0, z: 0, kind: 'pine', height: 1.4 });
  const tall = plantTree(null, { x: 0, z: 0, kind: 'pine', height: 6.0 });
  const top = (m) => new THREE.Box3().setFromObject(m).max.y;
  assert.ok(top(tall) > top(short) + 3, `height reaches the builder: ${top(short)} vs ${top(tall)}`);
});

// ---- what composeWorld leaves behind ----------------------------------------

test('composeWorld records the circles it actually applied, not the ones it was handed', () => {
  const { scene, hut } = world();
  const L = scene.userData.layout;
  assert.ok(L, 'the layout record exists');
  // the {at: hut} form is resolved: the guides must draw the circle that was
  // enforced, and nothing downstream of asCircle ever sees the object form
  assert.equal(L.keepout.length, 2);
  const fromHut = L.keepout.find((k) => k.r === 2.5);
  assert.equal(fromHut.x, hut.position.x);
  assert.equal(fromHut.z, hut.position.z);
  assert.deepEqual(L.treeRing, [7, 20]);
  assert.ok(L.footprints.length > 0, 'the mountain circles the scatter refuses');
  assert.equal(L.grassKeepout, L.keepout, 'defaulted, grass shares the prop mask');
  // data only: no geometry, so a production build pays nothing for this
  for (const v of Object.values(L)) assert.ok(typeof v !== 'object' || v === null || !v.isObject3D);
});

// ---- the guides -------------------------------------------------------------

test('the guides describe the scene, and every coordinate is finite', () => {
  const { scene } = world();
  const guides = layoutGuides(scene, { target: [1, 1.2, -2] });
  const byName = Object.fromEntries(guides.map((g) => [g.name, g]));
  for (const want of ['keepout', 'ring', 'mountains', 'markers', 'target']) {
    assert.ok(byName[want], `missing guide group: ${want}`);
  }
  for (const g of guides) {
    assert.equal(g.points.length % 6, 0, `${g.name} is whole segments, two vertices each`);
    assert.ok(g.points.every(Number.isFinite), `${g.name} has a non-finite coordinate`);
  }
});

test('the grass mask is drawn only when it differs from the prop mask', () => {
  // Defaulted the two are the same array, and a green circle under every red
  // one is one muddy colour saying nothing.
  const plain = layoutGuides(world().scene);
  assert.ok(!plain.some((g) => g.name === 'grass'), 'no second copy of the same circles');

  const own = layoutGuides(world({ grassKeepout: [{ x: 0, z: 0, r: 3 }] }).scene);
  assert.ok(own.some((g) => g.name === 'grass'), 'a case with its own meadow mask gets it drawn');
});

test('markers stand on placed things, not on the world grammar', () => {
  const { scene, hut } = world();
  const markers = layoutGuides(scene).find((g) => g.name === 'markers').points;
  const xs = [];
  for (let i = 0; i < markers.length; i += 3) xs.push([markers[i], markers[i + 2]]);
  assert.ok(xs.some(([x, z]) => x === hut.position.x && z === hut.position.z),
    'the hut somebody placed carries a stem');
  // the ground, the grass field and the scatter are single objects covering the
  // whole scene: a marker at their origin is five ticks piled at 0,0 saying
  // nothing about where anything is
  const ground = scene.getObjectByName('ground');
  assert.ok(ground, 'the world grammar built a ground');
  const atOrigin = xs.filter(([x, z]) => x === 0 && z === 0).length;
  assert.equal(atOrigin, 0, 'no aggregate left a marker at the origin');
});

test('a scene with no layout record still gets its markers', () => {
  // The hub, the matter pages and the showcase do not all go through
  // composeWorld, and a guide overlay that threw on them would be a switch that
  // works on some pages.
  const scene = new THREE.Scene();
  const lantern = new THREE.Group();
  lantern.name = 'lantern';
  lantern.position.set(2, 0.4, -1);
  scene.add(lantern);
  const guides = layoutGuides(scene);
  assert.equal(guides.length, 1);
  assert.equal(guides[0].name, 'markers');
});

test('the overlay is lines only — it can never join the ink or the shadow map', () => {
  const { scene } = world();
  const overlay = makeLayoutOverlay(scene, { target: [0, 1, 0] });
  assert.ok(overlay.children.length > 0, 'it drew something');
  // One object per colour, not one per circle: the budget readout sits directly
  // above this switch in the workbench and has to stay readable while it is on.
  assert.ok(overlay.children.length <= 6, `${overlay.children.length} draws is too many for a guide`);
  overlay.traverse((o) => {
    assert.ok(!o.isMesh, `${o.name} is a mesh — the ink pass and the shadow map would take it`);
    if (o.material) {
      assert.equal(o.material.depthWrite, false, `${o.name} writes depth, so the depth-ink pass sees it`);
      assert.equal(o.material.fog, false, `${o.name} would fade into the paper like scenery`);
    }
  });
  // and it lets go of everything it made
  overlay.dispose();
  assert.equal(overlay.children.length, 0);
});
