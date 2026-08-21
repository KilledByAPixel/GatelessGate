import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k20 from '../src/koans/k20.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';
import { groundHeight } from '../src/kit/ground.js';

// Case 20 on the coast. The case's two facts, pinned:
//
//   1. The man is immovable and everything else is not — he hangs off the
//      scene ROOT while the entire world, ocean included, sits in the
//      `moving` group. "If the feet of enlightenment moved, the great ocean
//      would overflow" — so when you push him, the ocean itself sways.
//   2. The coast layout: sea to the front (-z), ground diving below sea level
//      seaward, sand between, and no mountain standing in the water.

function staged() {
  const ctx = fakeCtx();
  const root = k20.build(ctx);
  // a real camera, not `{}` — the kept-verbatim push handler reads
  // camera.position to compute the shove direction (see k12/k16/k19/k46/k47
  // and staging.test.js's own rigCamera() for the same convention)
  root.setCamera(new THREE.PerspectiveCamera());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return { ctx, root };
}

test('case 20: the ambience finally names water — the bed the ocean was kept for', () => {
  const layers = k20.ambience.map((t) => String(t).split(':')[0]);
  assert.ok(layers.includes('water'), `no water in [${k20.ambience}]`);
  assert.ok(layers.includes('wind'));
});

// The world hangs FLAT off the scene root. It used to ride a group a tap
// shoved and let oscillate back — and sliding it dragged the grass field
// through its own world-space noise, so the meadow boiled. The flat parenting
// is the invariant; anything animated must be a prop of its own.
test('case 20: the world is flat on the scene root', () => {
  const { root } = staged();
  const man = root.scene.getObjectByName('immovable-man');
  assert.ok(man, 'the man is there');
  assert.equal(man.parent, root.scene, 'the man hangs off the root');
  for (const name of ['water', 'sand', 'ground']) {
    const o = root.scene.getObjectByName(name);
    assert.ok(o, name + ' is staged');
  }
  // and composeWorld was handed the actual scene, which is the only place the
  // workbench's layout guides look for their record
  assert.ok(root.scene.userData.layout, 'scene.userData.layout is where the guides read it');
});

test('case 20: the sea is seaward, at sea level, below the meadow', () => {
  const { root } = staged();
  const water = root.scene.getObjectByName('water');
  assert.ok(water.position.y < 0, `the sheet floats at ${water.position.y}`);
  assert.ok(water.position.z < -20, 'the ocean lies off the -z shore');
});

test('case 20: the ground dives below sea level toward the sea', () => {
  const { root } = staged();
  const ground = root.scene.getObjectByName('ground');
  const pos = ground.geometry.attributes.position;
  let sank = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < -14 && pos.getY(i) < -0.4) sank++;
  }
  assert.ok(sank > 50, `the seabed did not sink (${sank})`);
});

// The shove became a squall — the weather moves instead of the world. The verse
// is unchanged — the world moves and he does not — but what moves is the
// weather.
test('case 20: a touch brings the wind through, and never moves the man', () => {
  const { ctx, root } = staged();
  // the SEA is the target now, not the man — he answers to nothing
  const hit = root.scene.getObjectByName('surface');
  const man = root.scene.getObjectByName('immovable-man');
  const before = man.position.clone();

  root.update(1 / 60, 0.1);
  const calm = root.fragment();
  assert.equal(calm.gusts, 0);
  assert.equal(calm.gust, 0, 'no wind until it is asked for');

  ctx.input.raycastFirst = () => ({ object: hit, point: new THREE.Vector3(), distance: 1 });
  ctx._taps.forEach((cb) => cb());
  root.update(1 / 60, 0.5);                    // into the squall's rise
  const f = root.fragment();
  assert.equal(f.gusts, 1);
  assert.ok(f.gust > 0.5, `the wind came up (${f.gust})`);
  assert.ok(f.wind > calm.wind, 'and it is blowing harder than the weather it found');

  // and it passes on its own, all the way back to rest
  for (let i = 0; i < 60 * 9; i++) root.update(1 / 60, 0.5 + i / 60);
  const after = root.fragment();
  assert.equal(after.gust, 0, 'the squall blows itself out exactly');
  assert.equal(after.manX, 0.4, 'he has not moved');
  assert.equal(after.manZ, -0.8);
  assert.ok(before.distanceTo(man.position) < 1e-9, 'he never moved at any point');
});

test('case 20: the ocean is actually swelling, not a still sheet', () => {
  const { root } = staged();
  const surface = root.scene.getObjectByName('surface');
  const at = (t) => { root.update(1 / 60, t); return Array.from(surface.geometry.attributes.position.array); };
  assert.notDeepEqual(at(1.0), at(4.0), 'no drift: the ocean is a floor');
});

test('case 20: the foam rides the beach', () => {
  const { root } = staged();
  const foam = root.scene.getObjectByName('foam');
  assert.ok(foam, 'the wave-ends are staged on the shore');
  root.update(1 / 60, 2.0);
  const a = Array.from(foam.geometry.attributes.position.array);
  root.update(1 / 60, 5.0);
  const b = Array.from(foam.geometry.attributes.position.array);
  assert.notDeepEqual(a, b, 'the foam is alive');
});

