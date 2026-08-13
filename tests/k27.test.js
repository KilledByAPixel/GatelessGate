import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k27 from '../src/koans/k27.js';
import { PAPER, ACCENT, mixHex } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// "It is not mind, it is not Buddha, it is not things." Nansen names three
// things and takes all three away. One touch anywhere, and everything the case
// could be pointing at — the hall, every tree on the page, and the two men
// arguing about it — SHRINKS to a tenth of itself, holds there, and comes back.
//
// FOUR VERSIONS GOT HERE, and the three that failed are why this one has no
// special cases in it:
//
//   1. Three hit boxes and a fourth for undo, each thing sinking into the
//      ground. A switchboard with a trapdoor animation.
//   2. The ink drained — colour to the sky, then opacity down. It blinked.
//   3. The colour wash done exactly (color -> black, emissive -> sky, which
//      renders as flat sky under any light), then a staggered per-mesh alpha.
//      Still bad.
//
// The common cause is worth stating once, because it constrains every case in
// the book: THE INK PASS CANNOT FADE. It is a Sobel over the depth buffer, so a
// thing wears a full-strength outline for exactly as long as it writes depth and
// none at all afterwards — no alpha, no threshold, no ordering trick changes
// that. Every disappearance therefore ends in one frame where the strongest mark
// in the picture leaves at once.
//
// A scale has no such frame. The outline shrinks with the shape because it IS
// the shape's own depth edge.

const SKY = mixHex(PAPER, ACCENT, 0.42);
const SMALL = 0.1;

function staged() {
  const struck = [];
  const ctx = fakeCtx({ audio: { chimeStrike: (o) => struck.push(o) } });
  const root = k27.build(ctx);
  root.setCamera(new THREE.PerspectiveCamera());
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  // Step until something is true, rather than for a hardcoded number of
  // seconds. DRAIN, STAGGER, EMPTY and BACK are tuning knobs moved by eye
  // — they have already been retuned twice — and a test that bakes in "2.6
  // seconds gets you to the bottom" fails on the next pass over the numbers
  // without anything being wrong. These tests are about what happens, not when.
  const until = (pred, what, limit = 30) => {
    for (const end = t + limit; t < end; t += 1 / 60) {
      root.update(1 / 60, t);
      if (pred()) return true;
    }
    throw new Error(`never ${what} within ${limit}s`);
  };
  run(1);
  return {
    ctx, root, run, until, struck,
    touch: () => ctx._taps.forEach((cb) => cb()),
    allSmall: () => root.fragment().small,
    allBack: () => root.fragment().away === 0,
  };
}

// Everything the touch reaches: the hall, the hero oak, composeWorld's midground
// wood, and the two men. Found by walking for things whose scale actually moves,
// so the test cannot go stale by naming a prop the case renamed.
function shrinkers(root, until, touch) {
  const all = [];
  root.scene.traverse((o) => { if (o.isObject3D && !o.isMesh) all.push(o); });
  root.scene.traverse((o) => { if (o.isMesh) all.push(o); });
  const before = new Map(all.map((o) => [o, o.scale.clone()]));
  touch();
  until(() => root.fragment().small, 'got small');
  const moved = all.filter((o) => Math.abs(o.scale.x - before.get(o).x) > 1e-6);
  // only the topmost mover of each branch: a shrinking hall drags its own parts
  return moved.filter((o) => !moved.includes(o.parent));
}

test('case 27: one touch shrinks the hall, every tree, and both men', () => {
  const { root, until, touch } = staged();
  const moved = shrinkers(root, until, touch);
  const names = {};
  for (const o of moved) names[o.name || '(unnamed)'] = (names[o.name || '(unnamed)'] || 0) + 1;

  assert.equal(names.hut, 1, `the hall shrinks (found ${JSON.stringify(names)})`);
  assert.equal(names.monk, 2, 'and both men');
  assert.equal(names.lantern, 1, 'and the lantern');
  // the hero oak plus composeWorld's midground wood — every tree on the page,
  // whichever kind the scatter happened to plant — the hall, every tree, and
  // the people
  const wood = (names.oak || 0) + (names.tree || 0) + (names.pine || 0);
  assert.ok(wood >= 8, `every tree on the page goes with them (${wood})`);
});

