import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';

import k7 from '../src/koans/k7.js';
import k30, { POND } from '../src/koans/k30.js';
import k33 from '../src/koans/k33.js';
import { ACCENT, ACCENT_PALE } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Cases 7, 30 and 33 each held their water in a solid cylinder and set the
// surface a couple of centimetres below its top face — so the cap covered the
// water, and case 30's pond rendered as a bare stone disc with the sheet and
// all four koi sealed inside it. Nothing in the suite noticed, because every
// individual object was where its case said it should be.
//
// These tests assert the thing that was actually broken: that if you look down
// into the vessel, you see water.

function staged(mod) {
  const root = mod.build(fakeCtx());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return root;
}

const boxOf = (scene, name) => {
  let found = null;
  scene.traverse((o) => { if (o.name === name && !found) found = o; });
  return found ? new THREE.Box3().setFromObject(found) : null;
};

// Every real mesh in the scene, minus the inverted-hull outlines (which are
// backface-only shells and would answer a ray from outside the object).
function solids(scene) {
  const out = [];
  scene.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) out.push(o);
  });
  return out;
}

function surfaceMesh(scene) {
  let m = null;
  scene.traverse((o) => { if (o.name === 'surface' && !m) m = o; });
  return m;
}

// What do you see looking straight down at (x, z)?
function lookDown(scene, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObjects(solids(scene), false);
  return hits.length ? hits[0].object : null;
}

// WHERE to look is read off the water itself, not written down beside it. Case
// 7's basin used to be a pair of literals here, and when Frank moved the basin a
// unit across the garden the ray went on staring at the old spot and reported
// that the vessel was full of footpath. A test that has to be edited every time
// a prop moves is a test that will one day be edited wrongly.
const over = (root, name) => {
  let found = null;
  root.scene.traverse((o) => { if (!found && o.name === name) found = o; });
  const p = new THREE.Vector3();
  found.getWorldPosition(p);
  return p;
};

for (const [label, mod] of [
  ['case 7 basin', k7],
  ['case 30 pond', k30],
  ['case 33 pond', k33],
]) {
  test(`${label}: looking down into the vessel, you see water`, () => {
    const root = staged(mod);
    const p = over(root, 'water');
    const seen = lookDown(root.scene, p.x, p.z);
    assert.ok(seen, 'the ray hit something at all');
    assert.equal(seen.name, 'surface',
      `looking into the vessel shows "${seen.name}", not the water`);
  });

  test(`${label}: the water sits inside the stone, not through it`, () => {
    const root = staged(mod);
    const water = boxOf(root.scene, 'surface');
    const stone = boxOf(root.scene, label.startsWith('case 7') ? 'basin' : 'lip');
    assert.ok(water && stone);
    // below the rim it cannot slop over...
    assert.ok(water.max.y < stone.max.y,
      `water reaches ${water.max.y}, the rim is at ${stone.max.y}`);
    // ...and inside the walls it cannot poke through
    assert.ok(water.max.x < stone.max.x && water.min.x > stone.min.x,
      'the sheet is narrower than the vessel holding it');
    assert.ok(water.max.z < stone.max.z && water.min.z > stone.min.z);
  });
}

// The pair's reds (Frank, overnight pass 2 + morning notes + polish round 2):
// in case 33 the koi wear the case's one red; in case 30 the red is the urna
// AND — Frank's later ruling, knowingly doubling it — the pond sheet itself
// ("make the pond water red — the surface of the water itself, not the fish,
// not the sides"). The mat is dark in BOTH scenes — same mat, same spot,
// occupied in 30 and bare in 33 — so the check is written against both:
// same pond, different carriers, and the mat never competes with either.
test('case 33: the koi carry the red and the mat has gone to ink', () => {
  const root = staged(k33);
  const red = new THREE.Color(ACCENT).getHexString();
  const bodies = [];
  root.scene.traverse((o) => { if (o.name === 'koi-body') bodies.push(o); });
  assert.ok(bodies.length >= 4, 'a school to carry the seal');
  for (const b of bodies) {
    assert.equal(b.material.color.getHexString(), red, 'every fish wears the accent');
  }
  let cushion = null;
  root.scene.traverse((o) => { if (o.name === 'cushion' && !cushion) cushion = o; });
  assert.ok(cushion, 'the bare mat is still on the seat');
  assert.notEqual(cushion.material.color.getHexString(), red,
    'the mat gave the red up — one accent per koan');
  // case 30's red water must NOT leak into 33: this pond builds its own sheet,
  // and here the red belongs to the koi alone
  const surface = surfaceMesh(root.scene);
  assert.notEqual(surface.material.color.getHexString(), red,
    'case 33 water stays ink-wash — its red is the koi');
});

