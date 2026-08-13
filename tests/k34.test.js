import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k34 from '../src/koans/k34.js';
import { ACCENT_DEEP } from '../src/palette.js';
import { setFoliageWeather, foliageWind } from '../src/kit/foliage.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// "Mind is not Buddha. Learning is not the path." The scene is the study the
// second sentence walks out of — the red house — with a reading mat and a
// student still on it, and rain overhead.
//
// TOUCH THE HOUSE and the shower leans in for a moment: the house is the red
// thing, so the house is what you touch. It used to be the MAT, which is a low pale rectangle
// mostly hidden under a seated monk: the one thing on the page the composition
// does not point at, on a page whose single red object is the house.

function staged() {
  // the trees' wind is one module-level uniform shared by the whole book, so
  // state what this test starts from rather than inheriting the last one's
  setFoliageWeather({ wind: 1 });
  const heard = [];
  const ctx = fakeCtx({
    audio: {
      rainSurge: () => heard.push('rain'),
      chimeStrike: () => heard.push('chime'),
      // the surge brings weather with it, not just water
      setWindLevel: () => {},
    },
  });
  const root = k34.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);

  const hut = root.scene.getObjectByName('hut');
  const chime = [];
  hut.children
    .filter((c) => c.name === 'furin')
    .forEach((c) => c.traverse((o) => { if (o.isMesh) chime.push(o); }));
  const body = [];
  hut.traverse((o) => { if (o.isMesh && !chime.includes(o)) body.push(o); });

  // hit only the objects in `only`, so each test aims at one thing and the
  // handler's own probe order is what decides the outcome
  const aimAt = (only) => {
    ctx.input.raycastFirst = (cam, objs) => {
      for (const o of objs || []) if (only.includes(o)) return { object: o, point: new THREE.Vector3(), distance: 1 };
      return null;
    };
  };
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  return { ctx, root, run, heard, hut, body, chime, aimAt, tap: () => ctx._taps.forEach((cb) => cb()) };
}

test('case 34: the house is the red thing on the page', () => {
  const { hut } = staged();
  const deep = new THREE.Color(ACCENT_DEEP).getHex();
  let red = 0;
  hut.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.getHex() === deep) red++; });
  assert.ok(red > 0, 'the study carries the seal — which is why it is the target');
});

test('case 34: touching the house calls the rain', () => {
  const { root, run, heard, body, aimAt, tap } = staged();
  assert.equal(root.fragment().disturbed, 0);
  aimAt(body);
  tap();
  run(0.5);
  const f = root.fragment();
  assert.equal(f.disturbed, 1);
  assert.ok(f.surge > 0.5, `the shower leans in (${f.surge})`);
  assert.deepEqual(heard, ['rain']);
});

test('case 34: the mat is not the target any more', () => {
  const { root, run, heard, aimAt, tap } = staged();
  const mat = [root.scene.getObjectByName('mat')];
  assert.ok(mat[0], 'the mat is still staged — it just does not answer');
  aimAt(mat);
  tap();
  run(0.5);
  assert.equal(root.fragment().disturbed, 0, 'the reading mat answers nothing');
  assert.deepEqual(heard, []);
  // and there is no orphaned pick proxy left behind from when it did
  assert.equal(root.scene.getObjectByName('mat-hit'), undefined);
});

test('case 34: a tap on nothing calls nothing', () => {
  const { root, run, heard, tap } = staged();
  tap();
  run(0.5);
  assert.equal(root.fragment().disturbed, 0);
  assert.deepEqual(heard, []);
});

test('case 34: the eave chime keeps its own taps', () => {
  // it hangs UNDER the house and is a child of it, so the chime is probed
  // first and returns — otherwise one tap would ring it and call the rain
  const { root, run, heard, chime, aimAt, tap } = staged();
  assert.ok(chime.length, 'a tube hangs under the eave');
  aimAt(chime);
  tap();
  run(0.5);
  assert.equal(root.fragment().disturbed, 0, 'ringing the chime does not also call the rain');
  assert.deepEqual(heard, ['chime']);
});

test('case 34: the surge passes on its own, and asking again works', () => {
  const { root, run, body, aimAt, tap } = staged();
  aimAt(body);
  tap();
  run(0.5);
  assert.ok(root.fragment().surge > 0.5);
  run(12);
  assert.ok(root.fragment().surge < 0.05, `the sky settles back to its own patter (${root.fragment().surge})`);
  tap();
  run(0.5);
  assert.equal(root.fragment().disturbed, 2, 'and it can be asked again');
});

// THE SURGE IS WEATHER, not just water — more rain AND more wind together.
// Rain falling plumb while the
// meadow lies over is two weathers on one page, so the shower leans with it.
// All of it rides ONE envelope — the rain's own surge level — so the grass, the
// wood, the lean, the chime and the ear cannot drift apart.
test('case 34: the surge brings wind with it, and hands it all back', () => {
  const { root, run, body, aimAt, tap } = staged();
  const calm = root.fragment();
  assert.equal(calm.gust, 0, 'no wind until it is asked for');
  const restLean = calm.rainLean;
  const restGrass = calm.grassWind;

  aimAt(body);
  tap();
  run(0.5);
  const blowing = root.fragment();
  assert.ok(blowing.gust > 0.9, `the squall is up (${blowing.gust})`);
  assert.ok(blowing.grassWind > restGrass * 2, `the meadow lies over (${blowing.grassWind} vs ${restGrass})`);
  assert.ok(blowing.rainLean > restLean * 2, `and the shower leans with it (${blowing.rainLean})`);

  // and it passes on its own, all the way back to the weather it found
  run(14);
  const after = root.fragment();
  assert.ok(after.gust < 0.01, `it blows itself out (${after.gust})`);
  assert.equal(after.grassWind, restGrass, 'the meadow gets its own wind back, to the number');
  assert.equal(after.rainLean, restLean, 'and the rain falls the way it did');
});

test('case 34: leaving the page mid-squall does not take the weather along', () => {
  // the trees' wind is one module-level uniform shared by every tree in the
  // book, so the release has to happen on dispose as well as on the decay
  const { root, run, body, aimAt, tap } = staged();
  aimAt(body);
  tap();
  run(0.5);
  assert.ok(foliageWind() > 1.5, 'the wood is working while the page is open');
  root.dispose();
  assert.ok(Math.abs(foliageWind() - 1) < 1e-9, 'and is handed back on the way out');
});

test('case 34: it is a real shower — more drops than the kit default', () => {
  const { root } = staged();
  assert.ok(root.fragment().drops >= 700, `the book's rain case carries them (${root.fragment().drops})`);
});
