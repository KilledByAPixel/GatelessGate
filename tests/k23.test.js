import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBundle } from '../src/kit/bundle.js';
import k23 from '../src/koans/k23.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const box = (o) => new THREE.Box3().setFromObject(o);
const accentHex = new THREE.Color(ACCENT).getHexString();

const fakeCtx = () => sharedCtx({ accent: k23.accent });

// drive a bundle for n frames starting at sim time t0; returns the peak lean
// (group rotation magnitude) seen along the way
function drive(bun, t0, frames, each) {
  let peak = 0;
  for (let i = 1; i <= frames; i++) {
    const t = t0 + i / 60;
    bun.update(1 / 60, t);
    const lean = Math.hypot(bun.group.rotation.x, bun.group.rotation.z);
    peak = Math.max(peak, lean, bun.tilt());
    if (each) each(t, lean);
  }
  return peak;
}

// ---- the kit piece -------------------------------------------------------

test('makeBundle stands from y=0: a robe of folds with the kit bowl seated on top', () => {
  const bun = makeBundle({ seed: 23 });
  assert.equal(bun.group.name, 'bundle');

  const folds = bun.group.children.filter((c) => c.name === 'fold');
  assert.ok(folds.length >= 2 && folds.length <= 3, `a low folded stack, got ${folds.length}`);
  const bowl = bun.group.children.find((c) => c.name === 'bowl');
  assert.ok(bowl, 'the bowl of succession is present');
  // it is the kit bowl, reused — not a rebuild
  const names = bowl.children.map((c) => c.name).sort();
  assert.deepEqual(names, ['foot', 'shell']);

  const b = box(bun.group);
  assert.ok(b.min.y > -0.02 && b.min.y < 0.02, `grounded at y=0, got ${b.min.y}`);
  assert.ok(b.max.y > 0.25 && b.max.y < 0.55, `a low bundle, roughly 0.3-0.4 tall, got ${b.max.y}`);
});

test('the robe is folded cloth: wider than it is tall, and the bowl sits ABOVE it', () => {
  const bun = makeBundle({ seed: 23 });
  const folds = bun.group.children.filter((c) => c.name === 'fold');
  const robe = new THREE.Box3();
  for (const f of folds) robe.union(box(f));
  const w = Math.max(robe.max.x - robe.min.x, robe.max.z - robe.min.z);
  const h = robe.max.y - robe.min.y;
  assert.ok(w > h * 1.5, `folded flat, not stacked tall: ${w} wide vs ${h} tall`);

  const bowl = box(bun.group.children.find((c) => c.name === 'bowl'));
  assert.ok(bowl.min.y > robe.max.y - 0.03, `bowl seated on the robe, not inside it: ${bowl.min.y} vs robe top ${robe.max.y}`);
  assert.ok(bowl.max.y > robe.max.y, 'and it rises above the cloth');
});

test('budge() is the smallest possible motion: a capped tilt that settles all the way back', () => {
  const bun = makeBundle({ seed: 23 });
  drive(bun, 0, 30);                        // half a second of nothing
  assert.equal(bun.tilt(), 0, 'at rest until asked');

  assert.equal(bun.budge(2.5), true, 'a fresh attempt registers');
  const peak = drive(bun, 0.5, 60);         // the whole 0.8s motion and a bit over
  assert.ok(peak > 0.015, `it does move — barely: ${peak}`);
  assert.ok(peak < 0.05, `but never past the cap: ${peak}`);

  drive(bun, 1.5, 30);
  assert.equal(bun.tilt(), 0, 'settled');
  assert.ok(Math.hypot(bun.group.rotation.x, bun.group.rotation.z) < 1e-6, 'back to exactly rest');
  // and it never lifted or slid — the refusal is rotational only
  assert.deepEqual(bun.group.position.toArray(), [0, 0, 0]);
  assert.equal(bun.group.rotation.y, 0, 'budge never touches the yaw');
  assert.equal(bun.budges(), 1);
});