test('case 30: the reds are the urna and the water sheet — koi ink, stone bare, no glow on the water', () => {
  const root = staged(k30);
  const red = new THREE.Color(ACCENT).getHexString();
  const pink = new THREE.Color(ACCENT_PALE).getHexString();
  let urna = null;
  let lip = null;
  const bodies = [];
  root.scene.traverse((o) => {
    if (o.name === 'urna' && !urna) urna = o;
    if (o.name === 'koi-body') bodies.push(o);
    if (o.name === 'lip' && !lip) lip = o;
  });
  assert.ok(urna, 'the seated buddha carries his forehead dot');
  assert.equal(urna.material.color.getHexString(), red, 'the urna keeps its red');
  // Frank: "the surface of the water itself" — the sheet is red, but the LIGHT
  // mix. Full accent over a pond-sized area read as blood ("a little bit too
  // red... it looks like the blood almost"), and the deep mix then read as too
  // dark ("more like a pinkish red... slightly more pinkish").
  const surface = surfaceMesh(root.scene);
  assert.equal(surface.material.color.getHexString(), pink,
    'the pond sheet wears the PALE accent (Frank\'s ruling)');
  // and it does NOT take the seal glow: emissive light is the same from every
  // angle, so it flattens the toon ramp and the ripples stop reading — which
  // is exactly what Frank saw ("I barely see it do anything")
  assert.equal(surface.material.emissive.getHexString(), '000000',
    'water never glows: it has to shade, or its ripples vanish');
  // ...and the red is NOT on the fish and NOT on the sides
  for (const b of bodies) {
    assert.notEqual(b.material.color.getHexString(), red, 'case 30 koi are ink, not accent');
  }
  let stoneRed = false;
  lip.traverse((o) => {
    if (o.isMesh && o.material.color && o.material.color.getHexString() === red) stoneRed = true;
  });
  assert.ok(!stoneRed, 'the basin stone stays stone — "not the sides"');
});

for (const [label, mod] of [['case 30', k30], ['case 33', k33]]) {
  test(`${label}: the koi are under the water and clear of the floor`, () => {
    const root = staged(mod);
    const water = boxOf(root.scene, 'surface');
    const koi = boxOf(root.scene, 'koi');
    assert.ok(water && koi, 'the pond has both a surface and fish');
    assert.ok(koi.max.y < water.min.y,
      `a fish reaches ${koi.max.y} through a surface as low as ${water.min.y}`);
    assert.ok(koi.min.y > POND.floor,
      `a fish reaches ${koi.min.y}, below the pond floor at ${POND.floor}`);
  });

  // They ride the ripples now, so they have to keep doing both over time — and
  // the check has to be LOCAL. Comparing the school's highest point against the
  // pond's lowest point compares a fish at one end with a trough at the other,
  // which no fish ever has to swim under. What matters is the water directly
  // above each fish, which a downward ray onto the surface gives exactly.
  test(`${label}: the koi stay submerged while the water is moving`, () => {
    const root = staged(mod);
    const fish = [];
    root.scene.traverse((o) => { if (o.name === 'fish') fish.push(o); });
    assert.ok(fish.length > 0, 'there are fish to check');

    let worstClearance = Infinity;
    let deepest = Infinity;
    for (let i = 0; i < 300; i++) {
      root.update(1 / 60, i / 60);
      root.scene.updateMatrixWorld(true);
      for (const f of fish) {
        const box = new THREE.Box3().setFromObject(f);
        const c = box.getCenter(new THREE.Vector3());
        const ray = new THREE.Raycaster(
          new THREE.Vector3(c.x, 40, c.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(surfaceMesh(root.scene), false)[0];
        if (hit) worstClearance = Math.min(worstClearance, hit.point.y - box.max.y);
        deepest = Math.min(deepest, box.min.y);
      }
    }
    assert.ok(worstClearance > 0,
      `a fin broke the surface above it by ${-worstClearance}`);
    assert.ok(deepest > POND.floor,
      `a fish sank through the floor: ${deepest} vs ${POND.floor}`);
  });
}
