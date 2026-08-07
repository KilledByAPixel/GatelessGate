import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeOak } from '../src/kit/oak.js';
import { makeTree } from '../src/kit/tree.js';
import k38 from '../src/koans/k38.js';
import { ACCENT, ACCENT_DEEP } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const box = (o) => new THREE.Box3().setFromObject(o);
const width = (o) => { const b = box(o); return Math.max(b.max.x - b.min.x, b.max.z - b.min.z); };

const fakeCtx = () => sharedCtx({ accent: k38.accent });

// ---- the kit piece -------------------------------------------------------

test('makeOak stands on the ground and is one tree, two meshes', () => {
  const oak = makeOak({ height: 5.8, seed: 20 });
  assert.equal(oak.name, 'oak');
  const trunk = oak.children.find((c) => c.name === 'trunk');
  const canopy = oak.children.find((c) => c.name === 'canopy');
  assert.ok(trunk && trunk.isMesh, 'a merged limb mesh');
  assert.ok(canopy && canopy.isMesh, 'a merged foliage mesh');
  assert.equal(oak.children.length, 2, 'two draw calls, however many branches');

  const b = box(oak);
  assert.ok(b.min.y > -0.02 && b.min.y < 0.02, `grounded at y=0, got ${b.min.y}`);
  assert.ok(b.max.y > 5.8 * 0.9, `should reach about its nominal height, got ${b.max.y}`);
});

test('makeOak takes trunk and canopy colours independently — case 38 needs red leaves on grey wood', () => {
  const oak = makeOak({ height: 5.8, seed: 20, canopyColor: ACCENT_DEEP });
  const trunk = oak.children.find((c) => c.name === 'trunk');
  const canopy = oak.children.find((c) => c.name === 'canopy');
  assert.notEqual(trunk.material, canopy.material, 'separate materials, or the seal would paint the wood too');
  assert.equal(canopy.material.color.getHexString(), new THREE.Color(ACCENT_DEEP).getHexString());
  assert.notEqual(trunk.material.color.getHexString(), canopy.material.color.getHexString());
});

test('an oak is broader and heavier than the scatter trees it has to stand out from', () => {
  const oak = makeOak({ height: 5.8, seed: 20 });
  const tree = makeTree({});                       // the default kit tree, height 3.2
  const tall = makeTree({ height: 4.2, seed: 9 }); // the tallest composeWorld ever scatters

  assert.ok(box(oak).max.y > box(tall).max.y + 1.0,
    `oak ${box(oak).max.y} should tower over the tallest scatter tree ${box(tall).max.y}`);
  assert.ok(width(oak) > width(tree) * 1.8,
    `oak spread ${width(oak)} vs kit tree ${width(tree)}`);
  assert.ok(width(oak) > width(tall) * 1.7,
    `oak spread ${width(oak)} vs tall kit tree ${width(tall)}`);

  // and the silhouette itself is different in kind: an oak is wider than it is
  // tall, where the kit tree is a vertical
  const b = box(oak);
  assert.ok(width(oak) / (b.max.y - b.min.y) > 1.05,
    `an oak spreads wider than it stands tall, got ${(width(oak) / (b.max.y - b.min.y)).toFixed(2)}`);
  assert.ok(width(tree) / box(tree).max.y < 1.1, 'the kit tree is not (this would make the test vacuous)');
});

test('the crown is a mass the limbs disappear into, not a hat balanced on top', () => {
  const oak = makeOak({ height: 5.8, seed: 20 });
  const trunk = box(oak.children.find((c) => c.name === 'trunk'));
  const canopy = box(oak.children.find((c) => c.name === 'canopy'));
  assert.ok(canopy.min.y < trunk.max.y, `crown ${canopy.min.y} must swallow the limb tops ${trunk.max.y}`);
  // the bole is short: the crown starts well below halfway up the tree
  assert.ok(canopy.min.y < box(oak).max.y * 0.55, `crown starts low, got ${canopy.min.y}`);
});

