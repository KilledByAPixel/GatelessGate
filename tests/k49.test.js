import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k49 from '../src/koans/k49.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';

// A ctx whose raycast can be pointed at one named hit target at a time, so a
// test can tap the enso or the water deliberately.
function harness() {
  let tap = null;
  let hitName = null;
  const ctx = {
    audio: null,
    input: {
      onTap: (cb) => { tap = cb; },
      onHover: () => {},
      raycastFirst: (cam, objs) =>
        (hitName && objs.some((o) => o && o.name === hitName)
          ? { object: objs[0], point: new THREE.Vector3(-3.7, 0.3, -1.6) }
          : null),
    },
  };
  const root = k49.build(ctx);
  const cam = new THREE.PerspectiveCamera(38, 1.78, 0.1, 200);
  cam.position.set(6, 5, 8); cam.lookAt(0.2, 1.5, -2.4); cam.updateMatrixWorld(true);
  root.setCamera(cam);
  return { root, tapAt: (name) => { hitName = name; tap(); hitName = null; }, cam };
}

const named = (scene, name) => {
  const out = [];
  scene.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

test('the gate is the one red thing — the book\'s closing seal', () => {
  const { root } = harness();
  assert.equal(named(root.scene, 'gate').length, 1);
  const want = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT].map((c) => new THREE.Color(c).getHexString()));
  const reds = new Set();
  root.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.color
        && want.has(o.material.color.getHexString())) reds.add(o.name);
  });
  // every red mesh is a piece of the gate, and nothing else in the scene is red
  const gateParts = new Set(['post', 'lintel', 'tie']);
  for (const name of reds) assert.ok(gateParts.has(name), `${name} should not be red`);
  assert.ok(reds.size > 0, 'the gate carries the accent');
});

test('the living things are all there: water, koi, and birds', () => {
  const { root } = harness();
  assert.equal(named(root.scene, 'surface').length, 1, 'a pond surface');
  assert.ok(named(root.scene, 'fish').length >= 3, 'koi in it');
  assert.ok(named(root.scene, 'bird').length >= 6, 'birds crossing');
});

test('the koi stay under the pond surface as it moves', () => {
  const { root } = harness();
  const surface = named(root.scene, 'surface')[0];
  const fish = named(root.scene, 'fish');
  for (let i = 0; i < 300; i++) {
    root.update(1 / 60, i / 60);
    root.scene.updateMatrixWorld(true);
    for (const f of fish) {
      const c = new THREE.Box3().setFromObject(f).getCenter(new THREE.Vector3());
      const ray = new THREE.Raycaster(new THREE.Vector3(c.x, 40, c.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(surface, false)[0];
      if (hit) assert.ok(new THREE.Box3().setFromObject(f).max.y < hit.point.y, 'a fin broke the surface');
    }
  }
});

test('touching the gate rings a bell', () => {
  const { root, tapAt } = harness();
  root.update(1 / 60, 1.0);
  tapAt('gate-hit');
  assert.equal(root.fragment().rings, 1, 'the tap rang the gate');
  // a second tap in the same instant does not double-ring (the 0.5s guard)
  tapAt('gate-hit');
  assert.equal(root.fragment().rings, 1, 'no double-ring on a rapid second tap');
});

test('touching the water rings it', () => {
  const { root, tapAt } = harness();
  tapAt('surface');
  assert.equal(root.fragment().rippled, 1, 'the touch made a ripple');
});

test('nothing goes non-finite over a long run', () => {
  const { root } = harness();
  const movers = [];
  root.scene.traverse((o) => { if (o.name === 'bird' || o.name === 'fish') movers.push(o); });
  for (let i = 0; i < 60 * 30; i++) {
    root.update(1 / 60, i / 60);
    for (const m of movers) {
      assert.ok(Number.isFinite(m.position.x) && Number.isFinite(m.position.y) && Number.isFinite(m.position.z));
    }
  }
});