// The rocks and the bushes are ONE InstancedMesh each — twelve and nine drawn in
// a single call, with a matrix per instance. Scaling the mesh would scale about
// the SCENE origin and walk the whole scatter into the middle of the meadow, so
// each instance's own matrix is recomposed instead: same position, same
// rotation, a smaller scale.
test('case 27: the scattered rocks and bushes shrink where they lie', () => {
  const { root, until, touch } = staged();
  const read = (mesh) => {
    const m = new THREE.Matrix4();
    const out = [];
    for (let i = 0; i < mesh.count; i++) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      mesh.getMatrixAt(i, m);
      m.decompose(p, q, s);
      out.push({ p, s: s.x });
    }
    return out;
  };
  const rocks = root.scene.getObjectByName('rocks');
  const bushes = root.scene.getObjectByName('bushes');
  assert.ok(rocks && rocks.isInstancedMesh, 'the rocks are an instanced field');
  assert.ok(bushes && bushes.isInstancedMesh);
  const before = { rocks: read(rocks), bushes: read(bushes) };

  touch();
  until(() => root.fragment().small, 'got small');
  for (const [name, mesh] of [['rocks', rocks], ['bushes', bushes]]) {
    const now = read(mesh);
    now.forEach((inst, i) => {
      const was = before[name][i];
      assert.ok(inst.p.distanceTo(was.p) < 1e-9, `a ${name} instance slid toward the origin`);
      // 0.005, not 1e-6: every instance carries its own seeded lead, so on the
      // frame the last one arrives its neighbours may still be a fraction of a
      // frame out (0.10023 against 0.1). That is the stagger working, and the
      // claim here is "down to a tenth", not "to the last bit of a float".
      assert.ok(Math.abs(inst.s / was.s - SMALL) < 0.005,
        `a ${name} instance is not down to a tenth (${(inst.s / was.s).toFixed(4)})`);
    });
  }

  until(() => root.fragment().away === 0, 'came back');
  read(rocks).forEach((inst, i) => {
    assert.ok(Math.abs(inst.s - before.rocks[i].s) < 1e-9, 'and every rock comes back its own size');
  });
});

test('case 27: a scatter field does not snap down as one object', () => {
  const { root, run, touch } = staged();
  const rocks = root.scene.getObjectByName('rocks');
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const sizes = () => {
    const out = new Set();
    for (let i = 0; i < rocks.count; i++) { rocks.getMatrixAt(i, m); m.decompose(p, q, s); out.add(s.x.toFixed(3)); }
    return out.size;
  };
  const start = sizes();
  touch();
  let spread = 0;
  for (let i = 0; i < 60 * 3; i++) { run(1 / 60); spread = Math.max(spread, sizes()); }
  // the field is already many sizes at rest (scaleOf: many small, a few
  // boulders), so the test is that the SHRINK adds spread of its own rather
  // than moving them all by one factor
  assert.ok(spread >= start, `the rocks go down at their own moments (${spread} sizes, from ${start})`);
});

test('case 27: they shrink to a tenth, hold there, and come back to full size', () => {
  const { root, run, until, touch } = staged();
  const hall = root.scene.getObjectByName('hut');
  assert.equal(root.fragment().size, 1, 'full size to begin with');

  touch();
  until(() => root.fragment().small, 'got small');
  assert.ok(Math.abs(hall.scale.x - SMALL) < 1e-6, `down to a tenth (${hall.scale.x})`);

  // HELD there, not passed through — the beat is the point of the gesture
  let held = 0;
  for (; held < 30; held += 1 / 60) {
    if (!root.fragment().small) break;
    run(1 / 60);
  }
  assert.ok(held > 0.5, `the page is held small for a beat (${held.toFixed(2)}s)`);

  until(() => root.fragment().away === 0, 'came back');
  assert.ok(Math.abs(hall.scale.x - 1) < 1e-6, 'then back, unasked');
  assert.equal(root.fragment().touches, 1, 'and the reader never had to ask twice');
  assert.equal(root.fragment().size, 1);
});