test('makeOak is deterministic by seed and offers somewhere for a leaf to let go', () => {
  const verts = (s) => Array.from(
    makeOak({ height: 5.8, seed: s }).children.find((c) => c.name === 'canopy')
      .geometry.attributes.position.array);
  assert.deepEqual(verts(20), verts(20));
  assert.notDeepEqual(verts(20), verts(21));

  const oak = makeOak({ height: 5.8, seed: 20 });
  const canopy = box(oak.children.find((c) => c.name === 'canopy'));
  assert.ok(oak.canopyPoints.length > 8, 'a spot under every clump');
  for (const p of oak.canopyPoints) {
    assert.ok(p.y > canopy.min.y - 0.6 && p.y < canopy.max.y, `anchor inside the crown, got y=${p.y}`);
  }
  // sorted outward, so a caller can take the fringe where a falling leaf is seen
  const r = oak.canopyPoints.map((p) => Math.hypot(p.x, p.z));
  assert.ok(r[0] > r[r.length - 1], 'outermost anchor first');
});

test('the hero limb is tamed by default; `reach` restores it and moves nothing else', () => {
  const H = 5.8;
  const rMax = (o) => Math.max(...o.canopyPoints.map((p) => Math.hypot(p.x, p.z)));
  for (const seed of [5, 20, 38]) {
    const tame = makeOak({ height: H, seed });
    const long = makeOak({ height: H, seed, reach: 1 });
    // tamed: every clump, the hero limb's tip included, finishes at the crown
    // fringe (shell lobes centre out to ~0.44H and are up to ~0.19H fat) —
    // no clump on a spear past it. Frank, overnight pass 2: "that weird
    // extra branch... an extra long branch for some reason."
    assert.ok(rMax(tame) < H * 0.68,
      `seed ${seed}: tamed limb still spears out to ${(rMax(tame) / H).toFixed(2)}H`);
    // asked for, the reach is real — the legacy hanging bough comes back
    assert.ok(rMax(long) > rMax(tame) + H * 0.08,
      `seed ${seed}: reach 1 should out-reach the tamed default`);
    // and it is surgical: the option stretches the hero limb's own clump and
    // nothing else — every other anchor of the same seed is bit-identical,
    // because reach must not reorder the deterministic stream
    const key = (p) => p.toArray().map((v) => v.toFixed(4)).join(',');
    const tameSet = new Set(tame.canopyPoints.map(key));
    const moved = long.canopyPoints.filter((p) => !tameSet.has(key(p)));
    assert.equal(moved.length, 1, `seed ${seed}: exactly one clump moves, got ${moved.length}`);
  }
});

// ---- the case ------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k38.id, 38);
  assert.equal(k38.slug, 'an-oak-tree-in-the-garden');
  assert.equal(k38.accent, ACCENT);
  assert.ok(k38.tier === 1 || k38.tier === 2);
  assert.ok(/oak/i.test(k38.title), `title comes from the text artifact: ${k38.title}`);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k38.text[f] && k38.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.equal(typeof k38.build, 'function');
});

test('build stages one great red oak, two men, and ordinary grey trees', () => {
  const built = k38.build(fakeCtx());
  assert.ok(built.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }

  const oaks = [], trees = [], monks = [];
  built.scene.traverse((o) => {
    if (o.name === 'oak') oaks.push(o);
    if (o.name === 'tree') trees.push(o);
    if (o.name === 'monk') monks.push(o);
  });
  assert.equal(oaks.length, 1, 'exactly one oak — the whole answer is "that one"');
  assert.equal(monks.length, 2, 'Joshu and the monk who asked');
  assert.ok(trees.length >= 3, 'ordinary trees elsewhere in the garden');

  // the seal: the oak's LEAVES are red, its wood is not, and no scatter tree is
  const oak = oaks[0];
  const canopy = oak.children.find((c) => c.name === 'canopy');
  const trunk = oak.children.find((c) => c.name === 'trunk');
  const deep = new THREE.Color(ACCENT_DEEP).getHexString();
  assert.equal(canopy.material.color.getHexString(), deep, 'the canopy carries the seal');
  assert.notEqual(trunk.material.color.getHexString(), deep, 'the wood stays on the grey ramp');
  for (const t of trees) {
    const c = t.children.find((x) => x.name === 'canopy');
    assert.notEqual(c.material.color.getHexString(), deep, 'no other tree wears the seal');
  }

  // and it towers over every ordinary tree in the scene
  const oakTop = box(oak).max.y;
  for (const t of trees) assert.ok(oakTop > box(t).max.y + 1.0, 'the oak is the biggest thing growing');
});