test('hammering budge() never accumulates past the cap, and absorbed attempts do not count', () => {
  const bun = makeBundle({ seed: 23 });
  let peak = 0, calls = 0;
  for (let i = 1; i <= 180; i++) {          // three seconds of constant grabbing
    const t = i / 60;
    bun.budge(0.7); calls++;
    bun.update(1 / 60, t);
    peak = Math.max(peak, Math.hypot(bun.group.rotation.x, bun.group.rotation.z), bun.tilt());
  }
  assert.ok(peak < 0.05, `no escalation, ever: ${peak}`);
  assert.ok(bun.budges() >= 2, 'fresh attempts after each settle still answer');
  assert.ok(bun.budges() <= 5, `one motion at a time, got ${bun.budges()} from ${calls} grabs`);
  drive(bun, 3, 80);
  assert.equal(bun.tilt(), 0, 'and it always comes back to rest');
});

test('makeBundle is deterministic by seed — geometry and motion both', () => {
  const snapshot = (bun) => {
    const out = [];
    bun.group.traverse((o) => {
      out.push([o.name, o.position.toArray(), [o.rotation.x, o.rotation.y, o.rotation.z], o.scale.toArray(),
        o.isMesh ? Array.from(o.geometry.attributes.position.array) : null]);
    });
    return out;
  };
  assert.deepEqual(snapshot(makeBundle({ seed: 23 })), snapshot(makeBundle({ seed: 23 })));
  assert.notDeepEqual(snapshot(makeBundle({ seed: 23 })), snapshot(makeBundle({ seed: 24 })));

  // identical taps at identical times -> identical refusals
  const trace = () => {
    const bun = makeBundle({ seed: 23 });
    const out = [];
    drive(bun, 0, 10);
    bun.budge(1.1);
    drive(bun, 10 / 60, 70, (t) => out.push(bun.tilt()));
    return out;
  };
  assert.deepEqual(trace(), trace());
});

// ---- the case ------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k23.id, 23);
  assert.equal(k23.slug, 'do-not-think-good-do-not-think-not-good');
  assert.equal(k23.accent, ACCENT);
  assert.equal(k23.tier, 1);
  assert.ok(/think good/i.test(k23.title), `title comes from the text artifact: ${k23.title}`);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k23.text[f] && k23.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.deepEqual(k23.ambience, ['wind:0.22:pine', 'music'], 'high open country gets the full drift, through ridge pines');
  assert.equal(typeof k23.build, 'function');
});

test('build stages ONE man, a stone off the trail, and the treasure on the stone', () => {
  const built = k23.build(fakeCtx());
  assert.ok(built.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }

  const monks = [];
  built.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 1, 'E-myo alone — the patriarch has already withdrawn');

  const stone = built.scene.getObjectByName('stone');
  const bundle = built.scene.getObjectByName('bundle');
  const path = built.scene.getObjectByName('path');
  assert.ok(stone && bundle && path, 'stone, bundle and trail all present');

  // the bundle stands exactly on the stone's flat top
  stone.geometry.computeBoundingBox();
  const topY = stone.position.y + stone.geometry.boundingBox.max.y;
  assert.ok(Math.abs(bundle.position.y - topY) < 1e-6, `bundle sits on the stone top: ${bundle.position.y} vs ${topY}`);
  assert.ok(Math.hypot(bundle.position.x - stone.position.x, bundle.position.z - stone.position.z) < 0.05,
    'centred on the stone');

  // E-myo is a pace short of it: near, reaching, not touching
  const d = Math.hypot(monks[0].position.x - stone.position.x, monks[0].position.z - stone.position.z);
  assert.ok(d > 1.0 && d < 1.8, `one pace from the treasure, got ${d}`);

  // his raised sleeve has been flattened from the sky-pointing stock pose
  // (rotation.z ~2.19) down onto the line to the robe
  const arms = monks[0].children.filter((c) => c.name === 'arm');
  const reach = arms.map((a) => a.rotation.z).sort((a, b) => b - a)[0];
  assert.ok(reach > 1.0 && reach < 1.6, `the reach aims at the bundle, not the sky: ${reach}`);
});