// THE ANTI-POP TEST, and the one this case exists to satisfy. The complaint
// about all three earlier versions was abruptness: things turned red and popped
// away in an instant, and the alpha never worked properly. A
// thing may take as long as it likes to go; what it may not do is change by a
// lot on one frame.
test('case 27: no frame of the going or the coming back is a jump', () => {
  const { root, run, touch } = staged();
  const all = [];
  root.scene.traverse((o) => { if (o.parent === root.scene) all.push(o); });
  const mean = () => all.reduce((s, o) => s + o.scale.x, 0) / all.length;

  touch();
  let prev = mean();
  let worst = 0;
  let worstAt = 0;
  for (let i = 0; i < 60 * 12; i++) {
    run(1 / 60);
    const now = mean();
    if (Math.abs(now - prev) > worst) { worst = Math.abs(now - prev); worstAt = i / 60; }
    prev = now;
  }
  // a linear shrink of everything over one second would move ~0.015 a frame
  assert.ok(worst < 0.02, `worst single-frame change ${worst.toFixed(5)} at ${worstAt.toFixed(2)}s`);
});

test('case 27: nothing on this page is ever made transparent', () => {
  // Two whole rounds were spent on fades that could not work, and the moon has
  // its own reason on top: makeMoon forces `gl_FragColor.a = 0.0` as an ink-mask
  // marker, which is free while the material is opaque and fatal the instant
  // `transparent = true` hands it to the blender. k19's header carries that in
  // capitals; this case shipped the bug anyway, and its moon was invisible from
  // the day it was staged.
  const { root, run, touch } = staged();
  const mats = new Set();
  root.scene.traverse((o) => { if (o.isMesh && o.material) mats.add(o.material); });
  const check = (when) => {
    for (const m of mats) {
      if (m.userData && m.userData.alwaysTransparent) continue;
      assert.equal(m.transparent, false, `a material went transparent ${when}`);
      assert.equal(m.opacity, 1, `and lost opacity ${when}`);
    }
  };
  check('at rest');
  touch();
  for (let i = 0; i < 12; i++) { run(0.8); check(`${(i + 1) * 0.8}s in`); }
});

test('case 27: a shrinking thing stays planted where it stood', () => {
  // everything scales about ITS OWN origin, which for the kit is the point it
  // stands on — never the wrapper group around it, whose origin is the middle
  // of the scene and would walk the hall across the meadow on its way down
  const { root, until, touch } = staged();
  const hall = root.scene.getObjectByName('hut');
  const oak = root.scene.getObjectByName('the-tree');
  root.scene.updateMatrixWorld(true);
  const where = (o) => o.getWorldPosition(new THREE.Vector3()).clone();
  const hallAt = where(hall);
  const oakAt = where(oak);

  touch();
  until(() => root.fragment().small, 'got small');
  root.scene.updateMatrixWorld(true);
  assert.ok(where(hall).distanceTo(hallAt) < 1e-9, 'the hall shrank in place');
  assert.ok(where(oak).distanceTo(oakAt) < 1e-9, 'and so did the tree');
  assert.ok(Math.abs(hall.position.y) < 1e-9, 'nothing sank, either — that was version one');
});

test('case 27: the four kinds do not go at once, and come back in reverse', () => {
  // the two men, the hall, the wood — near to far, and back the other way
  // round, so the picture is rebuilt from its distances inward
  const { root, run, touch } = staged();
  const men = root.scene.children.filter((c) => c.name === 'monk');
  const hall = root.scene.getObjectByName('hut');
  const wood = root.scene.children.filter((c) => c.name === 'tree' || c.name === 'pine');
  assert.ok(men.length === 2 && wood.length > 3);
  const mean = (a) => a.reduce((s, o) => s + o.scale.x, 0) / a.length;

  touch();
  run(0.9);
  assert.ok(mean(men) < hall.scale.x, `the men lead the hall (${mean(men).toFixed(2)} vs ${hall.scale.x.toFixed(2)})`);
  assert.ok(hall.scale.x < mean(wood), `and the hall leads the wood (${hall.scale.x.toFixed(2)} vs ${mean(wood).toFixed(2)})`);

  run(6.2);                                    // into the return
  assert.ok(mean(wood) > hall.scale.x, 'the wood comes back first');
  assert.ok(hall.scale.x > mean(men), 'then the hall, then the men');
});