test('case 20: the surf breathes — update feeds the swell to the audio', () => {
  const calls = [];
  const ctx = fakeCtx();
  ctx.audio = { knock() {}, setWaterSwell: (v) => calls.push(v) };
  const root = k20.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  for (let t = 0; t < 8; t += 0.5) root.update(1 / 60, t);
  assert.ok(calls.length >= 16, 'the swell is driven every update');
  assert.ok(calls.every((v) => v >= 0 && v <= 1), 'the drive stays in 0..1');
  const spread = Math.max(...calls) - Math.min(...calls);
  assert.ok(spread > 0.3, `the surf actually breathes (spread ${spread})`);
});

// The squall drives the sea two ways — faster AND higher. Pace alone read as
// the film being sped up rather than as weather: the waves have to get BIGGER,
// not just arrive sooner.
test('case 20: the squall raises the sea, and puts it back', () => {
  const { ctx, root } = staged();
  const surface = root.scene.getObjectByName('surface');
  const span = () => {
    const p = surface.geometry.attributes.position;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
    return hi - lo;
  };
  let t = 0;
  let calm = 0;
  for (; t < 4; t += 1 / 60) { root.update(1 / 60, t); calm = Math.max(calm, span()); }
  assert.equal(root.fragment().seaLift, 1, 'the sea rests at its own height');

  ctx.input.raycastFirst = () => ({ object: surface, point: new THREE.Vector3(), distance: 1 });
  ctx._taps.forEach((cb) => cb());
  let rough = 0;
  for (const end = t + 4; t < end; t += 1 / 60) { root.update(1 / 60, t); rough = Math.max(rough, span()); }
  assert.ok(rough > calm * 1.5, `the crests genuinely grow (${calm.toFixed(3)} -> ${rough.toFixed(3)})`);
  assert.ok(root.fragment().seaLift > 1.5, 'and the case says so');

  for (const end = t + 9; t < end; t += 1 / 60) root.update(1 / 60, t);
  assert.equal(root.fragment().seaLift, 1, 'the squall hands the sea back exactly');
  assert.equal(root.fragment().seaRush, 0);
});

// THE SHEET RUNS UNDER THE LAND. The ocean here is 150 metres square and sits
// well below the meadow it is hidden by, and input.raycastFirst only ever tests
// what it is handed — so "did the ray reach the water" is not the same question
// as "did you touch the water", and asking the first one made every click below
// the horizon a squall. Driven through a REAL raycast from the case's own
// framing rather than a stub, because a stub cannot reproduce a bug whose whole
// substance is which surface the ray met first.
function aimedAt(camera, target) {
  const ndc = target.clone().project(camera);
  assert.ok(Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
    `the probe must aim at something actually on screen (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
  const ray = new THREE.Raycaster();
  return (cam, objs) => {
    ray.setFromCamera({ x: ndc.x, y: ndc.y }, cam);
    const hits = ray.intersectObjects(objs, false);
    return hits.length ? hits[0] : null;
  };
}

test('case 20: only the sea brings the wind, though the sheet runs under the land', () => {
  const shot = () => {
    const ctx = fakeCtx();
    const root = k20.build(ctx);
    root.setCamera(rigCamera(k20.camera));
    root.update(1 / 60, 0);
    root.scene.updateMatrixWorld(true);
    return { ctx, root, camera: rigCamera(k20.camera) };
  };

  // a point on the MEADOW, well landward of the waterline (SHORE.dist 8 out
  // along -z), and low in the frame — the foreground grass a reader taps
  const onLand = new THREE.Vector3(0.9, groundHeight(0.9, 1.2, { seed: 21 }), 1.2);
  const land = shot();
  const surface = land.root.scene.getObjectByName('surface');
  const ground = land.root.scene.getObjectByName('ground');
  assert.ok(surface && ground, 'the sea and the earth are both named');

  // the teeth of it: from here the ray DOES reach the water, a stride or two
  // past the grass and still nowhere near the sea. That is the whole trap.
  const aim = aimedAt(land.camera, onLand);
  const reaches = aim(land.camera, [surface]);
  assert.ok(reaches, 'the sheet really is under the meadow — otherwise this test proves nothing');
  assert.ok(reaches.point.z > -8, `and the crossing is inland: z ${reaches.point.z.toFixed(2)}`);

  land.ctx.input.raycastFirst = aim;
  land.ctx._taps.forEach((cb) => cb());
  land.root.update(1 / 60, 0.5);
  assert.equal(land.root.fragment().gusts, 0, 'a tap on the grass is not a tap on the ocean');
  assert.equal(land.root.fragment().gust, 0, 'and no weather came');
  assert.equal(land.ctx._touched, 0, 'nor did the page claim it had answered');

  // and the sea itself still does, out past the shallows where the bed has
  // dropped below the sheet and the water is genuinely the nearest thing
  const sea = shot();
  sea.ctx.input.raycastFirst = aimedAt(sea.camera, new THREE.Vector3(0.9, -0.35, -18));
  sea.ctx._taps.forEach((cb) => cb());
  sea.root.update(1 / 60, 0.5);
  assert.equal(sea.root.fragment().gusts, 1, 'the ocean answers');
  assert.ok(sea.root.fragment().gust > 0.5, 'and the wind comes through');
  assert.equal(sea.ctx._touched, 1);
});