test('robe AND bowl both wear the seal — the pair is the treasure', () => {
  // Frank's call, overriding the draft's grey bowl: the koan hands down the
  // robe and bowl of succession TOGETHER, and colouring only one read as the
  // other mattering less. The whole bundle is the one red thing on the page.
  const built = k23.build(fakeCtx());
  const bundle = built.scene.getObjectByName('bundle');

  const folds = bundle.children.filter((c) => c.name === 'fold');
  for (const f of folds) {
    assert.equal(f.material.color.getHexString(), accentHex, 'the robe is red');
    assert.ok(f.material.emissiveIntensity > 0, 'seal materials glow on their own (SEAL_GLOW)');
  }
  const bowl = bundle.children.find((c) => c.name === 'bowl');
  let bowlRed = 0, bowlMeshes = 0;
  bowl.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material && o.material.color) {
      bowlMeshes++;
      if (o.material.color.getHexString() === accentHex) bowlRed++;
    }
  });
  assert.ok(bowlMeshes > 0 && bowlRed === bowlMeshes, 'the bowl is red with it');

  // and nothing OUTSIDE the bundle carries the accent — the treasure is the
  // page's one red thing
  let strays = 0;
  built.scene.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material && o.material.color
      && o.material.color.getHexString() === accentHex) {
      let p = o, inBundle = false;
      while (p) { if (p === bundle) inBundle = true; p = p.parent; }
      if (!inBundle) strays++;
    }
  });
  assert.equal(strays, 0, 'the bundle is the only red thing on the page');
});

test('the scene runs without a renderer or audio, and reports a finite fragment', () => {
  const built = k23.build(fakeCtx());
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

test('tapping the treasure budges it — once, slightly, and never any more than that', () => {
  const ctx = fakeCtx();
  const built = k23.build(ctx);
  assert.ok(ctx._taps.length > 0, 'there has to be something to find');

  // before a camera exists the tap does nothing (and must not throw)
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().taps, 0);

  built.setCamera(new THREE.PerspectiveCamera());
  const bundle = built.scene.getObjectByName('bundle');
  const fold = bundle.children.find((c) => c.name === 'fold');
  ctx.input.raycastFirst = () => ({ object: fold, point: new THREE.Vector3() });

  let t = 0;
  const step = () => { t += 1 / 60; built.update(1 / 60, t); };
  for (let i = 0; i < 30; i++) step();
  assert.equal(built.fragment().tilt, 0, 'at rest until someone wants it');

  ctx._taps.forEach((cb) => cb(400, 300));
  let peak = 0;
  for (let i = 0; i < 54; i++) {           // 0.9s: the whole refusal
    step();
    peak = Math.max(peak, built.fragment().tilt, Math.hypot(bundle.rotation.x, bundle.rotation.z));
  }
  assert.ok(peak > 0.015, `the treasure answers the hand: ${peak}`);
  assert.ok(peak < 0.05, `as heavy as mountains: ${peak}`);
  assert.equal(built.fragment().taps, 1);
  assert.equal(built.fragment().budges, 1);
  assert.equal(built.fragment().tilt, 0, 'and it has already settled');

  // hammer it for three seconds: no escalation, no reward
  peak = 0;
  for (let i = 0; i < 180; i++) {
    if (i % 3 === 0) ctx._taps.forEach((cb) => cb(400, 300));
    step();
    peak = Math.max(peak, built.fragment().tilt, Math.hypot(bundle.rotation.x, bundle.rotation.z));
  }
  const f = built.fragment();
  assert.ok(peak < 0.05, `sixty grabs, same refusal: ${peak}`);
  assert.ok(f.budges >= 2 && f.budges <= 6, `one motion at a time, got ${f.budges}`);
  assert.ok(f.taps > f.budges, 'attempts mid-refusal are absorbed, not queued');
  for (let i = 0; i < 72; i++) step();
  assert.equal(built.fragment().tilt, 0, 'stillness afterwards, as before');
});