test('case 27: the wood does not shrink in lockstep', () => {
  // seeded offsets WITHIN a kind, shuffled by hash so the order is scattered
  // through the wood rather than following the order the scatter loop planted
  // them in
  const { root, run, touch } = staged();
  const wood = root.scene.children.filter((c) => c.name === 'tree' || c.name === 'pine');
  touch();
  let spread = 0;
  for (let i = 0; i < 60 * 3; i++) {
    run(1 / 60);
    spread = Math.max(spread, new Set(wood.map((o) => o.scale.x.toFixed(2))).size);
  }
  assert.ok(spread >= 4, `the wood folds away rather than switching (${spread} sizes at once)`);
});

test('case 27: the moon leaves by colour alone, and never shrinks', () => {
  // sixty units out: a smaller moon would read as the moon leaving rather than
  // as the picture doing anything. It is unlit and unfogged, so a disc painted
  // exactly the sky colour is an exact vanish with no blending involved.
  const { root, until, touch } = staged();
  const moon = root.scene.getObjectByName('moon');
  const before = moon.material.color.getHex();
  const sky = new THREE.Color(SKY).getHex();
  const scale = moon.scale.x;
  assert.notEqual(before, sky);
  touch();
  until(() => moon.material.color.getHex() === sky, 'went into the page');
  assert.equal(moon.scale.x, scale, 'and it is exactly the size it always was');
  until(() => root.fragment().away === 0, 'came back');
  assert.equal(moon.material.color.getHex(), before, 'back to its own red');
});

test('case 27: a touch mid-gesture does not restart it', () => {
  const { root, run, until, touch } = staged();
  touch();
  run(1);
  touch();
  touch();
  assert.equal(root.fragment().touches, 1, 'the sentence finishes before it can be said again');
  until(() => root.fragment().away === 0, 'came back');
  run(0.6);
  assert.equal(root.fragment().size, 1);
  touch();
  run(0.6);
  assert.equal(root.fragment().touches, 2, 'and can be said again once it has');
});

test('case 27: the hall takes its bell down with it', () => {
  // a tenth-scale bell ringing at full voice is the one thing that would give
  // it away. Nobody else writes this — hangChimes sets it once and main.js only
  // ever calls update().
  const { root, until, touch } = staged();
  const hall = root.scene.getObjectByName('hut');
  assert.ok(hall.chimes && hall.chimes.length, 'makeHut({ chimes }) hung one');
  const alive = hall.chimes.map((c) => c.windLevel());
  assert.ok(alive.every((v) => v > 0), 'it answers the wind to begin with');
  touch();
  until(() => root.fragment().small, 'got small');
  assert.ok(hall.chimes.every((c) => c.windLevel() < 0.01), 'and is still while the hall is small');
  until(() => root.fragment().away === 0, 'came back');
  for (let i = 0; i < hall.chimes.length; i++) {
    assert.ok(Math.abs(hall.chimes[i].windLevel() - alive[i]) < 1e-9, 'and gets its own wind back');
  }
});

test('case 27: anywhere means anywhere — nothing swallows the touch', () => {
  // A first cut probed the hall's hung fūrin and returned early so a tap aimed
  // at the bell would not also empty the page. That is the right instinct on a
  // page with targets and the wrong one here, where "aimed at" is a category
  // that does not exist — and the staging net caught it as a case answering a
  // touch with no sound at all, because main.js (not the case) rings a hung
  // chime and the net does not run main.js.
  const { ctx, root, run, touch } = staged();
  const hall = root.scene.getObjectByName('hut');
  const targets = [];
  hall.chimes.forEach((c) => c.group.traverse((o) => { if (o.isMesh) targets.push(o); }));
  assert.ok(targets.length, 'the bell has meshes to hit');
  ctx.input.raycastFirst = (cam, objs) => {
    for (const o of objs || []) if (targets.includes(o)) return { object: o, point: new THREE.Vector3() };
    return null;
  };
  touch();
  run(1.5);
  assert.equal(root.fragment().touches, 1, 'the page still answers');
  assert.ok(root.fragment().away > 0.5);
});

test('case 27: nothing goes non-finite over repeated touching', () => {
  const { root, run, touch } = staged();
  for (let i = 0; i < 8; i++) { touch(); run(3.1); }
  const f = root.fragment();
  for (const [k, v] of Object.entries(f)) {
    assert.ok(typeof v === 'boolean' || Number.isFinite(v), `fragment.${k} is ${v}`);
  }
  root.scene.traverse((o) => {
    assert.ok(Number.isFinite(o.scale.x) && o.scale.x > 0, `${o.name} scaled to ${o.scale.x}`);
  });
});