test('the scene runs without a renderer or audio, and reports a finite fragment', () => {
  const built = k38.build(fakeCtx());
  built.setCamera(null);
  built.onEnter && built.onEnter();      // audio is null: must not throw
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  built.onExit && built.onExit();
  built.dispose();
});

test('the case wires a tap, and touching the oak sheds leaves', () => {
  const ctx = fakeCtx();
  const built = k38.build(ctx);
  assert.ok(ctx._taps.length > 0, 'there has to be something to find');

  const oak = built.scene.getObjectByName('oak');
  const canopy = oak.children.find((c) => c.name === 'canopy');
  built.setCamera(new THREE.PerspectiveCamera());

  assert.equal(built.fragment().falling, 0, 'nothing falls until it is touched');
  ctx.input.raycastFirst = () => ({ object: canopy, point: new THREE.Vector3(-2.4, 2.6, -1.4) });
  ctx._taps.forEach((cb) => cb(400, 300));
  const after = built.fragment();
  assert.ok(after.falling >= 2, `a few leaves let go, got ${after.falling}`);
  assert.equal(after.taps, 1);

  // they are real meshes, they start up in the crown rather than at the world
  // origin, and they go DOWN
  const leaves = [];
  built.scene.traverse((o) => { if (o.name === 'leaf') leaves.push(o); });
  const airborne = leaves.filter((l) => l.visible);
  assert.ok(airborne.length >= 2, 'the leaves that let go are visible');
  const startY = airborne.map((l) => l.position.y);
  for (const y of startY) assert.ok(y > 1.5, `a leaf lets go from the crown, not the ground: ${y}`);
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  airborne.forEach((l, i) => {
    assert.ok(l.position.y < startY[i], `leaf ${i} drifts down: ${startY[i]} -> ${l.position.y}`);
  });
});

test('leaves are a pool, not a leak — the ground never fills up', () => {
  const ctx = fakeCtx();
  const built = k38.build(ctx);
  const oak = built.scene.getObjectByName('oak');
  built.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = () => ({
    object: oak.children[1], point: new THREE.Vector3(-2.4, 2.6, -1.4),
  });

  const total = built.fragment().falling + built.fragment().idle;
  let peak = 0;
  // hammer it: a tap every half second for four minutes of sim
  for (let i = 0; i < 60 * 240; i++) {
    if (i % 30 === 0) ctx._taps.forEach((cb) => cb(400, 300));
    built.update(1 / 60, i / 60);
    const f = built.fragment();
    peak = Math.max(peak, f.falling);
    assert.equal(f.falling + f.idle, total, 'every leaf is either falling or in the pool');
  }
  assert.ok(peak <= total, `never more leaves in the air than exist: ${peak}`);

  const leaves = [];
  built.scene.traverse((o) => { if (o.name === 'leaf') leaves.push(o); });
  assert.equal(leaves.length, total, 'no leaf meshes were ever created beyond the pool');

  // and once you stop touching it, the garden clears itself
  for (let i = 0; i < 60 * 30; i++) built.update(1 / 60, i / 60);
  assert.ok(built.fragment().falling <= 1, 'settles back to at most the ambient one');
});
